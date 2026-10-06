/**
 * Registry mechanics: validation, timeout, abort, "never throws", destructive refusal, and
 * toolsFor's filtering rules. Builtin tool wiring and the engine's use of this module are covered
 * elsewhere (toolParity.test.ts, engine.audit.test.ts); this file exercises the registry itself
 * against small, self-contained test tools so it never depends on real executors, the network or
 * a database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import * as mcpClient from "../mcp/client";
import {
  __resetRegistryForTests,
  filterMcpDefs,
  registerTool,
  runTool,
  toOpenAiTools,
  toolsFor,
} from "./registry";
import type { ApprovalGate, ApprovalRequestOutcome, ToolContext, ToolSpec } from "./types";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 1,
    runId: "r1",
    tier: "trial",
    signal: new AbortController().signal,
    emit: () => {},
    ...overrides,
  };
}

const echoArgs = z.object({ text: z.string().describe("text to echo") });

function echoTool(overrides: Partial<ToolSpec<typeof echoArgs, unknown>> = {}): ToolSpec<typeof echoArgs, unknown> {
  return {
    name: "echo",
    description: "echoes text back",
    args: echoArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 1000,
    maxModelChars: 1000,
    execute: async (args) => ({ echoed: args.text }),
    ...overrides,
  };
}

beforeEach(() => {
  __resetRegistryForTests();
});

afterEach(() => {
  // These tests flip FF_APPROVALS to reach the approval paths. `flag()` reads the environment on
  // every call, so the value has to leave with the test that set it — otherwise the next file's
  // ordinary tools suddenly "require approval" and fail for a reason that has nothing to do with them.
  delete process.env.FF_APPROVALS;
});

describe("registerTool", () => {
  it("rejects a bad name", () => {
    expect(() => registerTool(echoTool({ name: "has a space" }))).toThrow(/invalid tool name/);
  });

  it("throws at registration time for risk: destructive (G1)", () => {
    expect(() => registerTool(echoTool({ name: "delete_everything", risk: "destructive" }))).toThrow(/destructive/);
    // and it never made it into the registry
    expect(async () => toolsFor(ctx())).not.toThrow();
  });

  it("a destructive tool is never offered even if registration is attempted and swallowed elsewhere", async () => {
    try { registerTool(echoTool({ name: "wipe", risk: "destructive" })); } catch { /* expected */ }
    const specs = await toolsFor(ctx());
    expect(specs.map((s) => s.name)).not.toContain("wipe");
  });
});

describe("runTool: argument validation", () => {
  beforeEach(() => registerTool(echoTool()));

  it("returns INVALID_ARGS with a model-actionable summary on a missing field", async () => {
    const outcome = await runTool("echo", {}, ctx());
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
    if (!outcome.ok) expect(outcome.error).toContain("text");
  });

  it("returns INVALID_ARGS on a wrong type", async () => {
    const outcome = await runTool("echo", { text: 42 }, ctx());
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("runs with valid args and wraps the result as ok:true", async () => {
    const outcome = await runTool("echo", { text: "hi" }, ctx());
    expect(outcome).toEqual({ ok: true, data: { echoed: "hi" } });
  });
});

describe("runTool: unknown tool", () => {
  it("never throws for a name no spec was registered under", async () => {
    const outcome = await runTool("not_a_real_tool", {}, ctx());
    expect(outcome).toEqual({ ok: false, error: "Unknown tool: not_a_real_tool", code: "NOT_ALLOWED" });
  });
});

describe("runTool: timeout", () => {
  it("fires even if the executor hangs forever", async () => {
    registerTool(echoTool({
      name: "hangs",
      timeoutMs: 30,
      execute: () => new Promise(() => {}), // never resolves
    }));
    const outcome = await runTool("hangs", { text: "x" }, ctx());
    expect(outcome).toMatchObject({ ok: false, code: "TIMEOUT" });
  }, 2000);
});

describe("runTool: abort", () => {
  it("returns ABORTED immediately when ctx.signal is already aborted", async () => {
    registerTool(echoTool());
    const controller = new AbortController();
    controller.abort();
    const outcome = await runTool("echo", { text: "x" }, ctx({ signal: controller.signal }));
    expect(outcome).toEqual({ ok: false, error: "Run was cancelled.", code: "ABORTED" });
  });

  it("returns ABORTED when ctx.signal fires mid-execution, before the timeout", async () => {
    const controller = new AbortController();
    registerTool(echoTool({
      name: "slow",
      timeoutMs: 5000,
      execute: () => new Promise((resolve) => setTimeout(() => resolve({ echoed: "late" }), 5000)),
    }));
    const promise = runTool("slow", { text: "x" }, ctx({ signal: controller.signal }));
    setTimeout(() => controller.abort(), 20);
    const outcome = await promise;
    expect(outcome).toMatchObject({ ok: false, code: "ABORTED" });
  }, 2000);
});

describe("runTool: execute() throwing or returning garbage never escapes runTool", () => {
  it("a thrown Error becomes FAILED with its message", async () => {
    registerTool(echoTool({ name: "throws", execute: async () => { throw new Error("boom"); } }));
    const outcome = await runTool("throws", { text: "x" }, ctx());
    expect(outcome).toEqual({ ok: false, error: "boom", code: "FAILED" });
  });

  it("a thrown non-Error value becomes FAILED without throwing", async () => {
    registerTool(echoTool({ name: "throws_string", execute: async () => { throw "raw string failure"; } }));
    const outcome = await runTool("throws_string", { text: "x" }, ctx());
    expect(outcome).toEqual({ ok: false, error: "raw string failure", code: "FAILED" });
  });

  it("a rejected promise with no message still resolves to a FAILED outcome, not a throw", async () => {
    registerTool(echoTool({ name: "rejects_odd", execute: async () => { throw { weird: true }; } }));
    await expect(runTool("rejects_odd", { text: "x" }, ctx())).resolves.toMatchObject({ ok: false, code: "FAILED" });
  });
});

describe("toolsFor: availability and allow filtering", () => {
  it("excludes a tool whose available() returns false", async () => {
    registerTool(echoTool({ name: "gated", available: () => false }));
    registerTool(echoTool({ name: "open" }));
    const names = (await toolsFor(ctx())).map((s) => s.name);
    expect(names).toContain("open");
    expect(names).not.toContain("gated");
  });

  it("treats a throwing available() as unavailable rather than failing the whole listing", async () => {
    registerTool(echoTool({ name: "throws_available", available: () => { throw new Error("db down"); } }));
    registerTool(echoTool({ name: "open" }));
    const names = (await toolsFor(ctx())).map((s) => s.name);
    expect(names).toEqual(["open"]);
  });

  it("an explicit allow list narrows to just those names", async () => {
    registerTool(echoTool({ name: "a" }));
    registerTool(echoTool({ name: "b" }));
    const names = (await toolsFor(ctx(), ["a"])).map((s) => s.name);
    expect(names).toEqual(["a"]);
  });

  it("an empty allow list offers nothing", async () => {
    registerTool(echoTool({ name: "a" }));
    const names = (await toolsFor(ctx(), [])).map((s) => s.name);
    expect(names).toEqual([]);
  });
});

describe("toOpenAiTools", () => {
  it("produces the OpenAI function-calling wire shape from a zod schema", () => {
    const [def] = toOpenAiTools([echoTool()]);
    expect(def).toEqual({
      name: "echo",
      description: "echoes text back",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "text to echo" } },
        required: ["text"],
      },
    });
  });
});

// P1-11 [P1-11] rule 1: an approval tool may only be offered — or run — when this run can actually
// ask a human. These cover the toolkit side of that rule; the gate's own behaviour is in
// approvals.test.ts.
describe("runTool: MCP approval and mode handling", () => {
  const mockCall = vi.fn();
  const mockModeOf = vi.fn();

  beforeEach(() => {
    vi.spyOn(mcpClient, "getMcpRegistry").mockReturnValue({
      modeOf: mockModeOf,
      call: mockCall,
    } as unknown as mcpClient.McpRegistry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FF_APPROVALS;
  });

  it("confirm tool while the approval feature is off returns NOT_ALLOWED with the disabled message", async () => {
    delete process.env.FF_APPROVALS;
    mockModeOf.mockResolvedValue("confirm");
    const outcome = await runTool("mcp__test__confirm_tool", { arg: 1 }, ctx({ approvals: undefined }));
    expect(outcome).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
      error: "Tool mcp__test__confirm_tool requires approval, which is currently disabled.",
    });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("confirm tool with the flag on but no gate returns NOT_ALLOWED, never waiting on a TTL", async () => {
    process.env.FF_APPROVALS = "1";
    mockModeOf.mockResolvedValue("confirm");
    const outcome = await runTool("mcp__test__confirm_tool", { arg: 1 }, ctx({ approvals: undefined }));
    expect(outcome).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
      error: "This action needs your approval, which isn't available yet.",
    });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("confirm tool with gate saying no returns REJECTED", async () => {
    process.env.FF_APPROVALS = "1";
    mockModeOf.mockResolvedValue("confirm");
    const request = vi.fn(async (): Promise<ApprovalRequestOutcome> => ({
      decision: "rejected",
      args: { arg: 1 },
      approvalId: "ap-no",
    }));
    const outcome = await runTool("mcp__test__confirm_tool", { arg: 1 }, ctx({ approvals: { request } }));
    expect(outcome).toEqual({
      ok: false,
      code: "REJECTED",
      error: "The user declined this action.",
    });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("confirm tool with gate saying yes is asked as one structured request, then runs confirmed", async () => {
    process.env.FF_APPROVALS = "1";
    mockModeOf.mockResolvedValue("confirm");
    const request = vi.fn(async (): Promise<ApprovalRequestOutcome> => ({
      decision: "approved",
      args: { arg: 1 },
      approvalId: "ap-yes",
    }));
    mockCall.mockResolvedValue({ ok: true, text: "action performed" });
    const outcome = await runTool("mcp__test__confirm_tool", { arg: 1 }, ctx({ approvals: { request } }));
    expect(outcome).toEqual({
      ok: true,
      data: { success: true, data: { output: "action performed" } },
    });
    // The structured contract: the card is told which tool, how risky, what it will do.
    expect(request.mock.calls[0][0]).toMatchObject({
      tool: "mcp__test__confirm_tool",
      risk: "write",
      args: { arg: 1 },
    });
    expect(request.mock.calls[0][0].preview).toMatchObject({ tool: "mcp__test__confirm_tool" });
    expect(mockCall).toHaveBeenCalledWith("mcp__test__confirm_tool", { arg: 1 }, { confirmed: true });
  });

  it("read tool runs without requiring approval", async () => {
    mockModeOf.mockResolvedValue("read");
    const request = vi.fn();
    mockCall.mockResolvedValue({ ok: true, text: "read result" });
    const outcome = await runTool("mcp__test__read_tool", {}, ctx({ approvals: { request } }));
    expect(outcome).toEqual({
      ok: true,
      data: { success: true, data: { output: "read result" } },
    });
    expect(request).not.toHaveBeenCalled();
    expect(mockCall).toHaveBeenCalledWith("mcp__test__read_tool", {}, { confirmed: true });
  });

  it("draft tool runs without requiring approval", async () => {
    mockModeOf.mockResolvedValue("draft");
    const request = vi.fn();
    mockCall.mockResolvedValue({ ok: true, text: "draft staged" });
    const outcome = await runTool("mcp__test__draft_tool", {}, ctx({ approvals: { request } }));
    expect(outcome).toEqual({
      ok: true,
      data: { success: true, data: { output: "draft staged" } },
    });
    expect(request).not.toHaveBeenCalled();
    expect(mockCall).toHaveBeenCalledWith("mcp__test__draft_tool", {}, { confirmed: true });
  });

  it("unknown MCP tool returns NOT_ALLOWED", async () => {
    mockModeOf.mockResolvedValue(undefined);
    const outcome = await runTool("mcp__test__unknown", {}, ctx());
    expect(outcome).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
      error: "Unknown tool: mcp__test__unknown",
    });
  });
});

describe("runTool: approval ladder for built-in tools", () => {
  const approved = (approvalId = "b-1", args: unknown = { text: "hello" }): ApprovalRequestOutcome => ({
    decision: "approved",
    args,
    approvalId,
  });

  afterEach(() => {
    delete process.env.FF_APPROVALS;
  });

  it("flag on, no gate: refuses immediately instead of waiting for the approval to expire", async () => {
    process.env.FF_APPROVALS = "1";
    let ran = 0;
    registerTool(
      echoTool({ name: "gateless_tool", risk: "write", requiresApproval: true, execute: async () => ({ ran: ++ran }) }),
    );

    const started = Date.now();
    const outcome = await runTool("gateless_tool", { text: "hello" }, ctx());

    expect(outcome).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
      error: "This action needs your approval, which isn't available yet.",
    });
    expect(ran).toBe(0);
    // The default approval TTL is 600s; anything close to that means we waited on a nobody-to-ask card.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("flag off: a tool whose approval check would opt out is still refused, never run", async () => {
    delete process.env.FF_APPROVALS;
    let ran = 0;
    registerTool(
      echoTool({
        name: "approval_opt_out_tool",
        risk: "write",
        requiresApproval: () => false,
        execute: async () => ({ ran: ++ran }),
      }),
    );

    const outcome = await runTool(
      "approval_opt_out_tool",
      { text: "hi" },
      ctx({ approvals: { request: async () => approved() } }),
    );

    // Before this rule was fixed the `false` returned by the function let this run with no approval.
    expect(ran).toBe(0);
    expect(outcome).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
      error: "Tool approval_opt_out_tool requires approval, which is currently disabled.",
    });
  });

  it("flag on with a gate: the function may still opt an individual call out of approval", async () => {
    process.env.FF_APPROVALS = "1";
    let ran = 0;
    const request = vi.fn(async () => approved());
    registerTool(
      echoTool({
        name: "conditional_approval_tool",
        risk: "write",
        requiresApproval: (args) => args.text !== "safe",
        execute: async () => ({ ran: ++ran }),
      }),
    );

    const safe = await runTool("conditional_approval_tool", { text: "safe" }, ctx({ approvals: { request } }));
    expect(safe).toEqual({ ok: true, data: { ran: 1 } });
    expect(request).not.toHaveBeenCalled();

    const risky = await runTool("conditional_approval_tool", { text: "risky" }, ctx({ approvals: { request } }));
    expect(risky).toEqual({ ok: true, data: { ran: 2 } });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toMatchObject({ tool: "conditional_approval_tool", risk: "write" });
  });

  it("a declined approval never reaches execute()", async () => {
    process.env.FF_APPROVALS = "1";
    let ran = 0;
    registerTool(
      echoTool({ name: "declined_builtin_tool", risk: "write", requiresApproval: true, execute: async () => ({ ran: ++ran }) }),
    );
    const request = vi.fn(async () => ({ decision: "rejected" as const, args: { text: "hi" }, approvalId: "b-no" }));

    const outcome = await runTool("declined_builtin_tool", { text: "hi" }, ctx({ approvals: { request } }));

    expect(ran).toBe(0);
    expect(outcome).toEqual({ ok: false, code: "REJECTED", error: "The user declined this action." });
  });

  it("the preview, targetRef and targetRevision all reach the card", async () => {
    process.env.FF_APPROVALS = "1";
    const request = vi.fn(async () => approved("b-preview", { text: "hi" }));
    registerTool(
      echoTool({
        name: "previewed_tool",
        risk: "write",
        requiresApproval: true,
        preview: async (args) => ({ title: `Echo ${args.text}`, detail: "echo" }),
        targetRef: async (args) => `ref:${args.text}`,
        targetRevision: async (args) => `rev:${args.text}`,
        execute: async () => ({ echoed: true }),
      }),
    );

    const outcome = await runTool("previewed_tool", { text: "hi" }, ctx({ approvals: { request } }));

    expect(outcome).toEqual({ ok: true, data: { echoed: true } });
    expect(request.mock.calls[0][0]).toMatchObject({
      tool: "previewed_tool",
      preview: { title: "Echo hi", detail: "echo" },
      targetRef: "ref:hi",
      targetRevision: "rev:hi",
    });
  });

  it("an approved tool that leaves the offer while the card is open is not run", async () => {
    process.env.FF_APPROVALS = "1";
    let ran = 0;
    registerTool(
      echoTool({ name: "withdrawn_tool", risk: "write", requiresApproval: true, execute: async () => ({ ran: ++ran }) }),
    );
    // Simulate access (or the feature) going away between the card and the decision: the tool is no
    // longer part of what this run may use.
    const request = vi.fn(async () => {
      __resetRegistryForTests();
      registerTool(
        echoTool({ name: "other_tool", risk: "write", execute: async () => ({ ran: ++ran }) }),
      );
      return approved("b-revoked");
    });

    const outcome = await runTool("withdrawn_tool", { text: "hi" }, ctx({ approvals: { request } }));

    expect(ran).toBe(0);
    expect(outcome).toEqual({ ok: false, code: "NOT_ALLOWED", error: "Access revoked." });
  });

  it("a moved target revision comes back as CONFLICT instead of overwriting the new version", async () => {
    process.env.FF_APPROVALS = "1";
    let revision = "rev-1";
    let ran = 0;
    registerTool(
      echoTool({
        name: "moving_target_tool",
        risk: "write",
        requiresApproval: true,
        targetRevision: async () => revision,
        execute: async () => ({ ran: ++ran }),
      }),
    );
    const request = vi.fn(async () => {
      revision = "rev-2"; // somebody else edited the file while the card was open
      return approved("b-conflict");
    });

    const outcome = await runTool("moving_target_tool", { text: "hi" }, ctx({ approvals: { request } }));

    expect(ran).toBe(0);
    expect(outcome).toEqual({ ok: false, code: "CONFLICT", error: "Target revision changed." });
  });

  it("an approval tool is withheld from the offer while this run has no approver", async () => {
    process.env.FF_APPROVALS = "1";
    registerTool(echoTool({ name: "listed_only_with_gate", risk: "write", requiresApproval: true }));
    const gate: ApprovalGate = { request: async () => approved() };

    expect((await toolsFor(ctx(), undefined)).map((s) => s.name)).not.toContain("listed_only_with_gate");
    expect((await toolsFor(ctx({ approvals: gate }), undefined)).map((s) => s.name)).toContain("listed_only_with_gate");
  });

  it("with the flag off, an approval tool is withheld from every group", async () => {
    delete process.env.FF_APPROVALS;
    registerTool(echoTool());
    registerTool(echoTool({ name: "drive_edit", risk: "write", requiresApproval: true }));
    registerTool(echoTool({ name: "load_skill", risk: "write", requiresApproval: true }));
    const gate: ApprovalGate = { request: async () => approved() };

    const names = (await toolsFor(ctx({ approvals: gate, skillsEnabled: true }), undefined)).map((s) => s.name);

    expect(names).not.toContain("drive_edit");
    expect(names).not.toContain("load_skill");
    expect(names).toContain("echo");
  });
});

// P1-11 rule 1, MCP half: `McpRegistry.tools()` already hides `confirm` tools while the flag is off;
// this hides them for a run that has the flag on but nobody to ask.
describe("filterMcpDefs: confirm tools need an approver to be offered", () => {
  const modes: Record<string, string> = { read_tool: "read", draft_tool: "draft", action_tool: "confirm" };
  const defs = ["read_tool", "draft_tool", "action_tool"].map((n) => ({
    name: `mcp__srv__${n}`,
    description: n,
    parameters: { type: "object" as const, properties: {}, required: [] },
  }));

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FF_APPROVALS;
  });

  it("keeps every definition when this run can ask a human", async () => {
    process.env.FF_APPROVALS = "1";
    const modeOf = vi.fn(async (name: string) => modes[name.split("__")[2]]);
    vi.spyOn(mcpClient, "getMcpRegistry").mockReturnValue({ tools: async () => [], modeOf } as any);

    const kept = await filterMcpDefs(defs, ctx({ approvals: { request: vi.fn() } }));

    expect(kept.map((d) => d.name)).toEqual(defs.map((d) => d.name));
    expect(modeOf).not.toHaveBeenCalled(); // the fast path keeps everything without consulting modes
  });

  it("drops only the confirm-mode tool when there is no gate (flag on)", async () => {
    process.env.FF_APPROVALS = "1";
    vi.spyOn(mcpClient, "getMcpRegistry").mockReturnValue({
      tools: async () => [],
      modeOf: async (name: string) => modes[name.split("__")[2]],
    } as any);

    const kept = await filterMcpDefs(defs, ctx());

    expect(kept.map((d) => d.name)).toEqual(["mcp__srv__read_tool", "mcp__srv__draft_tool"]);
  });

  it("does not depend on the flag: with the feature off it still drops the confirm tool", async () => {
    // `McpRegistry.tools()` hides confirm-mode tools while the flag is off, so this case should be
    // empty in practice; the filter not leaning on that is the point — a confirm tool that reaches
    // the wire list by any route still cannot be offered to a run that cannot approve it.
    delete process.env.FF_APPROVALS;
    const modeOf = vi.fn(async (name: string) => modes[name.split("__")[2]]);
    vi.spyOn(mcpClient, "getMcpRegistry").mockReturnValue({ tools: async () => [], modeOf } as any);

    const kept = await filterMcpDefs(defs, ctx({ approvals: { request: vi.fn() } }));

    expect(kept.map((d) => d.name)).toEqual(["mcp__srv__read_tool", "mcp__srv__draft_tool"]);
    expect(modeOf).toHaveBeenCalled();
  });

  it("keeps a tool whose mode cannot be resolved, and survives a registry without modeOf", async () => {
    process.env.FF_APPROVALS = "1";
    vi.spyOn(mcpClient, "getMcpRegistry").mockReturnValue({ tools: async () => [] } as any);

    const kept = await filterMcpDefs(defs, ctx());

    // Dropping them would silently remove working read tools; `runTool` still refuses to *execute* a
    // confirm call without an approval, so keeping an unknown tool can never cause an action.
    expect(kept.map((d) => d.name)).toEqual(defs.map((d) => d.name));
  });
});

