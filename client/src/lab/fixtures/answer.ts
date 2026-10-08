import type { AnswerSource, ChartDatum } from "@/components/answer/AnswerParts";
import type { ActivityItem } from "@/components/ActivityFeed";
import type { ApprovalRequest } from "@/lib/sse";

/** Copied from the prototype (design/sutaeru-app/app.js: SAMPLE_Q, SOURCES, ANSWER, PAYBACK). */
export const ANSWER_QUESTION = "How fast do commercial rooftop systems pay back?";

export const ANSWER_SOURCES: AnswerSource[] = [
  { id: "src-fx-1", number: 1, host: "irena.org", title: "Renewable cost report" },
  { id: "src-fx-2", number: 2, host: "pln.co.id", title: "Rooftop PV tariff rules" },
  { id: "src-fx-3", number: 3, host: "esdm.go.id", title: "Net metering regulation" },
  { id: "src-fx-4", number: 4, host: "iea.org", title: "Solar PV in Southeast Asia" },
  { id: "src-fx-5", number: 5, host: "bnef.com", title: "Commercial PV capex outlook" },
];

export type AnswerSegment = string | { c: number };

export const ANSWER_SEGMENTS: AnswerSegment[] = [
  "Most commercial rooftop systems in Indonesia pay back in 4 to 6 years, depending on size and the PLN tariff class.",
  { c: 1 },
  { c: 2 },
  "Larger systems recover faster because installation cost per watt falls with scale.",
  { c: 3 },
];

export const ANSWER_TAIL: AnswerSegment[] = [
  "Net metering rules and the cap on export decide the upper end of the range.",
  { c: 4 },
  { c: 5 },
];

export const ANSWER_CHART: ChartDatum[] = [
  { label: "100 kWp", value: 5.9, unit: "y" },
  { label: "250 kWp", value: 5.1, unit: "y" },
  { label: "500 kWp", value: 4.6, unit: "y" },
  { label: "1 MWp", value: 4.2, unit: "y" },
];

export const ANSWER_FACTS: Array<[string, string]> = [
  ["Tariff class", "I-3 / TM"],
  ["Capex", "IDR 9.5 to 11m per kWp"],
  ["Typical IRR", "14 to 18%"],
];

export const ANSWER_RELATED = [
  "What affects the payback period most?",
  "Compare rooftop vs ground mount",
  "Show a 500 kWp cash flow",
];

export const ANSWER_STEPS: ActivityItem[] = [
  { id: "a1", kind: "search", status: "done", label: "Searched the web", detail: "rooftop solar payback Indonesia", durationMs: 2100 },
  { id: "a2", kind: "read", status: "done", label: "Read 5 sources", detail: "irena.org, pln.co.id, esdm.go.id", durationMs: 3400 },
  { id: "a3", kind: "write", status: "running", label: "Writing the answer" },
];

export const ANSWER_THINKING =
  "The question asks for a range. IRENA and PLN agree on 4 to 6 years; scale matters through capex per kWp. Cite the tariff rule for the upper end.";

export const ANSWER_APPROVAL: ApprovalRequest = {
  id: "fx-approval-1",
  tool: "files.save_report",
  title: "Save this answer as a report in Files?",
  preview: "Rooftop solar payback (report, 2 pages, cited)",
  args: { name: "Rooftop solar payback", format: "report", include_sources: true },
};
