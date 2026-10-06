/**
 * The tool registry: one place tools are declared, validated and run.
 *
 * @module kemma/toolkit/registry
 */
import { z } from "zod";
import type {
  ApprovalRequestOutcome,
  ToolContext,
  ToolOutcome,
  ToolOutcomeCode,
  ToolRisk,
  ToolSpec,
} from "./types";
import { TOOL_NAME_RE } from "./types";
import { DRIVE_TOOL_NAMES, SKILL_TOOL_NAMES } from "./names";
import { MCP_TOOL_PREFIX, getMcpRegistry, riskForMcpMode } from "../mcp/client";
import type { McpToolMode } from "../mcp/config";
import { flag } from "../../core/flags";
import { compactResult, getApprovalById, transitionApprovalStatus } from "../approvals";
import { logAuditEvent } from "../../middleware/audit-logging";

/** OpenAI function-calling wire format, unchanged from the hand-written shape in the old tools.ts. */
export interface OpenAiToolParam {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string; description?: string };
}
export interface OpenAiToolDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, OpenAiToolParam>;
    required: string[];
  };
}

const registry = new Map<string, ToolSpec<z.ZodTypeAny, unknown>>();

/**
 * Registers a tool. Throws synchronously for a bad name or a `risk: "destructive"` spec (G1: the
 * agent must never be handed a tool that can delete, trash, share or change permissions — that is
 * caught here, at startup, rather than discovered later by its absence from a tool list).
 */
export function registerTool<A extends z.ZodTypeAny, R>(spec: ToolSpec<A, R>): void {
  if (!TOOL_NAME_RE.test(spec.name)) {
    throw new Error(`registerTool: invalid tool name "${spec.name}" (must match ${TOOL_NAME_RE})`);
  }
  if (spec.risk === "destructive") {
    throw new Error(`registerTool: "${spec.name}" is risk:"destructive" and can never be registered (G1).`);
  }
  registry.set(spec.name, spec as unknown as ToolSpec<z.ZodTypeAny, unknown>);
}

/** Removes every registered tool. Test-only: production code never needs to unregister a tool. */
export function __resetRegistryForTests(): void {
  registry.clear();
}

export function getToolSpec(name: string): ToolSpec<z.ZodTypeAny, unknown> | undefined {
  return registry.get(name);
}

async function filterAvailable(specs: ToolSpec<z.ZodTypeAny, unknown>[], ctx: ToolContext): Promise<ToolSpec<z.ZodTypeAny, unknown>[]> {
  const checked = await Promise.all(
    specs.map(async (s) => {
      if (!s.available) return true;
      try {
        return await s.available(ctx);
      } catch {
        return false;
      }
    }),
  );
  return specs.filter((_s, i) => checked[i]);
}

const DRIVE_NAME_SET: ReadonlySet<string> = new Set(DRIVE_TOOL_NAMES);
const SKILL_NAME_SET: ReadonlySet<string> = new Set(SKILL_TOOL_NAMES);

/**
 * Whether this run can actually answer an approval: the flag is on *and* the caller wired a gate.
 * Nothing ever invents a gate (P1-11) — a run with no UI to answer (kemmaMax's legacy context, a
 * sub-agent) is `false`, so an approval-requiring tool is neither offered nor executed there.
 */
function approvalsAvailable(ctx: ToolContext): boolean {
  return flag("APPROVALS") && !!ctx.approvals;
}

/**
 * Whether a spec ever asks for approval. This is judged on *presence* — listing happens before any
 * args exist, so the function form cannot be consulted, and treating it as "not asking" would let
 * an approval-requiring tool run unapproved (P1-11 review). The function form is only ever an
 * opt-out, evaluated in `runTool` after the flag and a real gate have already passed.
 */
function mayRequireApproval(spec: ToolSpec<z.ZodTypeAny, unknown>): boolean {
  return spec.requiresApproval !== undefined && spec.requiresApproval !== false;
}

/**
 * The specs offered for this run, replicating the exact pre-refactor outcomes of three
 * differently-gated groups (ported from the engine's old tool-list-building code):
 *  - the ordinary registered tools (safe_files, web_search, browse, run_code, generate_file,
 *    phone_scan, vps_files): included unless `allow` is given and excludes them by name, then
 *    filtered by `available(ctx)`.
 *  - Drive tools: included when no explicit allowlist was given at all (auto-registration), or
 *    when explicitly named in `allow`, and in both cases filtered by `available(ctx)` (connected).
 *    Disconnected users are never offered Drive tools, preventing dead-ends.
 *  - skill tools (load_skill, read_skill_file, run_skill_script): included whenever
 *    `ctx.skillsEnabled` is set, independent of `allow` — same as the old unconditional append —
 *    except `run_skill_script` is dropped when `run_code` itself did not survive filtering.
 *
 * Every group is additionally withheld when the tool asks for approval and this run cannot answer
 * one (P1-11): the three groups used to be filtered separately, so Drive and skill tools leaked
 * through while the approval path was closed.
 */
export async function toolsFor(ctx: ToolContext, allow?: string[]): Promise<ToolSpec<z.ZodTypeAny, unknown>[]> {
  const allowSet = allow ? new Set(allow) : null;
  const canApprove = approvalsAvailable(ctx);
  const offerable = (s: ToolSpec<z.ZodTypeAny, unknown>) => !mayRequireApproval(s) || canApprove;

  const ordinary = [...registry.values()].filter(
    (s) =>
      !DRIVE_NAME_SET.has(s.name) &&
      !SKILL_NAME_SET.has(s.name) &&
      (!allowSet || allowSet.has(s.name)) &&
      offerable(s),
  );
  let result = await filterAvailable(ordinary, ctx);

  const driveCandidates = (allowSet ? DRIVE_TOOL_NAMES.filter((n) => allowSet.has(n)) : DRIVE_TOOL_NAMES)
    .map((n) => registry.get(n))
    .filter((s): s is ToolSpec<z.ZodTypeAny, unknown> => !!s)
    .filter(offerable);
  result = [...result, ...(await filterAvailable(driveCandidates, ctx))];

  if (ctx.skillsEnabled) {
    const canRunScripts = result.some((s) => s.name === "run_code");
    const skillCandidates = SKILL_TOOL_NAMES
      .filter((n) => n !== "run_skill_script" || canRunScripts)
      .map((n) => registry.get(n))
      .filter((s): s is ToolSpec<z.ZodTypeAny, unknown> => !!s)
      .filter(offerable);
    result = [...result, ...skillCandidates];
  }

  return result;
}

/** Strips `$schema` / `additionalProperties` so the wire format matches the old hand-written shape. */
function paramsFromZod(schema: z.ZodTypeAny): OpenAiToolDef["parameters"] {
  const full = z.toJSONSchema(schema) as {
    properties?: Record<string, OpenAiToolParam>;
    required?: string[];
  };
  return {
    type: "object",
    properties: full.properties ?? {},
    required: full.required ?? [],
  };
}

export function toOpenAiTools(specs: ToolSpec<z.ZodTypeAny, unknown>[]): OpenAiToolDef[] {
  return specs.map((s) => ({
    name: s.name,
    description: s.description,
    parameters: paramsFromZod(s.args),
  }));
}

/**
 * MCP definitions for the wire (P1-11). `McpRegistry.tools()` already hides `confirm`-mode tools
 * while `FF_APPROVALS` is off; this covers the other half of the rule — the flag is on but this run
 * has no gate (a legacy or background call) — so the model is never offered a tool that could only
 * ever be refused. A tool whose mode cannot be resolved is kept rather than dropped: `runTool` still
 * refuses to execute a confirm-mode call without an approval, so keeping one can never cause an
 * unapproved action, whereas dropping it would silently disappear a working read tool.
 */
export async function filterMcpDefs(defs: OpenAiToolDef[], ctx: ToolContext): Promise<OpenAiToolDef[]> {
  if (approvalsAvailable(ctx)) return defs;
  const out: OpenAiToolDef[] = [];
  for (const def of defs) {
    let mode: McpToolMode | undefined;
    try {
      mode = await getMcpRegistry().modeOf(def.name);
    } catch {
      mode = undefined;
    }
    if (mode && riskForMcpMode(mode).requiresApproval) continue;
    out.push(def);
  }
  return out;
}

function summarizeZodError(err: z.ZodError): string {
  const issues = err.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  return `Invalid arguments: ${issues.join("; ")}`;
}

class AbortMarker extends Error {
  code: "TIMEOUT" | "ABORTED";
  constructor(code: "TIMEOUT" | "ABORTED") {
    super(code === "TIMEOUT" ? "Tool timed out." : "Run was cancelled.");
    this.code = code;
  }
}

/**
 * Resolves/rejects with `p`, unless one of `signals` fires first, in which case it rejects with an
 * `AbortMarker` naming which one (`signals[1]`, the timeout, vs. any earlier signal, the run's own
 * abort). This is the manual equivalent of `AbortSignal.any()` plus a race against the wrapped
 * promise: `AbortSignal.any` only needs Node >= 20.3, which CI's Node 20 image should satisfy, but
 * it does not by itself race a promise, and building that race here keeps the registry working on
 * any Node 20.x without depending on the exact patch version.
 */
function runWithAbort<T>(p: Promise<T>, signals: AbortSignal[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const offs: Array<() => void> = [];
    const cleanup = () => { for (const off of offs) off(); };
    const onAbort = (isTimeout: boolean) => {
      if (done) return;
      done = true;
      cleanup();
      reject(new AbortMarker(isTimeout ? "TIMEOUT" : "ABORTED"));
    };
    signals.forEach((sig, i) => {
      const isTimeout = i === signals.length - 1;
      if (sig.aborted) { onAbort(isTimeout); return; }
      const handler = () => onAbort(isTimeout);
      sig.addEventListener("abort", handler, { once: true });
      offs.push(() => sig.removeEventListener("abort", handler));
    });
    if (done) return;
    p.then(
      (v) => { if (!done) { done = true; cleanup(); resolve(v); } },
      (e) => { if (!done) { done = true; cleanup(); reject(e); } },
    );
  });
}

/** Where an approval left us once the user answered (P1-11). */
type ApprovalLadder =
  | { kind: "outcome"; outcome: ToolOutcome }
  | { kind: "approved"; approvalId: string; finalArgs: any };

/** The flag is on but this run has nobody to ask — `runTool` refuses at once, never waiting on a TTL. */
const NO_APPROVER_MESSAGE = "This action needs your approval, which isn't available yet.";

/** The approval feature itself is off, so this action can only be done once it is enabled. */
function approvalDisabledMessage(name: string): string {
  return `Tool ${name} requires approval, which is currently disabled.`;
}

/** Records the result of a claimed approval: the row's terminal state plus the matching audit event. */
async function completeApproval(approvalId: string, name: string, ctx: ToolContext, result: unknown): Promise<void> {
  try {
    await transitionApprovalStatus(approvalId, "executing", "executed", {
      executedAt: new Date(),
      result: compactResult(result) as any,
    });
    await logAuditEvent({
      userId: String(ctx.userId),
      action: "approval.executed",
      resourceType: "tool",
      resourceId: name,
      metadata: { approvalId },
      sessionId: ctx.sessionId,
      severity: "info",
      status: "success",
    });
  } catch {
    // The action really happened; a broken record must not be reported to the model as a failure.
  }
}

/** Records a terminal `failed` state (plus the matching audit event) from either of the two hops. */
async function failApproval(
  approvalId: string,
  from: "approved" | "executing",
  name: string,
  ctx: ToolContext,
  errorMsg: string,
): Promise<void> {
  try {
    await transitionApprovalStatus(approvalId, from, "failed", {
      executedAt: new Date(),
      result: { error: errorMsg } as any,
    });
    await logAuditEvent({
      userId: String(ctx.userId),
      action: "approval.failed",
      resourceType: "tool",
      resourceId: name,
      metadata: { approvalId, error: errorMsg },
      sessionId: ctx.sessionId,
      severity: "warn",
      status: "failure",
    });
  } catch {
    // As above: the outcome returned to the caller is the important part.
  }
}

/**
 * The shared approval ladder for one action, used by built-in tools and MCP `confirm` tools alike so
 * both follow the same state machine (P1-11): ask, re-check that the action is still allowed and
 * still aimed at the same target, then claim it with a compare-and-set `approved -> executing`.
 * Anything other than a won claim comes back as a final outcome — declined, access revoked, target
 * changed, or a replay of work a concurrent call already recorded.
 */
async function seekApproval(opts: {
  name: string;
  risk: ToolRisk;
  proposedArgs: any;
  preview?: unknown;
  targetRef?: string;
  targetRevision?: string;
  ctx: ToolContext;
  /** Still offerable for this run? (access, availability and the flag all fold into `toolsFor`.) */
  stillOffered: () => Promise<boolean>;
  /** Re-reads the revision from the *decided* args; only tools with a target have one. */
  recheckRevision?: (finalArgs: any) => Promise<string | undefined>;
}): Promise<ApprovalLadder> {
  const { name, ctx } = opts;
  const gate = ctx.approvals;
  if (!gate) return { kind: "outcome", outcome: { ok: false, code: "NOT_ALLOWED", error: NO_APPROVER_MESSAGE } };

  const outcome: ApprovalRequestOutcome = await gate.request({
    tool: name,
    risk: opts.risk,
    args: opts.proposedArgs,
    preview: opts.preview,
    targetRef: opts.targetRef,
    targetRevision: opts.targetRevision,
  });
  if (outcome.decision !== "approved") {
    return { kind: "outcome", outcome: { ok: false, code: "REJECTED", error: "The user declined this action." } };
  }
  const approvalId = outcome.approvalId;
  const finalArgs = outcome.args ?? opts.proposedArgs;

  // Re-check 1: access may have been revoked, or the approval path closed, while the card was open.
  if (!(await opts.stillOffered()) || !flag("APPROVALS")) {
    await failApproval(approvalId, "approved", name, ctx, "Access revoked.");
    return { kind: "outcome", outcome: { ok: false, code: "NOT_ALLOWED", error: "Access revoked." } };
  }

  // Re-check 2: the target must not have moved underneath the approved args, edited args included.
  if (opts.targetRevision && opts.recheckRevision) {
    const currentRev = await opts.recheckRevision(finalArgs);
    if (currentRev !== opts.targetRevision) {
      await failApproval(approvalId, "approved", name, ctx, "Target revision changed.");
      return { kind: "outcome", outcome: { ok: false, code: "CONFLICT", error: "Target revision changed." } };
    }
  }

  // Claim the action: exactly one caller can win `approved -> executing`, and that id is the
  // idempotency key for everything recorded after this point.
  let claimLost = false;
  try {
    claimLost = !(await transitionApprovalStatus(approvalId, "approved", "executing"));
  } catch {
    // No database to claim against (a gate that is not the store-backed one). There is no row to
    // replay either, so the approved action runs — once, because a real gate always claims first.
  }
  if (claimLost) {
    const current = await getApprovalById(approvalId).catch(() => null);
    if (current?.status === "executed") {
      return { kind: "outcome", outcome: { ok: true, data: current.result } };
    }
    if (current?.status === "failed") {
      return {
        kind: "outcome",
        outcome: { ok: false, code: "FAILED", error: (current.result as any)?.error ?? "Tool execution failed." },
      };
    }
    return { kind: "outcome", outcome: { ok: false, code: "FAILED", error: "Concurrent execution in progress." } };
  }

  return { kind: "approved", approvalId, finalArgs };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Tool failed with a non-Error value.";
}

/** Maps a thrown value to the outcome the model sees: an abort/timeout keeps its own code. */
function failureOutcome(err: unknown, errorMsg: string): ToolOutcome {
  if (err instanceof AbortMarker) return { ok: false, error: err.message, code: err.code as ToolOutcomeCode };
  return { ok: false, error: errorMsg, code: "FAILED" };
}

/** Keys whose values must never reach an approval card or a log (P1-11). */
const SECRET_ARG_RE = /token|secret|pass(word|wd)?|api[-_]?key|credential|authorization|session/i;

/** One `key=value` fragment of an approval preview, with credentials masked and long values cut. */
function describeApprovalValue(key: string, value: unknown): string {
  if (SECRET_ARG_RE.test(key)) return "***";
  const text = typeof value === "string" ? value : (() => { try { return JSON.stringify(value) ?? String(value); } catch { return String(value); } })();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/**
 * A short summary of an MCP call's arguments for the approval card (P1-11). Raw args are never shown
 * or logged as-is: at most six keys, credential-looking values masked, long values truncated.
 */
function mcpPreview(name: string, args: Record<string, unknown>): { title: string; tool: string; argsSummary: string } {
  const entries = Object.entries(args);
  const parts = entries
    .slice(0, 6)
    .map(([k, v]) => `${k}=${describeApprovalValue(k, v)}`);
  if (entries.length > 6) parts.push(`(+${entries.length - 6} more)`);
  return {
    title: `Approve ${name}`,
    tool: name,
    argsSummary: parts.join(", "),
  };
}

/** The single `still offered` check for built-in tools: access, availability and the flag all fold in. */
async function stillOfferedFor(ctx: ToolContext, name: string): Promise<boolean> {
  try {
    return (await toolsFor(ctx)).some((s) => s.name === name);
  } catch {
    // The check itself failed, which is not evidence that access was revoked; let the run proceed and
    // let the tool's own permission checks decide.
    return true;
  }
}

/** What the model sees for one MCP call, whether the server returned text or an error (P1-11). */
function mcpCallOutcome(
  r: { ok: true; text: string } | { ok: false; error: string }
): { success: boolean; data?: unknown; error?: string; code?: string } {
  return r.ok
    ? { success: true, data: { output: r.text } }
    : { success: false, error: r.error, code: "MCP_ERROR" };
}

/**
 * Runs a tool by name. Never throws: parsing, timeout, abort and execution failures all come back
 * as a `{ ok: false }` outcome the model (or caller) can act on.
 */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  // MCP tools carry their own, server-declared JSON Schema rather than a zod schema, so they are
  // dispatched directly through the MCP registry instead of being represented as a ToolSpec here.
  if (name.startsWith(MCP_TOOL_PREFIX)) {
    if (ctx.signal.aborted) return { ok: false, error: "Run was cancelled.", code: "ABORTED" };
    const mcpRegistry = getMcpRegistry();
    const mode = await mcpRegistry.modeOf(name);
    if (!mode) return { ok: false, error: `Unknown tool: ${name}`, code: "NOT_ALLOWED" };

    const { risk, requiresApproval } = riskForMcpMode(mode);
    const args = typeof rawArgs === "object" && rawArgs !== null ? (rawArgs as Record<string, unknown>) : {};

    // `read`/`draft` tools do an action-free round-trip, so they need no approval and no record.
    if (!requiresApproval) {
      try {
        const r = await mcpRegistry.call(name, args, { confirmed: true });
        return { ok: true, data: mcpCallOutcome(r) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "MCP tool failed.", code: "FAILED" };
      }
    }

    // A `confirm` tool is an action, so it goes through exactly the same approval state machine as a
    // built-in tool: one card, one id, the re-checks, and both audit rows (P1-11).
    if (!approvalsAvailable(ctx)) {
      return {
        ok: false,
        code: "NOT_ALLOWED",
        error: flag("APPROVALS") ? NO_APPROVER_MESSAGE : approvalDisabledMessage(name),
      };
    }
    const ladder = await seekApproval({
      name,
      risk,
      proposedArgs: args,
      preview: mcpPreview(name, args),
      ctx,
      stillOffered: async () => {
        try {
          const current = await getMcpRegistry().modeOf(name);
          return !!current && riskForMcpMode(current).requiresApproval;
        } catch {
          return true;
        }
      },
    });
    if (ladder.kind === "outcome") return ladder.outcome;

    try {
      const r = await mcpRegistry.call(name, ladder.finalArgs, { confirmed: true });
      const data = mcpCallOutcome(r);
      await completeApproval(ladder.approvalId, name, ctx, data);
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : "MCP tool failed.";
      await failApproval(ladder.approvalId, "executing", name, ctx, message);
      return { ok: false, error: message, code: "FAILED" };
    }
  }

  const spec = registry.get(name);
  if (!spec) return { ok: false, error: `Unknown tool: ${name}`, code: "NOT_ALLOWED" };

  if (ctx.signal.aborted) return { ok: false, error: "Run was cancelled.", code: "ABORTED" };

  const parsed = spec.args.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, error: summarizeZodError(parsed.error), code: "INVALID_ARGS" };

  // A tool that declares nothing is a plain tool: it runs.
  if (!mayRequireApproval(spec)) return invokeSpec(spec, parsed.data, ctx);

  // Presence, not value: a tool that declares any approval requirement is only runnable when this run
  // can actually ask a human. `FF_APPROVALS` off therefore refuses it outright rather than running it.
  // The per-args function is *not* consulted on this path — evaluating it first is what let
  // `{ text: "safe" }` slip through unapproved, and a function that throws or misreports would do so
  // with nobody watching.
  if (!approvalsAvailable(ctx)) {
    return {
      ok: false,
      code: "NOT_ALLOWED",
      error: flag("APPROVALS") ? NO_APPROVER_MESSAGE : approvalDisabledMessage(name),
    };
  }

  // With an approver available, the tool may still waive the card for the calls it knows are safe.
  const requiresApproval =
    typeof spec.requiresApproval === "function" ? await spec.requiresApproval(parsed.data, ctx) : true;

  if (!requiresApproval) return invokeSpec(spec, parsed.data, ctx);

  // A card with no summary at all would ask the human to approve something they cannot read, so a
  // tool without its own preview — or one whose preview resolver throws, since these read live state
  // — still gets the masked argument summary an MCP call is shown (P1-11).
  const summary = mcpPreview(name, parsed.data as Record<string, unknown>);
  let preview: unknown = summary;
  if (spec.preview) {
    try {
      preview = await spec.preview(parsed.data, ctx);
    } catch {
      preview = summary;
    }
  }

  // The target and its version are read the same way, and a failure here cannot be papered over: the
  // decision route re-checks the recorded target and `seekApproval` re-checks the revision, so an
  // approval taken out against a target we could not read would be an approval nothing can honour.
  // Refused before any card exists, rather than shown one that cannot be kept (P1-11).
  let targetRef: string | undefined;
  if (spec.targetRef) {
    try {
      targetRef = await spec.targetRef(parsed.data, ctx);
    } catch {
      return { ok: false, code: "FAILED", error: `Could not read the target of ${name}, so it was not queued for approval. Try again.` };
    }
  }
  let targetRevision: string | undefined;
  if (spec.targetRevision) {
    try {
      targetRevision = await spec.targetRevision(parsed.data, ctx);
    } catch {
      return { ok: false, code: "FAILED", error: `Could not read the current version of ${name}'s target, so it was not queued for approval. Try again.` };
    }
  }

  const ladder = await seekApproval({
    name,
    risk: spec.risk,
    proposedArgs: parsed.data,
    preview,
    targetRef,
    targetRevision,
    ctx,
    stillOffered: () => stillOfferedFor(ctx, name),
    recheckRevision:
      spec.targetRevision && targetRevision
        ? async (decided) => {
            try {
              return await spec.targetRevision!(decided, ctx);
            } catch {
              // Fail closed: a target we cannot re-read is not a target we may overwrite.
              return undefined;
            }
          }
        : undefined,
  });
  if (ladder.kind === "outcome") return ladder.outcome;

  return invokeSpec(spec, ladder.finalArgs, ctx, { approvalId: ladder.approvalId, name });
}

/** The timed, abort-aware execution of one tool call, mapped to the outcome the model sees. */
async function invokeSpec(
  spec: ToolSpec<z.ZodTypeAny, unknown>,
  args: any,
  ctx: ToolContext,
  approval?: { approvalId: string; name: string },
): Promise<ToolOutcome> {
  try {
    const result = await executeSpec(spec, args, ctx);
    if (approval) await completeApproval(approval.approvalId, approval.name, ctx, result);
    return { ok: true, data: result };
  } catch (err) {
    const errorMsg = errorMessage(err);
    if (approval) await failApproval(approval.approvalId, "executing", approval.name, ctx, errorMsg);
    return failureOutcome(err, errorMsg);
  }
}

/** The timed, abort-aware execution of one already-approved tool call. */
async function executeSpec(
  spec: ToolSpec<z.ZodTypeAny, unknown>,
  args: any,
  ctx: ToolContext,
): Promise<unknown> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), spec.timeoutMs);
  const combinedController = new AbortController();
  const forwardRunAbort = () => combinedController.abort(ctx.signal.reason);
  const forwardTimeout = () => combinedController.abort(new Error("Tool timed out."));
  if (ctx.signal.aborted) {
    combinedController.abort(ctx.signal.reason);
  } else {
    ctx.signal.addEventListener("abort", forwardRunAbort, { once: true });
  }
  timeoutController.signal.addEventListener("abort", forwardTimeout, { once: true });

  const toolCtx: ToolContext = {
    ...ctx,
    signal: combinedController.signal,
  };

  try {
    return await runWithAbort(spec.execute(args, toolCtx), [ctx.signal, timeoutController.signal]);
  } finally {
    clearTimeout(timer);
    ctx.signal.removeEventListener("abort", forwardRunAbort);
    timeoutController.signal.removeEventListener("abort", forwardTimeout);
  }
}
