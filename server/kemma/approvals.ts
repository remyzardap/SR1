/**
 * Human-in-the-loop approvals for Kemma write tools (P1-11).
 *
 * Tools with `requiresApproval` wait for the user's explicit confirmation or rejection
 * before executing. The request is journaled in `approvals`, emitted as an SSE
 * `approval_request` event, and waited on via an in-process waiter.
 *
 * Single instance for now. Note in code: P3-01 makes approvals durable and resumable
 * across process restarts.
 *
 * @module kemma/approvals
 * @see docs/spec/PHASE-1.md "P1-11 Approvals (human in the loop)"
 */
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { approvals, type ApprovalRow, type ApprovalStatus, type InsertApproval } from "../../drizzle/schema";
import type {
  ApprovalGate,
  ApprovalRequestOutcome,
  ApprovalRequestParams,
  ToolContext,
} from "./toolkit/types";

/**
 * Returns the TTL for pending approvals in seconds.
 * Read inside the function at call time (rule 3).
 */
export function getApprovalTtlSec(): number {
  const val = Number(process.env.KEMMA_APPROVAL_TTL_SEC);
  return Number.isFinite(val) && val > 0 ? val : 600;
}

/**
 * Deterministically serialize any object into canonical JSON with sorted keys.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJson).join(",")}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`,
  );
  return `{${pairs.join(",")}}`;
}

/**
 * Computes sha256 hex digest of the canonical JSON representation of tool arguments.
 */
export function hashArgs(args: unknown): string {
  const canonical = canonicalJson(args);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

interface ApprovalWaiter {
  resolve: (outcome: { decision: "approved" | "rejected" | "expired" | "cancelled"; args?: unknown }) => void;
  timer: NodeJS.Timeout;
}

const activeWaiters = new Map<string, ApprovalWaiter>();

/** Test helper to clear in-process waiters. */
export function __resetWaitersForTests(): void {
  for (const [, waiter] of activeWaiters) {
    clearTimeout(waiter.timer);
  }
  activeWaiters.clear();
}

/** Resolves an in-process waiter if active. */
export function resolveWaiter(
  id: string,
  outcome: { decision: "approved" | "rejected" | "expired" | "cancelled"; args?: unknown },
): boolean {
  const waiter = activeWaiters.get(id);
  if (!waiter) return false;
  clearTimeout(waiter.timer);
  activeWaiters.delete(id);
  waiter.resolve(outcome);
  return true;
}

/**
 * Atomically transitions an approval row's status using compare-and-set.
 * Returns the updated row if the transition succeeded, or null if the row was
 * not in the expected fromStatus.
 */
export async function transitionApprovalStatus(
  id: string,
  fromStatus: ApprovalStatus,
  toStatus: ApprovalStatus,
  updates: Partial<InsertApproval> = {},
): Promise<ApprovalRow | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [updated] = await db
    .update(approvals)
    .set({
      ...updates,
      status: toStatus,
    })
    .where(and(eq(approvals.id, id), eq(approvals.status, fromStatus)))
    .returning();

  return updated ?? null;
}

/** Fetches an approval row by id. */
export async function getApprovalById(id: string): Promise<ApprovalRow | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(approvals).where(eq(approvals.id, id));
  return row ?? null;
}

/**
 * Compact representation of tool execution result to store in `approvals.result`.
 * Never stores raw user content or full files (rule 7 and spec).
 */
export function compactResult(result: unknown): Record<string, unknown> {
  if (result === null || typeof result !== "object") {
    return { success: true };
  }
  const obj = result as Record<string, unknown>;
  const compact: Record<string, unknown> = {};
  for (const key of ["success", "ok", "id", "fileId", "jobId", "status", "code", "folderPath"]) {
    if (key in obj) {
      compact[key] = obj[key];
    }
  }
  return Object.keys(compact).length > 0 ? compact : { success: true };
}

/**
 * Default implementation of `ApprovalGate`.
 */
export class KemmaApprovalGate implements ApprovalGate {
  private ctx: ToolContext;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  async request(params: ApprovalRequestParams): Promise<ApprovalRequestOutcome> {
    return this.enqueueRequest(params);
  }

  private async enqueueRequest(params: ApprovalRequestParams): Promise<ApprovalRequestOutcome> {
    // Only one approval waits at a time per run. Parallel approval-requiring calls are serialized.
    const current = this.queue;
    let nextResolve: () => void;
    this.queue = new Promise<void>((r) => {
      nextResolve = r;
    });
    await current;
    try {
      return await this.doRequest(params);
    } finally {
      nextResolve!();
    }
  }

  private async doRequest(params: ApprovalRequestParams): Promise<ApprovalRequestOutcome> {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available for approval request");
    }

    const id = crypto.randomUUID();
    const argsHash = hashArgs(params.args);
    const ttlSec = getApprovalTtlSec();
    const expiresAt = new Date(Date.now() + ttlSec * 1000);

    // Insert approvals row
    await db.insert(approvals).values({
      id,
      userId: this.ctx.userId,
      sessionId: this.ctx.sessionId ?? null,
      runId: this.ctx.runId,
      tool: params.tool,
      risk: params.risk,
      args: params.args as any,
      argsHash,
      targetRef: params.targetRef ?? null,
      targetRevision: params.targetRevision ?? null,
      preview: params.preview as any,
      status: "pending",
      expiresAt,
      createdAt: new Date(),
    });

    // Extract title from preview or fallback
    let title = `Approve ${params.tool}`;
    if (
      typeof params.preview === "object" &&
      params.preview !== null &&
      "title" in params.preview &&
      typeof (params.preview as Record<string, unknown>).title === "string"
    ) {
      title = (params.preview as Record<string, unknown>).title as string;
    }

    // Emit SSE approval_request event
    this.ctx.emit({
      type: "approval_request",
      id,
      tool: params.tool,
      title,
      preview: typeof params.preview === "string" ? params.preview : (params.preview ? JSON.stringify(params.preview) : ""),
      args: params.args,
      expiresAt: expiresAt.toISOString(),
    });

    return new Promise<ApprovalRequestOutcome>((resolve) => {
      let settled = false;

      const cleanup = () => {
        activeWaiters.delete(id);
        if (timer) clearTimeout(timer);
        if (this.ctx.signal) {
          this.ctx.signal.removeEventListener("abort", onAbort);
        }
      };

      const finish = (decision: "approved" | "rejected" | "expired", finalArgs: any) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          decision,
          args: finalArgs,
          approvalId: id,
        });
      };

      // Expiry timer
      const timer = setTimeout(async () => {
        try {
          await transitionApprovalStatus(id, "pending", "expired");
        } catch {}
        finish("expired", params.args);
      }, Math.max(0, expiresAt.getTime() - Date.now()));

      // Signal cancellation / abort
      const onAbort = async () => {
        try {
          await transitionApprovalStatus(id, "pending", "cancelled");
        } catch {}
        finish("rejected", params.args);
      };

      if (this.ctx.signal?.aborted) {
        void onAbort();
        return;
      }
      this.ctx.signal?.addEventListener("abort", onAbort, { once: true });

      activeWaiters.set(id, {
        resolve: (outcome) => {
          if (outcome.decision === "approved") {
            finish("approved", outcome.args ?? params.args);
          } else if (outcome.decision === "expired") {
            finish("expired", params.args);
          } else {
            finish("rejected", params.args);
          }
        },
        timer,
      });
    });
  }
}

export function createApprovalGate(ctx: ToolContext): ApprovalGate {
  return new KemmaApprovalGate(ctx);
}
