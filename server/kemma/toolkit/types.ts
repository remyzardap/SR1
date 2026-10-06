/**
 * Typed tool runtime: the shared contract every Kemma tool is defined against.
 *
 * @module kemma/toolkit/types
 * @see docs/spec/PHASE-1.md "P1-02 Tool runtime (typed tools with a context)"
 */
import type { z } from "zod";
import type { Tier } from "../../core/kemmaRouter";

/**
 * read: never changes anything outside the run (search, browse, list/read a file).
 * write: changes state, but inside Sutaeru's own data (create/edit/move a file, stage an edit).
 * destructive: can delete, trash, restore-after-delete, purge, share or change permissions on
 * anything. G1 (docs/spec/README.md §3 "Safety"): no tool may ever carry this risk class. A
 * destructive ToolSpec throws at `registerTool()` time rather than being silently dropped, so a
 * mistake is caught at process start, not discovered by an agent finding the tool missing.
 */
export type ToolRisk = "read" | "write" | "destructive";

/**
 * Placeholder event union for tool-originated events (file, image, job, notice). P1-03 introduces
 * the full typed union in `server/kemma/events.ts`; until then `ctx.emit` accepts any plain object
 * shaped like `{ type: string }` so a tool can emit without this module depending on P1-03.
 */
export interface EngineEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Placeholder for the human-in-the-loop gate P1-11 wires up. A ToolSpec may read
 * `requiresApproval` and thread it through today; nothing enforces it until P1-11 lands.
 */
export interface ApprovalGate {
  request: (toolName: string, args: unknown) => Promise<boolean>;
}

export interface ToolContext {
  userId: number;
  sessionId?: string;
  runId: string;
  tier: Tier;
  /** P1-05 wires a real, run-scoped signal. Until then, callers pass a signal that never aborts. */
  signal: AbortSignal;
  /** Tool-originated events: file, image, job, notice. A no-op until a run actually listens. */
  emit: (event: EngineEvent) => void;
  /** P1-11 wires actual approval prompts. Absent today. */
  approvals?: ApprovalGate;
  /**
   * Whether at least one file skill is enabled for this run. Deliberately NOT derived inside
   * `toolsFor` itself: computing it means a DB read (`getEnabledSkills`), and the engine already
   * makes that read once per run (for the system prompt's skill index) — this field lets
   * `toolsFor` reuse that single read instead of issuing its own. Defaults to false when omitted.
   */
  skillsEnabled?: boolean;
  /**
   * Whether this run is an internal sub-agent run (e.g. parallel research, sub-agent tree).
   * Defense-in-depth: gates host filesystem tools like vps_files even if allowedTools is omitted.
   */
  isSubAgent?: boolean;
}

export interface ToolSpec<A extends z.ZodTypeAny = z.ZodTypeAny, R = unknown> {
  /** ^[a-zA-Z0-9_-]{1,64}$ */
  name: string;
  description: string;
  /** zod v4 schema; its JSON Schema is generated with `z.toJSONSchema()` for the wire format. */
  args: A;
  risk: ToolRisk;
  requiresApproval?: boolean | ((args: z.infer<A>, ctx: ToolContext) => boolean);
  /** true for pure reads (search, browse, drive_read) — safe to run alongside other tools (P1-04). */
  parallelSafe: boolean;
  /** Enforced by the registry with a combined abort of `ctx.signal` and a per-call timer. */
  timeoutMs: number;
  /** Cap for what goes back to the model, in characters (P1-13 uses it). */
  maxModelChars: number;
  /** Short form for compaction (P1-13). */
  summarize?: (result: R) => string;
  /** e.g. Drive connected, admin. Defaults to always available when omitted. */
  available?: (ctx: ToolContext) => Promise<boolean> | boolean;
  execute: (args: z.infer<A>, ctx: ToolContext) => Promise<R>;
}

export type ToolOutcomeCode = "INVALID_ARGS" | "TIMEOUT" | "ABORTED" | "NOT_ALLOWED" | "FAILED" | "REJECTED";

export type ToolOutcome =
  | { ok: true; data: unknown; display?: unknown }
  | { ok: false; error: string; code: ToolOutcomeCode };

export const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
