/**
 * Tests for P1-11 Approvals (human in the loop).
 *
 * Covers all requirements in docs/spec/PHASE-1.md P1-11:
 * - approve runs the tool with the edited args
 * - reject returns REJECTED to the model
 * - expiry
 * - wrong user gets 403
 * - double decision gets 409
 * - target revision changed means CONFLICT and no write
 * - access revoked between request and approve means NOT_ALLOWED
 * - a replay of an executed approval returns the stored result without a second side effect
 * - abort while waiting becomes cancelled
 * - audit rows written in order
 * - with the flag off the tool isn't offered
 * - with the flag on but no approver the refusal is immediate (no row, no card, no TTL wait)
 * - MCP confirm tools walk the same ladder: row, both audit rows, replay without a second call
 * - edited args cannot move the action to a different target (400, the card stays pending)
 * - failure paths: 400 on invalid decision/args, 404 on missing approval, 401 unauthenticated
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { z } from "zod";

// In-memory mock storage for approvals and audit logs
interface StoredApproval {
  id: string;
  userId: number;
  sessionId: string | null;
  runId: string;
  tool: string;
  risk: string;
  args: any;
  argsHash: string;
  targetRef: string | null;
  targetRevision: string | null;
  preview: any;
  status: string;
  decidedArgs?: any;
  decidedAt?: Date | null;
  executedAt?: Date | null;
  result?: any;
  expiresAt: Date;
  createdAt: Date;
}

interface StoredAudit {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata?: any;
  status: string;
  severity: string;
  createdAt: number;
}

const mockApprovalsStore = new Map<string, StoredApproval>();
const mockAuditStore: StoredAudit[] = [];

// Mock DB
vi.mock("../db", () => {
  return {
    getDb: vi.fn(async () => ({
      insert: (table: any) => ({
        values: async (data: any) => {
          if (data.argsHash !== undefined) {
            // approvals table
            mockApprovalsStore.set(data.id, {
              ...data,
              expiresAt: new Date(data.expiresAt),
              createdAt: new Date(data.createdAt ?? Date.now()),
            });
            return [data];
          } else {
            // auditLogs table
            mockAuditStore.push({
              ...data,
              createdAt: data.createdAt ?? Date.now(),
            });
            return [data];
          }
        },
      }),
      update: (table: any) => ({
        set: (updates: any) => ({
          where: (clause: any) => ({
            returning: async () => {
              // Find matching approval by evaluating compare-and-set
              // Clause contains id and expected status
              const targetId = clause?.targetId;
              const expectedStatus = clause?.expectedStatus;
              const existing = targetId ? mockApprovalsStore.get(targetId) : undefined;
              if (existing && (!expectedStatus || existing.status === expectedStatus)) {
                const updated = {
                  ...existing,
                  ...updates,
                };
                mockApprovalsStore.set(targetId, updated);
                return [updated];
              }
              return [];
            },
          }),
        }),
      }),
      select: () => ({
        from: (table: any) => ({
          where: (clause: any) => {
            const targetId = clause?.targetId;
            if (targetId) {
              const row = mockApprovalsStore.get(targetId);
              return Promise.resolve(row ? [row] : []);
            }
            return Promise.resolve(Array.from(mockApprovalsStore.values()));
          },
        }),
      }),
    })),
  };
});

// Mock MCP registry: one `confirm` tool (an action) and one `read` tool, recording every call so a
// replay can be proven not to repeat the side effect. `toolSchemas` is what a server would have
// declared for `tools()`, so a test can drive the edited-args check with a realistic schema.
const mcpMock = vi.hoisted(() => {
  const calls: { name: string; args: unknown }[] = [];
  const modes: Record<string, string> = { confirm_tool: "confirm", read_tool: "read" };
  const toolSchemas: any[] = [];
  return {
    calls,
    modes,
    toolSchemas,
    getMcpRegistry: () => ({
      modeOf: async (name: string) => modes[name.split("__").pop() ?? ""] ?? undefined,
      call: async (name: string, args: any) => {
        calls.push({ name, args });
        return { ok: true, text: "confirmed" };
      },
      tools: async () => toolSchemas,
    }),
  };
});

vi.mock("./mcp/client", () => ({
  MCP_TOOL_PREFIX: "mcp__",
  riskForMcpMode: (mode: string) =>
    mode === "confirm" ? { risk: "write", requiresApproval: true } : { risk: "read", requiresApproval: false },
  getMcpRegistry: mcpMock.getMcpRegistry,
}));

// Mock drizzle-orm operators for predictable where matching
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: any, val: any) => {
    return { col, val, targetId: typeof val === "string" && val.length > 10 ? val : undefined };
  }),
  and: vi.fn((...clauses: any[]) => {
    const idClause = clauses.find((c) => c?.targetId);
    const statusClause = clauses.find((c) => typeof c?.val === "string" && ["pending", "approved", "executing"].includes(c.val));
    return {
      targetId: idClause?.targetId,
      expectedStatus: statusClause?.val,
    };
  }),
}));

import {
  canonicalJson,
  getApprovalById,
  getApprovalTtlSec,
  hashArgs,
  KemmaApprovalGate,
  resolveWaiter,
  transitionApprovalStatus,
  __resetWaitersForTests,
} from "./approvals";
import {
  getToolSpec,
  registerTool,
  runTool,
  toolsFor,
  __resetRegistryForTests,
} from "./toolkit/registry";
import { approvalsRouter } from "../routes/approvals";
import type { ApprovalGate, ToolContext } from "./toolkit/types";

describe("P1-11 Approvals: canonicalJson and hashArgs", () => {
  it("computes deterministic canonical JSON regardless of key ordering", () => {
    const obj1 = { b: 2, a: 1, nested: { z: 10, y: 20 } };
    const obj2 = { nested: { y: 20, z: 10 }, a: 1, b: 2 };
    expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
    expect(hashArgs(obj1)).toBe(hashArgs(obj2));
  });

  it("produces 64-character sha256 hash", () => {
    const hash = hashArgs({ hello: "world" });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("P1-11 Approvals: HTTP endpoints and gate lifecycle", () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  let currentAuthUser: { id: number; name: string } | null = { id: 42, name: "Alice" };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    // Simulate requireSession
    app.use((req, _res, next) => {
      (req as any).user = currentAuthUser;
      next();
    });
    app.use("/api/kemma/approvals", approvalsRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}/api/kemma/approvals`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    mockApprovalsStore.clear();
    mockAuditStore.length = 0;
    mcpMock.toolSchemas.length = 0;
    __resetWaitersForTests();
    currentAuthUser = { id: 42, name: "Alice" };
    vi.stubEnv("FF_APPROVALS", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("wrong user gets 403", async () => {
    // Approval created for user 42
    const gate = new KemmaApprovalGate({
      userId: 42,
      runId: "run-1",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    });

    const promise = gate.request({
      tool: "email_send",
      risk: "write",
      args: { to: ["bob@example.com"], subject: "Hello", body: "Hi Bob" },
    });
    await new Promise((r) => setTimeout(r, 20));

    const [approvalId] = Array.from(mockApprovalsStore.keys());
    expect(approvalId).toBeDefined();

    // User 99 tries to approve it
    currentAuthUser = { id: 99, name: "Eve" };
    const res = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/Forbidden/);

    // Clean up pending waiter
    resolveWaiter(approvalId, { decision: "rejected" });
    await promise;
  });

  it("double decision gets 409", async () => {
    const gate = new KemmaApprovalGate({
      userId: 42,
      runId: "run-1",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    });

    const promise = gate.request({
      tool: "email_send",
      risk: "write",
      args: { to: ["bob@example.com"], subject: "Hello", body: "Hi Bob" },
    });
    await new Promise((r) => setTimeout(r, 20));

    const [approvalId] = Array.from(mockApprovalsStore.keys());

    // First decision: approve
    const res1 = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(res1.status).toBe(200);
    await promise;

    // Second decision: reject on already approved row
    const res2 = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "reject" }),
    });
    expect(res2.status).toBe(409);
    const data = await res2.json();
    expect(data.error).toMatch(/already approved/);
  });

  it("reject returns REJECTED to the model", async () => {
    const TestToolArgs = z.object({
      msg: z.string(),
    });

    let toolExecuted = false;
    registerTool({
      name: "test_action_reject",
      description: "Test tool",
      args: TestToolArgs,
      risk: "write",
      requiresApproval: true,
      parallelSafe: false,
      timeoutMs: 5000,
      maxModelChars: 1000,
      execute: async () => {
        toolExecuted = true;
        return { success: true };
      },
    });

    const ctx: ToolContext = {
      userId: 42,
      runId: "run-reject",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    };
    ctx.approvals = new KemmaApprovalGate(ctx);

    const runPromise = runTool("test_action_reject", { msg: "do something" }, ctx);

    // Yield to let gate register approval
    await new Promise((r) => setTimeout(r, 20));

    const [approvalId] = Array.from(mockApprovalsStore.keys());
    expect(approvalId).toBeDefined();

    // Reject via HTTP
    const res = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "reject" }),
    });
    expect(res.status).toBe(200);

    const outcome = await runToolPromise(runPromise);
    expect(outcome).toEqual({
      ok: false,
      code: "REJECTED",
      error: "The user declined this action.",
    });
    expect(toolExecuted).toBe(false);
  });

  it("approve runs the tool with the edited args", async () => {
    const SendArgs = z.object({
      recipient: z.string(),
      body: z.string(),
    });

    let executedWith: any = null;
    registerTool({
      name: "test_action_edit",
      description: "Test action with editing",
      args: SendArgs,
      risk: "write",
      requiresApproval: true,
      parallelSafe: false,
      timeoutMs: 5000,
      maxModelChars: 1000,
      execute: async (args) => {
        executedWith = args;
        return { success: true, sentTo: args.recipient };
      },
    });

    const ctx: ToolContext = {
      userId: 42,
      runId: "run-edit",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    };
    ctx.approvals = new KemmaApprovalGate(ctx);

    const runPromise = runTool(
      "test_action_edit",
      { recipient: "original@example.com", body: "Original message" },
      ctx
    );

    await new Promise((r) => setTimeout(r, 20));

    const [approvalId] = Array.from(mockApprovalsStore.keys());

    // User approves with edited args
    const editedArgs = { recipient: "edited@example.com", body: "Edited message" };
    const res = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "approve",
        args: editedArgs,
      }),
    });
    expect(res.status).toBe(200);

    const outcome = await runToolPromise(runPromise);
    expect(outcome.ok).toBe(true);
    expect(executedWith).toEqual(editedArgs);
  });

  it("expiry causes gate to expire", async () => {
    vi.stubEnv("KEMMA_APPROVAL_TTL_SEC", "1"); // 1s TTL

    const gate = new KemmaApprovalGate({
      userId: 42,
      runId: "run-expire",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    });

    const outcome = await gate.request({
      tool: "slow_action",
      risk: "write",
      args: { test: 1 },
    });

    expect(outcome.decision).toBe("expired");
  });

  it("abort while waiting becomes cancelled", async () => {
    const controller = new AbortController();
    const gate = new KemmaApprovalGate({
      userId: 42,
      runId: "run-abort",
      tier: "trial",
      signal: controller.signal,
      emit: () => {},
    });

    const promise = gate.request({
      tool: "cancel_me",
      risk: "write",
      args: {},
    });

    await new Promise((r) => setTimeout(r, 10));
    controller.abort();

    const outcome = await promise;
    expect(outcome.decision).toBe("rejected");

    const [approvalId] = Array.from(mockApprovalsStore.keys());
    const stored = mockApprovalsStore.get(approvalId);
    expect(stored?.status).toBe("cancelled");
  });

  it("target revision changed means CONFLICT and no write", async () => {
    let revision = "rev-initial";
    let executeCalled = false;

    registerTool({
      name: "test_target_revision",
      description: "Revision check tool",
      args: z.object({ fileId: z.string(), content: z.string() }),
      risk: "write",
      requiresApproval: true,
      targetRef: (args) => `drive:${args.fileId}`,
      targetRevision: () => revision,
      parallelSafe: false,
      timeoutMs: 5000,
      maxModelChars: 1000,
      execute: async () => {
        executeCalled = true;
        return { success: true };
      },
    });

    const ctx: ToolContext = {
      userId: 42,
      runId: "run-conflict",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    };
    ctx.approvals = new KemmaApprovalGate(ctx);

    const runPromise = runTool("test_target_revision", { fileId: "f1", content: "new" }, ctx);
    await new Promise((r) => setTimeout(r, 20));

    const [approvalId] = Array.from(mockApprovalsStore.keys());

    // Target revision changed externally before decision
    revision = "rev-changed";

    const res = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(res.status).toBe(200);

    const outcome = await runToolPromise(runPromise);
    expect(outcome).toEqual({
      ok: false,
      code: "CONFLICT",
      error: "Target revision changed.",
    });
    expect(executeCalled).toBe(false);
  });

  it("access revoked between request and approve means NOT_ALLOWED", async () => {
    let hasAccess = true;
    let executeCalled = false;

    registerTool({
      name: "test_access_revoked",
      description: "Access revoked tool",
      args: z.object({ arg: z.string() }),
      risk: "write",
      requiresApproval: true,
      available: () => hasAccess,
      parallelSafe: false,
      timeoutMs: 5000,
      maxModelChars: 1000,
      execute: async () => {
        executeCalled = true;
        return { success: true };
      },
    });

    const ctx: ToolContext = {
      userId: 42,
      runId: "run-access",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    };
    ctx.approvals = new KemmaApprovalGate(ctx);

    const runPromise = runTool("test_access_revoked", { arg: "foo" }, ctx);
    await new Promise((r) => setTimeout(r, 20));

    const [approvalId] = Array.from(mockApprovalsStore.keys());

    // Access revoked before user approves
    hasAccess = false;

    const res = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(res.status).toBe(200);

    const outcome = await runToolPromise(runPromise);
    expect(outcome).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
      error: "Access revoked.",
    });
    expect(executeCalled).toBe(false);
  });

  it("a replay of an executed approval returns the stored result without a second side effect", async () => {
    let sideEffectCount = 0;

    registerTool({
      name: "test_idempotency_replay",
      description: "Idempotency test tool",
      args: z.object({ value: z.number() }),
      risk: "write",
      requiresApproval: true,
      parallelSafe: false,
      timeoutMs: 5000,
      maxModelChars: 1000,
      execute: async (args) => {
        sideEffectCount++;
        return { success: true, count: sideEffectCount, val: args.value };
      },
    });

    const ctx: ToolContext = {
      userId: 42,
      runId: "run-idempotency",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    };
    ctx.approvals = new KemmaApprovalGate(ctx);

    const runPromise = runTool("test_idempotency_replay", { value: 100 }, ctx);
    await new Promise((r) => setTimeout(r, 20));

    const [approvalId] = Array.from(mockApprovalsStore.keys());

    const res = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(res.status).toBe(200);

    const outcome1 = await runToolPromise(runPromise);
    expect(outcome1.ok).toBe(true);
    expect(sideEffectCount).toBe(1);

    // Replay approval gate outcome with the same approvalId
    const stored = mockApprovalsStore.get(approvalId);
    expect(stored?.status).toBe("executed");

    // Second runTool call with a gate returning the already executed outcome
    const replayGate = {
      request: vi.fn().mockResolvedValue({
        decision: "approved",
        args: { value: 100 },
        approvalId,
      }),
    };
    const replayCtx: ToolContext = { ...ctx, approvals: replayGate as any };

    const outcome2 = await runTool("test_idempotency_replay", { value: 100 }, replayCtx);
    expect(outcome2.ok).toBe(true);
    // Side effect must not run a second time
    expect(sideEffectCount).toBe(1);
    expect(outcome2.data).toEqual(stored?.result);
  });

  it("audit rows written in order: decision first, then execution", async () => {
    registerTool({
      name: "test_audit_order",
      description: "Audit order test tool",
      args: z.object({ note: z.string() }),
      risk: "write",
      requiresApproval: true,
      parallelSafe: false,
      timeoutMs: 5000,
      maxModelChars: 1000,
      execute: async () => ({ success: true, id: "audit-123" }),
    });

    const ctx: ToolContext = {
      userId: 42,
      runId: "run-audit",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    };
    ctx.approvals = new KemmaApprovalGate(ctx);

    const runPromise = runTool("test_audit_order", { note: "secret-note" }, ctx);
    await new Promise((r) => setTimeout(r, 20));

    const [approvalId] = Array.from(mockApprovalsStore.keys());

    await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });

    await runToolPromise(runPromise);

    expect(mockAuditStore.length).toBe(2);
    // First: decision row
    expect(mockAuditStore[0].action).toBe("approval.approve");
    expect(mockAuditStore[0].metadata?.approvalId).toBe(approvalId);
    // Hash is stored, never raw content
    expect(mockAuditStore[0].metadata?.argsHash).toBeDefined();
    expect(JSON.stringify(mockAuditStore[0])).not.toContain("secret-note");

    // Second: execution row
    expect(mockAuditStore[1].action).toBe("approval.executed");
    expect(mockAuditStore[1].metadata?.approvalId).toBe(approvalId);
    expect(JSON.stringify(mockAuditStore[1])).not.toContain("secret-note");
  });

  it("with the flag off the tool isn't offered", async () => {
    vi.stubEnv("FF_APPROVALS", "0");

    registerTool({
      name: "test_flag_off_tool",
      description: "Needs approval",
      args: z.object({}),
      risk: "write",
      requiresApproval: true,
      parallelSafe: false,
      timeoutMs: 5000,
      maxModelChars: 1000,
      execute: async () => ({ success: true }),
    });

    const ctx: ToolContext = {
      userId: 42,
      runId: "run-flag-off",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    };

    const offered = await toolsFor(ctx);
    expect(offered.some((t) => t.name === "test_flag_off_tool")).toBe(false);

    // runTool also refuses execution when flag is off
    const outcome = await runTool("test_flag_off_tool", {}, ctx);
    expect(outcome).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
      error: "Tool test_flag_off_tool requires approval, which is currently disabled.",
    });
  });

  it("no approver: refused immediately, with no card, no row and no wait", async () => {
    // FF_APPROVALS on but the run has nobody to answer: creating the row first would leave the
    // model blocked for the whole TTL and expire an approval that was never really offered (P1-11).
    vi.stubEnv("KEMMA_APPROVAL_TTL_SEC", "30");

    let executeCalled = false;
    registerTool({
      name: "test_no_approver",
      description: "Needs an approver",
      args: z.object({ note: z.string() }),
      risk: "write",
      requiresApproval: true,
      parallelSafe: false,
      timeoutMs: 5000,
      maxModelChars: 1000,
      execute: async () => { executeCalled = true; return { success: true }; },
    });

    const events: any[] = [];
    const ctx: ToolContext = {
      userId: 42,
      runId: "run-no-approver",
      tier: "trial",
      signal: new AbortController().signal,
      emit: (e: any) => { events.push(e); },
      // no `approvals` gate on this context
    };

    const started = Date.now();
    const outcome = await runToolPromise(runTool("test_no_approver", { note: "x" }, ctx));

    expect(outcome).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
      error: "This action needs your approval, which isn't available yet.",
    });
    expect(executeCalled).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
    expect(mockApprovalsStore.size).toBe(0);
    expect(events.filter((e) => e?.type === "approval_request")).toHaveLength(0);
  });

  it("an MCP confirm tool walks the same state machine and writes both audit rows", async () => {
    mcpMock.calls.length = 0;
    const args = { fileId: "f1", accessToken: "bearer-secret" };
    const events: any[] = [];
    const ctx: ToolContext = {
      userId: 42,
      runId: "run-mcp-ladder",
      tier: "trial",
      signal: new AbortController().signal,
      emit: (e: any) => { events.push(e); },
    };
    ctx.approvals = new KemmaApprovalGate(ctx);

    const runPromise = runTool("mcp__srv__confirm_tool", args, ctx);
    await new Promise((r) => setTimeout(r, 20));

    const approvalId = Array.from(mockApprovalsStore.keys()).pop()!;
    expect(mockApprovalsStore.get(approvalId)?.status).toBe("pending");
    expect(mockApprovalsStore.get(approvalId)?.tool).toBe("mcp__srv__confirm_tool");

    // The card shows a summary with secret-ish values masked (the gate ships preview as a string).
    const card = events.find((e) => e?.type === "approval_request");
    expect(card?.tool).toBe("mcp__srv__confirm_tool");
    expect(card?.title).toBe("Approve mcp__srv__confirm_tool");
    const preview = JSON.parse(String(card?.preview ?? "{}"));
    expect(preview.argsSummary).toContain("fileId=f1");
    expect(preview.argsSummary).toContain("accessToken=***");
    expect(String(card?.preview)).not.toContain("bearer-secret");

    const res = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(res.status).toBe(200);

    const outcome = await runToolPromise(runPromise);
    expect(outcome).toEqual({ ok: true, data: { success: true, data: { output: "confirmed" } } });
    expect(mcpMock.calls).toEqual([{ name: "mcp__srv__confirm_tool", args }]);
    expect(mockApprovalsStore.get(approvalId)?.status).toBe("executed");

    // decision row + execution row, both keyed by the approval id, neither with raw args
    expect(mockAuditStore.map((a) => a.action)).toEqual(["approval.approve", "approval.executed"]);
    for (const row of mockAuditStore) expect(row.metadata?.approvalId).toBe(approvalId);
    expect(JSON.stringify(mockAuditStore)).not.toContain("bearer-secret");

    // Replaying the same approval id returns the stored result instead of acting twice.
    const replayGate: ApprovalGate = {
      request: async () => ({ decision: "approved" as const, args, approvalId }),
    };
    const replay = await runToolPromise(
      runTool("mcp__srv__confirm_tool", args, { ...ctx, approvals: replayGate })
    );
    expect(replay.ok).toBe(true);
    expect(replay.data).toEqual(mockApprovalsStore.get(approvalId)?.result);
    expect(mcpMock.calls).toHaveLength(1);
  });

  it("edited args that move the action to another target are refused with 400", async () => {
    // The human approves the file shown on the card; re-reading the target from the edited args
    // would let a different file be written while still reporting "approved" (P1-11).
    let executedWith: any = null;
    registerTool({
      name: "test_target_move",
      description: "Writes to one file",
      args: z.object({ fileId: z.string(), content: z.string() }),
      risk: "write",
      requiresApproval: true,
      targetRef: (args: any) => `drive:${args.fileId}`,
      parallelSafe: false,
      timeoutMs: 5000,
      maxModelChars: 1000,
      execute: async (args: any) => { executedWith = args; return { success: true }; },
    });

    const ctx: ToolContext = {
      userId: 42,
      runId: "run-target-move",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    };
    ctx.approvals = new KemmaApprovalGate(ctx);

    const runPromise = runTool("test_target_move", { fileId: "f1", content: "draft" }, ctx);
    await new Promise((r) => setTimeout(r, 20));
    const approvalId = Array.from(mockApprovalsStore.keys()).pop()!;
    expect(mockApprovalsStore.get(approvalId)?.targetRef).toBe("drive:f1");

    const moved = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify({ decision: "approve", args: { fileId: "f2", content: "draft" } }),
    });
    expect(moved.status).toBe(400);
    expect((await moved.json()).error).toMatch(/target/i);
    expect(mockApprovalsStore.get(approvalId)?.status).toBe("pending");
    expect(executedWith).toBe(null);

    // The same card still works for the action it actually displayed.
    const ok = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify({ decision: "approve", args: { fileId: "f1", content: "final copy" } }),
    });
    expect(ok.status).toBe(200);

    expect((await runToolPromise(runPromise)).ok).toBe(true);
    expect(executedWith).toEqual({ fileId: "f1", content: "final copy" });
  });

  it("edited args for an MCP tool are checked against the schema that server declared", async () => {
    // An MCP tool is not a registered spec, so there is no zod schema to re-validate against here.
    // Without this the arguments on an approved card could be replaced with anything at all and the
    // tool would be called with it (P1-11).
    mcpMock.toolSchemas.push({
      name: "mcp__srv__confirm_tool",
      description: "Sends a file",
      parameters: {
        type: "object",
        properties: {
          fileId: { type: "string", description: "file to send" },
          copies: { type: "integer", description: "how many copies" },
        },
        required: ["fileId", "copies"],
      },
    });

    mcpMock.calls.length = 0;
    const ctx: ToolContext = {
      userId: 42,
      runId: "run-mcp-edit",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    };
    ctx.approvals = new KemmaApprovalGate(ctx);
    const runPromise = runTool("mcp__srv__confirm_tool", { fileId: "f1", copies: 1 }, ctx);
    await new Promise((r) => setTimeout(r, 20));
    const approvalId = Array.from(mockApprovalsStore.keys()).pop()!;

    const decide = (body: unknown) =>
      fetch(`${baseUrl}/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
        body: JSON.stringify(body),
      });

    // A required field cannot be deleted by editing.
    const dropped = await decide({ decision: "approve", args: { fileId: "f1" } });
    expect(dropped.status).toBe(400);
    expect((await dropped.json()).error).toMatch(/copies/);

    // A field cannot change type either.
    const mistyped = await decide({ decision: "approve", args: { fileId: 42, copies: "many" } });
    expect(mistyped.status).toBe(400);
    expect((await mistyped.json()).error).toMatch(/type/i);

    // Both refusals leave the card answerable.
    expect(mockApprovalsStore.get(approvalId)?.status).toBe("pending");
    expect(mockAuditStore.map((a) => a.action)).toEqual([]);
    expect(mcpMock.calls).toEqual([]);

    // An edit that fits the schema is what actually runs, and the stored hash is the hash of that.
    const accepted = await decide({ decision: "approve", args: { fileId: "f2", copies: 2 } });
    expect(accepted.status).toBe(200);
    const outcome = await runToolPromise(runPromise);
    expect(outcome.ok).toBe(true);
    expect(mcpMock.calls).toEqual([{ name: "mcp__srv__confirm_tool", args: { fileId: "f2", copies: 2 } }]);
    expect(mockApprovalsStore.get(approvalId)?.argsHash).toBe(hashArgs({ fileId: "f2", copies: 2 }));
  });

  it("failure paths: 400 on invalid decision, 400 on invalid args, 404 on not found, 401 on unauthenticated", async () => {
    // 404
    const res404 = await fetch(`${baseUrl}/non-existent-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(res404.status).toBe(404);

    // 400 on invalid decision
    const gate = new KemmaApprovalGate({
      userId: 42,
      runId: "run-bad-decision",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    });
    const promise = gate.request({ tool: "email_send", risk: "write", args: {} });
    await new Promise((r) => setTimeout(r, 20));
    const [approvalId] = Array.from(mockApprovalsStore.keys());

    const res400Decision = await fetch(`${baseUrl}/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "maybe" }),
    });
    expect(res400Decision.status).toBe(400);

    // 400 on invalid edited args (e.g. failing zod schema)
    registerTool({
      name: "strict_args_tool",
      description: "Strict args",
      args: z.object({ email: z.string().email() }),
      risk: "write",
      requiresApproval: true,
      parallelSafe: false,
      timeoutMs: 5000,
      maxModelChars: 1000,
      execute: async () => ({ ok: true }),
    });

    const gateStrict = new KemmaApprovalGate({
      userId: 42,
      runId: "run-strict",
      tier: "trial",
      signal: new AbortController().signal,
      emit: () => {},
    });
    const strictPromise = gateStrict.request({ tool: "strict_args_tool", risk: "write", args: { email: "good@example.com" } });
    await new Promise((r) => setTimeout(r, 20));
    const strictId = Array.from(mockApprovalsStore.keys()).pop()!;

    const res400Args = await fetch(`${baseUrl}/${strictId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve", args: { email: "not-an-email" } }),
    });
    expect(res400Args.status).toBe(400);

    // 401 unauthenticated
    currentAuthUser = null;
    const res401 = await fetch(`${baseUrl}/${strictId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(res401.status).toBe(401);

    // Cleanup
    resolveWaiter(approvalId, { decision: "rejected" });
    resolveWaiter(strictId, { decision: "rejected" });
    await promise;
    await strictPromise;
  });
});

async function runToolPromise(p: Promise<any>): Promise<any> {
  return Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error("runTool promise timed out in test")), 4000)),
  ]);
}
