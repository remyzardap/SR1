/* Typed document miniature data — copied from the prototype's docs.js DEFAULTS.
 *
 * These are the sample documents shown in the UI. Each kind has a cover photo
 * (from /studio/c/), a title, a kicker, and kind-specific figure data.
 * No rendering logic here — just the typed data.
 */

export type DocKind = "report" | "deck" | "sheet" | "brief" | "monitor";

export interface DocFigure {
  label: string;
  value: string;
}

export interface DocDefaultsBase {
  title: string;
  kicker: string;
  cover: string;
  meta?: string;
}

export interface DocReport extends DocDefaultsBase {
  kind: "report";
  figs: DocFigure[];
  bars: number[];
}

export interface DocDeck extends DocDefaultsBase {
  kind: "deck";
}

export interface DocSheet extends DocDefaultsBase {
  kind: "sheet";
}

export interface DocBrief extends DocDefaultsBase {
  kind: "brief";
}

export interface DocMonitor extends DocDefaultsBase {
  kind: "monitor";
}

export type DocData = DocReport | DocDeck | DocSheet | DocBrief | DocMonitor;

export const DOC_DEFAULTS: Record<DocKind, DocData> = {
  report: {
    kind: "report",
    title: "PV module supplier comparison",
    kicker: "Research report",
    cover: "cov-solar",
    figs: [
      { label: "Suppliers", value: "3" },
      { label: "Best / Wp", value: "0.11" },
      { label: "Fastest", value: "4 wk" },
    ],
    bars: [0.62, 0.7, 0.55, 0.86],
    meta: "Oct 2026 · 12 pages",
  },
  deck: {
    kind: "deck",
    title: "Q3 investor update",
    kicker: "TGWI · October 2026",
    cover: "cov-jakarta-bw",
    meta: "01 / 10",
  },
  sheet: {
    kind: "sheet",
    title: "Villa BOQ and budget",
    kicker: "Site · Seminyak",
    cover: "cov-villa",
  },
  brief: {
    kind: "brief",
    title: "Off grid solar for remote villages",
    kicker: "Board brief",
    cover: "cov-village",
  },
  monitor: {
    kind: "monitor",
    title: "PLN tariff watch",
    kicker: "Every 6 hours",
    cover: "cov-pylons",
  },
} as const;

/** Row data for the report table (Supplier, USD/Wp, Lead, Warranty). */
export interface ReportRow {
  supplier: string;
  usdPerWp: string;
  leadTime: string;
  warranty: string;
}

export const REPORT_ROWS: readonly ReportRow[] = [
  { supplier: "Jinko Tiger Neo", usdPerWp: "0.11", leadTime: "6 wk", warranty: "30 y" },
  { supplier: "LONGi Hi-MO 6", usdPerWp: "0.12", leadTime: "4 wk", warranty: "25 y" },
  { supplier: "Trina Vertex", usdPerWp: "0.11", leadTime: "8 wk", warranty: "30 y" },
  { supplier: "JA Solar DeepBlue", usdPerWp: "0.12", leadTime: "7 wk", warranty: "25 y" },
  { supplier: "Canadian TOPHiKu", usdPerWp: "0.13", leadTime: "5 wk", warranty: "25 y" },
] as const;

/** Slide data for the deck (simplified — the prototype generates HTML). */
export interface DeckSlide {
  number: string;
  title: string;
  content: string;
}

export const DECK_SLIDES: readonly DeckSlide[] = [
  { number: "03", title: "Three risks, three owners", content: "" },
  { number: "02", title: "Revenue", content: "+12%" },
  { number: "01", title: "Q3 investor update", content: "TGWI · October 2026" },
] as const;

/** Sheet row data (No, Item, Qty, Unit, Rate, Amount). */
export interface SheetRow {
  no: string;
  item: string;
  qty: string;
  unit: string;
  rate: string;
  amount: string;
}

export const SHEET_ROWS: readonly SheetRow[] = [
  { no: "1", item: "Foundations", qty: "84", unit: "m³", rate: "1.92m", amount: "161.3m" },
  { no: "2", item: "Columns and beams", qty: "46", unit: "m³", rate: "2.40m", amount: "110.4m" },
  { no: "3", item: "Brick walls", qty: "612", unit: "m²", rate: "185k", amount: "113.2m" },
  { no: "4", item: "Roof structure", qty: "238", unit: "m²", rate: "640k", amount: "152.3m" },
  { no: "5", item: "Floor tiles", qty: "420", unit: "m²", rate: "310k", amount: "130.2m" },
  { no: "6", item: "Plumbing", qty: "1", unit: "ls", rate: "186m", amount: "186.0m" },
  { no: "7", item: "Electrical", qty: "1", unit: "ls", rate: "214m", amount: "214.0m" },
] as const;

/** Brief decision items. */
export interface BriefDecision {
  label: string;
  text: string;
}

export const BRIEF_DECISIONS: readonly BriefDecision[] = [
  { label: "Decision 1", text: "Approve a pilot in one village" },
  { label: "Decision 2", text: "Apply for the capital grant" },
] as const;

/** Monitor chart data points (IDR/kWh). */
export const MONITOR_CHART_POINTS: readonly number[] = [62, 60, 61, 58, 59, 52, 54, 50, 51, 44, 46, 40];

/** All cover ids used by the defaults. */
export const DOC_COVER_IDS = Object.values(DOC_DEFAULTS).map((d) => d.cover) as readonly string[];

/** Look up defaults by kind. */
export function getDocDefaults(kind: DocKind): DocData {
  return DOC_DEFAULTS[kind];
}