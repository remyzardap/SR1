/**
 * Feature flags: the one registry for switches that ship dark and are turned on deliberately.
 *
 * `flag("NAME")` reads the `FF_NAME` env var on every call (Secret Manager fills process.env
 * after imports, see server/_core/env.ts). `1`, `true` and `on` (any case) turn a flag on, any
 * other non-empty value turns it off, and an unset or blank variable means the default below.
 *
 * A work package that introduces a flag adds it here with its default and a one-line
 * description, and documents `FF_<NAME>` in ENVIRONMENT_VARIABLES.md and .env.example.
 */

export interface FlagSpec {
  default: boolean;
  description: string;
}

export const FLAGS = {
  // ─── Phase 1 ────────────────────────────────────────────────────────────────
  STREAM_TOOL_TURNS: {
    default: false,
    description: "Stream every model call, tool turns included, and emit thinking and segment events (P1-03).",
  },
  PARALLEL_TOOLS: {
    default: false,
    description: "Run the parallel-safe tool calls of one step concurrently (P1-04).",
  },
  AUTO_CONTINUE: {
    default: false,
    description: "Continue a final answer cut off by the output limit, at most twice (P1-06).",
  },
  SEARCH_V2: {
    default: false,
    description: "Search through the provider layer instead of the Sonar path (P1-08).",
  },
  READER_V2: {
    default: false,
    description: "Read pages with the tiered reader instead of a browser agent per URL (P1-09).",
  },
  UNTRUSTED_FENCING: {
    default: true,
    description: "Fence content from outside sources in tool results so the model treats it as data (P1-10).",
  },
  APPROVALS: {
    default: false,
    description: "Ask the user to approve write tools that act outside Sutaeru; off hides those tools (P1-11).",
  },
  ACTION_TOOLS: {
    default: false,
    description: "Offer the email, calendar, image, video and monitor tools to the agent (P1-12).",
  },
  CONTEXT_MANAGER: {
    default: false,
    description: "Keep each model call under its token budget with result handles and compaction (P1-13).",
  },
} as const satisfies Record<string, FlagSpec>;

export type FlagName = keyof typeof FLAGS;

const TRUE_VALUES = new Set(["1", "true", "on"]);

/** Whether a flag is on right now. An unknown name is a type error, and throws if forced through. */
export function flag(name: FlagName): boolean {
  const spec: FlagSpec | undefined = Object.hasOwn(FLAGS, name) ? FLAGS[name] : undefined;
  if (!spec) throw new Error(`Unknown feature flag: ${String(name)}`);
  const raw = process.env[`FF_${name}`]?.trim().toLowerCase();
  if (!raw) return spec.default;
  return TRUE_VALUES.has(raw);
}
