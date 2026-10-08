/* Fixtures for /__lab/agent — one per state the reviewer must check.
   Sample data is the prototype's own (lib/agentBuilder), never invented. */

import {
  AGENT_DEFAULTS,
  BRIEF_SAMPLES,
  IMAGE_BRIEF,
  BLANK_BRIEF_MESSAGE,
  CREDITS_MESSAGE,
  planFor,
  type AgentDepthId,
  type AgentNotice,
  type AgentOutputId,
  type AgentSelection,
} from "@/lib/agentBuilder";

export interface AgentLabState {
  id: string;
  label: string;
  /** What the reviewer should look at. */
  note: string;
  agent: AgentSelection;
  status: "idle" | "submitting";
  notice: AgentNotice | null;
  redrawing: boolean;
}

/** The reducer's rule, applied by hand so every fixture shows the brief its card carries. */
function draft(out: AgentOutputId, depth: AgentDepthId = "standard", over: Partial<AgentSelection> = {}): AgentSelection {
  return {
    ...AGENT_DEFAULTS,
    srcs: { ...AGENT_DEFAULTS.srcs },
    out,
    depth,
    brief: out === "image" ? IMAGE_BRIEF : BRIEF_SAMPLES[out].brief,
    ...over,
  };
}

export const AGENT_LAB_STATES: readonly AgentLabState[] = [
  {
    id: "report",
    label: "Report",
    note: "The default draft: two sources on, Standard depth, four-row plan, About 5 min · 4 credits.",
    agent: draft("report"),
    status: "idle",
    notice: null,
    redrawing: false,
  },
  {
    id: "deck",
    label: "Deck",
    note: "Slides card selected — the deck miniature is cover photography over two dimmed slides.",
    agent: draft("deck"),
    status: "idle",
    notice: null,
    redrawing: false,
  },
  {
    id: "sheet",
    label: "Sheet",
    note: "Spreadsheet miniature with its formula bar; the last step is under a minute and shows seconds.",
    agent: draft("sheet"),
    status: "idle",
    notice: null,
    redrawing: false,
  },
  {
    id: "image",
    label: "Image",
    note: "Depth control hidden, live studio frame instead of a document, button reads Set up the shot.",
    agent: draft("image"),
    status: "idle",
    notice: null,
    redrawing: false,
  },
  {
    id: "brief",
    label: "Brief",
    note: "One-page miniature with the two decisions and the seal.",
    agent: draft("brief"),
    status: "idle",
    notice: null,
    redrawing: false,
  },
  {
    id: "monitor",
    label: "Monitor",
    note: "Depth control hidden, total reads Then every 6 h, button reads Start watching.",
    agent: draft("monitor"),
    status: "idle",
    notice: null,
    redrawing: false,
  },
  {
    id: "deep",
    label: "Deep",
    note: "Deep redraws every reading step: 40+ sources, longer minutes, nine credits.",
    agent: draft("report", "deep"),
    status: "idle",
    notice: null,
    redrawing: false,
  },
  {
    id: "no-sources",
    label: "No sources",
    note: "Every source toggle off: the summary says No sources and the plan still prices up.",
    agent: draft("brief", "quick", { srcs: { web: false, files: false, drive: false, notion: false } }),
    status: "idle",
    notice: null,
    redrawing: false,
  },
  {
    id: "redraw",
    label: "Plan redrawing",
    note: "The plan card mid-rework after a change: rows faded, aria-busy on the card.",
    agent: draft("sheet", "deep"),
    status: "idle",
    notice: null,
    redrawing: true,
  },
  {
    id: "validation",
    label: "Validation error",
    note: "Empty brief blocks Start: alert brackets on the field, the reason sits above the button.",
    agent: draft("report", "standard", { brief: "" }),
    status: "idle",
    notice: { kind: "validation", message: BLANK_BRIEF_MESSAGE },
    redrawing: false,
  },
  {
    id: "credits",
    label: "Insufficient credits",
    note: "A 402 from the send path, worded as the chat words it. Start stays enabled for a retry.",
    agent: draft("report", "deep"),
    status: "idle",
    notice: { kind: "credits", message: CREDITS_MESSAGE },
    redrawing: false,
  },
  {
    id: "submitting",
    label: "Submitting",
    note: "The draft is on its way: every control disabled, the button busy with a live dot.",
    agent: draft("monitor"),
    status: "submitting",
    notice: null,
    redrawing: false,
  },
] as const;

export const AGENT_LAB_DEFAULT = "report";

/** The plan a state shows — derived, never written by hand. */
export function labPlan(state: AgentLabState) {
  return planFor(state.agent.out, state.agent.depth);
}
