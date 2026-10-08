/* ─────────────────────────────────────────────────────────────────────────────
   agentBuilder.ts — the Agent task builder's data and logic, ported from
   design/sutaeru-app/app.js (DEPTH, KINDS, planFor, the agent handlers).
   No DOM, no fetching: the screen component takes this state and these helpers,
   the container feeds it. Every string the prototype shows is kept verbatim.
   ─────────────────────────────────────────────────────────────────────────── */

import type { DocKind } from "./docMini";

/** The six things you can ask for. Image has no document miniature — it previews photography. */
export type AgentOutputId = DocKind | "image";

export type AgentDepthId = "quick" | "standard" | "deep";

export type AgentSourceId = "web" | "files" | "drive" | "notion";

export interface OutputType {
  id: AgentOutputId;
  name: string;
  blurb: string;
}

export const OUTPUT_TYPES: readonly OutputType[] = [
  { id: "report", name: "Report", blurb: "Cited research, ready to send" },
  { id: "deck", name: "Deck", blurb: "Slides with charts and notes" },
  { id: "sheet", name: "Sheet", blurb: "Formulas, tabs and totals" },
  { id: "image", name: "Image", blurb: "Set up the shot, then draw" },
  { id: "brief", name: "Brief", blurb: "One page with clear decisions" },
  { id: "monitor", name: "Monitor", blurb: "Watches and tells you when it moves" },
] as const;

export interface DepthLevel {
  id: AgentDepthId;
  label: string;
  /** Sources read. */
  src: number;
  /** Minutes of work at Standard; quick and deep scale the reading steps. */
  min: number;
  credits: number;
  /** Dots lit in the 30-dot meter (CSS shows ten per row). */
  dots: number;
  /** Reading steps multiply by this; planning and writing always take the base time. */
  scale: number;
}

export const DEPTH_LEVELS: readonly DepthLevel[] = [
  { id: "quick", label: "Quick", src: 6, min: 2, credits: 1, dots: 6, scale: 0.45 },
  { id: "standard", label: "Standard", src: 14, min: 6, credits: 4, dots: 14, scale: 1 },
  { id: "deep", label: "Deep", src: 40, min: 20, credits: 9, dots: 30, scale: 2.6 },
] as const;

export function depthOf(id: AgentDepthId): DepthLevel {
  const found = DEPTH_LEVELS.find((d) => d.id === id);
  return found ?? DEPTH_LEVELS[1];
}

/** Source pickers. `name` is the toggle label, `short` the one used in the summary line. */
export interface SourceOption {
  id: AgentSourceId;
  letter: string;
  name: string;
  short: string;
}

export const SOURCE_OPTIONS: readonly SourceOption[] = [
  { id: "web", letter: "W", name: "Web", short: "Web" },
  { id: "files", letter: "F", name: "My files", short: "My files" },
  { id: "drive", letter: "G", name: "Google Drive", short: "Drive" },
  { id: "notion", letter: "N", name: "Notion", short: "Notion" },
] as const;

/** One line of the plan: what Sutaeru does, what it starts from, how long it takes. */
export interface PlanRow {
  name: string;
  sub: string;
  time: string;
}

export interface AgentPlan {
  rows: PlanRow[];
  total: string;
  credits: number;
}

interface SampleStep {
  kind: "plan" | "search" | "read" | "write";
  name: string;
  /** Shown as the sub-line when present. "SRC" is replaced by the depth's source count. */
  done?: string;
  /** Shown as "Starts with {file}" when there is no done line. */
  file?: string;
  pages?: number;
  /** Base minutes. */
  m: number;
}

interface BriefSample {
  title: string;
  brief: string;
  steps: readonly SampleStep[];
}

export const BRIEF_SAMPLES: Record<DocKind, BriefSample> = {
  report: {
    title: "Solar PV supplier research",
    brief:
      "Compare three PV module suppliers for a 500 kWp rooftop project. Include price per Wp, lead time and warranty.",
    steps: [
      { kind: "plan", name: "Plan the search", done: "Three questions, two source types", m: 0.3 },
      { kind: "search", name: "Search the web", done: "SRC sources found", m: 1 },
      { kind: "read", name: "Read the quotes", file: "supplier_quotes.pdf", pages: 12, m: 2 },
      { kind: "write", name: "Write the report", m: 2 },
    ],
  },
  deck: {
    title: "TGWI investor update Q3",
    brief: "Turn the Q3 numbers into a 10 slide investor update with one chart per slide.",
    steps: [
      { kind: "plan", name: "Read your files", done: "Q3 ledger and board notes", m: 0.6 },
      { kind: "search", name: "Outline 10 slides", done: "Story set, one idea per slide", m: 1 },
      { kind: "read", name: "Build the charts", file: "q3_ledger.xlsx", pages: 10, m: 2 },
      { kind: "write", name: "Lay out the deck", m: 2 },
    ],
  },
  sheet: {
    title: "Villa BOQ and budget",
    brief: "Build a BOQ and budget sheet for the villa, with formulas for quantities and totals.",
    steps: [
      { kind: "plan", name: "Read the drawings", done: "Plans, sections and finishes list", m: 1 },
      { kind: "search", name: "Take off quantities", done: "SRC line items", m: 2 },
      { kind: "read", name: "Write the formulas", file: "villa_drawings.pdf", pages: 8, m: 1 },
      { kind: "write", name: "Check the totals", m: 0.7 },
    ],
  },
  brief: {
    title: "Off grid solar board brief",
    brief: "Write a one page board brief on off grid solar for remote villages, with two decisions.",
    steps: [
      { kind: "plan", name: "Plan the brief", done: "One page, two decisions", m: 0.3 },
      { kind: "search", name: "Research the costs", done: "SRC sources found", m: 2 },
      { kind: "read", name: "Draft the page", file: "village_costs.csv", pages: 6, m: 1 },
      { kind: "write", name: "Tighten it", m: 0.5 },
    ],
  },
  monitor: {
    title: "PLN tariff watch",
    brief: "Watch PLN tariff changes in Indonesia and tell me when anything moves.",
    steps: [
      { kind: "plan", name: "Set the watch list", done: "PLN, ESDM and two news desks", m: 0.3 },
      { kind: "search", name: "First check", done: "SRC pages read", m: 1 },
      { kind: "read", name: "Record the baseline", file: "tariff_table.html", pages: 4, m: 0.5 },
      { kind: "write", name: "Schedule the next check", m: 0.2 },
    ],
  },
};

/** The picture card's brief is the studio's own default prompt (app.js state.studio.prompt). */
export const IMAGE_BRIEF = "A ceramic mug on a wooden table in soft morning light.";

/** The picture plan is fixed — you set the shot, Sutaeru draws it. */
const IMAGE_PLAN: AgentPlan = {
  rows: [
    { name: "You set up the shot", sub: "Shot, lens, light and look", time: "Next" },
    { name: "Sutaeru draws it", sub: "With the engine you pick", time: "15 s" },
    { name: "Saved to Files", sub: "Original size, ready to share", time: "1 s" },
  ],
  total: "About 15 s",
  credits: 2,
};

/** The step rail. The builder is always on step one. */
export const STEP_NAMES = ["Brief", "Look", "Build", "Done"] as const;
export const ACTIVE_STEP = 0;

export const BRIEF_QUESTION = "What should Sutaeru make?";
export const BRIEF_LEDE =
  "Describe the outcome. Sutaeru plans it, works on it and hands back a finished file. You can close the app while it works.";

/** Minutes stay minutes, sub-minute work is shown in seconds — exactly the prototype's rounding. */
function rowTime(min: number): string {
  return min < 1 ? `${Math.round(min * 60)} s` : `${Math.round(min)} min`;
}

/** The plan the side card shows for a choice of output and depth. */
export function planFor(type: AgentOutputId, depth: AgentDepthId): AgentPlan {
  if (type === "image") return IMAGE_PLAN;
  const D = depthOf(depth);
  const sample = BRIEF_SAMPLES[type];
  const rows = sample.steps.map((s) => {
    const min = s.m * (s.kind === "search" || s.kind === "read" ? D.scale : 1);
    const sub = (s.done ?? (s.file ? `Starts with ${s.file}` : "Formatted, cited, ready to send")).replace(
      "SRC",
      String(D.src)
    );
    return { name: s.name, sub, time: rowTime(min) };
  });
  const tot = sample.steps.reduce((a, s) => a + s.m * (s.kind === "search" || s.kind === "read" ? D.scale : 1), 0);
  return {
    rows,
    total: type === "monitor" ? "Then every 6 h" : `About ${Math.max(1, Math.round(tot))} min`,
    credits: D.credits,
  };
}

/** Depth only matters for the things that read and write. */
export function showsDepth(type: AgentOutputId): boolean {
  return type !== "image" && type !== "monitor";
}

/** "Web, My files" — or "No sources" when every toggle is off. */
export function sourceSummary(srcs: Record<AgentSourceId, boolean>): string {
  const names = SOURCE_OPTIONS.filter((s) => srcs[s.id]).map((s) => s.short);
  return names.join(", ") || "No sources";
}

/** The line above the Start button: "Report · Standard · Web, My files". */
export function summaryLine(state: AgentSelection): string {
  const out = OUTPUT_TYPES.find((o) => o.id === state.out) ?? OUTPUT_TYPES[0];
  const middle = showsDepth(state.out) ? ` · ${depthOf(state.depth).label}` : "";
  return `${out.name}${middle} · ${sourceSummary(state.srcs)}`;
}

export function costLine(plan: AgentPlan): string {
  return `${plan.total} · ${plan.credits} credits`;
}

/** Button copy per output type (app.js agent-start label). */
export function goLabel(type: AgentOutputId): string {
  if (type === "image") return "Set up the shot";
  if (type === "monitor") return "Start watching";
  return "Start";
}

/**
 * Picking another output replaces the brief, but only when the brief is still the sample
 * for the previous card (or empty) — a typed brief is never thrown away.
 */
export function swapBrief(previous: AgentOutputId, next: AgentOutputId, current: string): string {
  const before = previous === "image" ? IMAGE_BRIEF : BRIEF_SAMPLES[previous as DocKind]?.brief;
  const untouched = current.trim() === "" || (before !== undefined && current === before);
  if (before !== undefined && untouched) {
    return next === "image" ? IMAGE_BRIEF : BRIEF_SAMPLES[next as DocKind].brief;
  }
  if (previous === "image" && current === IMAGE_BRIEF) {
    return BRIEF_SAMPLES[next as DocKind].brief;
  }
  return current;
}

export function briefFor(type: AgentOutputId): string {
  return type === "image" ? IMAGE_BRIEF : BRIEF_SAMPLES[type as DocKind].brief;
}

/* ── Blocking Start ───────────────────────────────────────────────────────────
   The prototype always starts: it has no server. The real flow needs a non-empty
   message (pages/Chat.tsx handleSend returns early without one) and the workspace
   can run out of credits mid-run (a 402 from the stream). Both are surfaced here. */

export const BLANK_BRIEF_MESSAGE = "Add a brief so Sutaeru knows what to make.";

/** Verbatim from pages/Chat.tsx friendlyStatus(402). */
export const CREDITS_MESSAGE = "AI credits have run out. Ask the workspace owner to top up.";

export type AgentNoticeKind = "validation" | "credits";

export interface AgentNotice {
  kind: AgentNoticeKind;
  message: string;
}

/** Why Start is blocked, or null when the brief is ready to send. */
export function briefNotice(brief: string): AgentNotice | null {
  return brief.trim() === "" ? { kind: "validation", message: BLANK_BRIEF_MESSAGE } : null;
}

/** A send failure worth showing over the builder; credits get their own wording. */
export function failureNotice(message: string): AgentNotice {
  return { kind: isCreditMessage(message) ? "credits" : "validation", message };
}

export function isCreditMessage(message: string): boolean {
  return /credits have run out|insufficient credits|402/i.test(message);
}

/* ── State machine ──────────────────────────────────────────────────────────── */

export interface AgentSelection {
  out: AgentOutputId;
  depth: AgentDepthId;
  brief: string;
  srcs: Record<AgentSourceId, boolean>;
  notify: boolean;
}

export interface AgentState extends AgentSelection {
  status: "idle" | "submitting";
  notice: AgentNotice | null;
}

export const AGENT_DEFAULTS: AgentSelection = {
  out: "report",
  depth: "standard",
  brief: BRIEF_SAMPLES.report.brief,
  srcs: { web: true, files: true, drive: false, notion: false },
  notify: true,
};

export function initialAgentState(selection: AgentSelection = AGENT_DEFAULTS): AgentState {
  return { ...cloneSelection(selection), status: "idle", notice: null };
}

export type AgentAction =
  | { type: "selectOutput"; id: AgentOutputId }
  | { type: "setBrief"; value: string }
  | { type: "setDepth"; id: AgentDepthId }
  | { type: "toggleSource"; id: AgentSourceId }
  | { type: "setNotify"; value: boolean }
  | { type: "start" }
  | { type: "started" }
  | { type: "failed"; message: string }
  | { type: "dismiss" }
  | { type: "hydrate"; selection: AgentSelection };

const isOutputId = (id: string): id is AgentOutputId => OUTPUT_TYPES.some((o) => o.id === id);
const isDepthId = (id: string): id is AgentDepthId => DEPTH_LEVELS.some((d) => d.id === id);

/** Any edit clears the reason Start was blocked — the user is fixing it. */
export function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case "selectOutput": {
      if (!isOutputId(action.id) || action.id === state.out) return state;
      return {
        ...state,
        out: action.id,
        brief: swapBrief(state.out, action.id, state.brief),
        status: "idle",
        notice: null,
      };
    }
    case "setBrief":
      return { ...state, brief: action.value, notice: null };
    case "setDepth":
      return isDepthId(action.id) ? { ...state, depth: action.id, notice: null } : state;
    case "toggleSource":
      return { ...state, srcs: { ...state.srcs, [action.id]: !state.srcs[action.id] }, notice: null };
    case "setNotify":
      return { ...state, notify: action.value };
    case "start": {
      const notice = briefNotice(state.brief);
      if (notice) return { ...state, notice, status: "idle" };
      return { ...state, notice: null, status: "submitting" };
    }
    case "started":
      return { ...state, status: "idle", notice: null };
    case "failed":
      return { ...state, status: "idle", notice: failureNotice(action.message) };
    case "dismiss":
      return { ...state, notice: null };
    case "hydrate":
      return { ...initialAgentState(action.selection), status: state.status };
    default:
      return state;
  }
}

/**
 * What Start sends. The document types go through the chat's own send path, so the plan
 * travels inside the message text — there is no task or schedule API to post to.
 */
export function requestText(state: AgentSelection, plan: AgentPlan): string {
  const brief = state.brief.trim();
  const out = OUTPUT_TYPES.find((o) => o.id === state.out) ?? OUTPUT_TYPES[0];
  const bits = [out.name];
  if (showsDepth(state.out)) bits.push(`${depthOf(state.depth).label} depth`);
  if (state.out === "monitor") bits.push("every 6 hours");
  bits.push(`Sources: ${sourceSummary(state.srcs)}`);
  bits.push(plan.total);
  if (state.out !== "image") bits.push(`${plan.credits} credits`);
  const lines = [brief, "", `Plan: ${bits.join(" · ")}.`];
  if (state.notify) lines.push("Tell me on Telegram when it is done.");
  return lines.join("\n");
}

/* ── Persisting the draft ─────────────────────────────────────────────────────
   The prototype keeps the builder in memory, so the brief survives a trip to the photo
   studio and back. Same here, through sessionStorage: it is what makes the hand-off
   to /images not lose the brief. */

export const AGENT_STORAGE_KEY = "sutaeru.agent-builder";

function cloneSelection(s: AgentSelection): AgentSelection {
  return { ...s, srcs: { ...s.srcs } };
}

export function serializeSelection(state: AgentSelection): string {
  return JSON.stringify({
    out: state.out,
    depth: state.depth,
    brief: state.brief,
    srcs: { ...state.srcs },
    notify: state.notify,
  });
}

/** Nothing from storage is trusted: bad or missing fields fall back to the defaults. */
export function parseSelection(raw: string | null | undefined): AgentSelection | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const srcs = (d.srcs ?? {}) as Record<string, unknown>;
  const out = typeof d.out === "string" && isOutputId(d.out) ? d.out : AGENT_DEFAULTS.out;
  const depth = typeof d.depth === "string" && isDepthId(d.depth) ? d.depth : AGENT_DEFAULTS.depth;
  return {
    out,
    depth,
    brief: typeof d.brief === "string" ? d.brief : briefFor(out),
    srcs: {
      web: typeof srcs.web === "boolean" ? srcs.web : AGENT_DEFAULTS.srcs.web,
      files: typeof srcs.files === "boolean" ? srcs.files : AGENT_DEFAULTS.srcs.files,
      drive: typeof srcs.drive === "boolean" ? srcs.drive : AGENT_DEFAULTS.srcs.drive,
      notion: typeof srcs.notion === "boolean" ? srcs.notion : AGENT_DEFAULTS.srcs.notion,
    },
    notify: typeof d.notify === "boolean" ? d.notify : AGENT_DEFAULTS.notify,
  };
}

export function loadSelection(
  storage: Pick<Storage, "getItem"> | null | undefined
): AgentSelection | null {
  if (!storage) return null;
  try {
    return parseSelection(storage.getItem(AGENT_STORAGE_KEY));
  } catch {
    /* storage blocked (private mode) — the defaults are fine */
    return null;
  }
}

export function saveSelection(
  storage: Pick<Storage, "setItem"> | null | undefined,
  state: AgentSelection
): void {
  if (!storage) return;
  try {
    storage.setItem(AGENT_STORAGE_KEY, serializeSelection(state));
  } catch {
    /* quota or private mode — the draft is only a convenience */
  }
}
