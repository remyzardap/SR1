/**
 * The tool registry: one place tools are declared, validated and run.
 *
 * @module kemma/toolkit/registry
 */
import { z } from "zod";
import type { ToolContext, ToolOutcome, ToolOutcomeCode, ToolSpec } from "./types";
import { TOOL_NAME_RE } from "./types";
import { DRIVE_TOOL_NAMES, SKILL_TOOL_NAMES } from "./names";
import { MCP_TOOL_PREFIX, getMcpRegistry, riskForMcpMode } from "../mcp/client";

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
 */
export async function toolsFor(ctx: ToolContext, allow?: string[]): Promise<ToolSpec<z.ZodTypeAny, unknown>[]> {
  const allowSet = allow ? new Set(allow) : null;

  const ordinary = [...registry.values()].filter(
    (s) => !DRIVE_NAME_SET.has(s.name) && !SKILL_NAME_SET.has(s.name) && (!allowSet || allowSet.has(s.name)),
  );
  let result = await filterAvailable(ordinary, ctx);

  const driveCandidates = (allowSet ? DRIVE_TOOL_NAMES.filter((n) => allowSet.has(n)) : DRIVE_TOOL_NAMES)
    .map((n) => registry.get(n))
    .filter((s): s is ToolSpec<z.ZodTypeAny, unknown> => !!s);
  result = [...result, ...(await filterAvailable(driveCandidates, ctx))];

  if (ctx.skillsEnabled) {
    const canRunScripts = result.some((s) => s.name === "run_code");
    const skillCandidates = SKILL_TOOL_NAMES
      .filter((n) => n !== "run_skill_script" || canRunScripts)
      .map((n) => registry.get(n))
      .filter((s): s is ToolSpec<z.ZodTypeAny, unknown> => !!s);
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

    const { requiresApproval } = riskForMcpMode(mode);
    const args = typeof rawArgs === "object" && rawArgs !== null ? (rawArgs as Record<string, unknown>) : {};

    if (requiresApproval) {
      if (!ctx.approvals) {
        return { ok: false, code: "NOT_ALLOWED", error: "This action needs your approval, which isn't available yet." };
      }
      const approved = await ctx.approvals.request(name, args);
      if (!approved) {
        return { ok: false, code: "REJECTED", error: "Action rejected by user approval." };
      }
    }

    try {
      const r = await mcpRegistry.call(name, args, { confirmed: true });
      return { ok: true, data: r.ok ? { success: true, data: { output: r.text } } : { success: false, error: r.error, code: "MCP_ERROR" } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "MCP tool failed.";
      return { ok: false, error: message, code: "FAILED" };
    }
  }

  const spec = registry.get(name);
  if (!spec) return { ok: false, error: `Unknown tool: ${name}`, code: "NOT_ALLOWED" };

  if (ctx.signal.aborted) return { ok: false, error: "Run was cancelled.", code: "ABORTED" };

  const parsed = spec.args.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, error: summarizeZodError(parsed.error), code: "INVALID_ARGS" };

  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), spec.timeoutMs);
  try {
    // P1-05: runWithAbort stops waiting on timeout, but execute receives ctx.signal rather than the
    // combined signal, so the underlying executor runs in the background until P1-05 wires unified
    // cancellation propagation.
    const result = await runWithAbort(spec.execute(parsed.data, ctx), [ctx.signal, timeoutController.signal]);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof AbortMarker) return { ok: false, error: err.message, code: err.code as ToolOutcomeCode };
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Tool failed with a non-Error value.";
    return { ok: false, error: message, code: "FAILED" };
  } finally {
    clearTimeout(timer);
  }
}
