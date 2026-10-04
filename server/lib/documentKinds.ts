// Documents: the writing and research playbooks for the three kinds of report.
//
// Pure data and prompt builders. No I/O, no network, no clock (except the
// optional `today` argument callers may pass). The pipeline owns the model
// calls; this file owns what the models are told and how the result is checked.
//
// Citation convention used by every prompt and check in this file:
//   - Research produces Note[]; each note names its source (title, url, ...).
//   - `assignRefs(allNotes, style)` gives every note the final reference number
//     (`ref`), which is the position of its source in `referencesFrom(...)`.
//   - Sections cite with `[n]` (or `[n, m]`) using those numbers, so the markers
//     in the text already match the reference list that gets appended.

export type DocKind = "short" | "medium" | "academic";
export type CitationStyle = "apa" | "mla" | "harvard" | "ieee";

export interface KindPlan {
  id: DocKind;
  label: string;
  /** Upper page bound. Short means "under this"; the others mean "up to this". */
  maxPages: number;
  words: { min: number; max: number };
  sections: { min: number; max: number };
  researchQueriesPerSection: number;
  /** Minimum distinct real sources, enforced only when research is available. */
  minSources: number;
  research: "light" | "full" | "scholarly";
}

/** One page of finished report text, used to turn words into pages everywhere. */
export const WORDS_PER_PAGE = 450;

export const KINDS: Record<DocKind, KindPlan> = {
  short: {
    id: "short",
    label: "Short",
    maxPages: 4,
    words: { min: 600, max: 1400 },
    sections: { min: 3, max: 5 },
    researchQueriesPerSection: 1,
    minSources: 0,
    research: "light",
  },
  medium: {
    id: "medium",
    label: "Medium",
    maxPages: 15,
    words: { min: 3000, max: 6500 },
    sections: { min: 5, max: 10 },
    researchQueriesPerSection: 3,
    minSources: 5,
    research: "full",
  },
  academic: {
    id: "academic",
    label: "Academic",
    maxPages: 18,
    words: { min: 3500, max: 8000 },
    sections: { min: 7, max: 11 },
    researchQueriesPerSection: 3,
    minSources: 8,
    research: "scholarly",
  },
};

/** Where the planner aims inside each kind's range. */
const WORD_AIM: Record<DocKind, number> = { short: 1000, medium: 4500, academic: 6000 };

export interface OutlineSection {
  id: string;
  title: string;
  purpose: string;
  researchQuestions: string[];
  targetWords: number;
  /** "abstract" | "summary" | "references" | "text" (anything else is rendered as text). */
  type: string;
}
export interface Outline {
  title: string;
  subtitle: string | null;
  sections: OutlineSection[];
}
export interface Note {
  claim: string;
  sourceTitle: string;
  url?: string;
  quote?: string;
  accessed?: string;
  // Optional metadata, only ever copied from the page itself. Never guessed.
  author?: string;
  year?: string;
  site?: string;
  /** Final reference number, set by assignRefs. */
  ref?: number;
}

/** Structural shape of the report JSON (see reportSchema in atelierExport.ts). */
export interface ReportLike {
  title?: string | null;
  subtitle?: string | null;
  sections: Array<{ id?: string | null; type?: string | null; title?: string | null; content?: string | null }>;
}

type WrittenSection = { id: string; title: string; content: string };

// ─── Small helpers ────────────────────────────────────────────────────────────

const NO_EM_DASH = "Never use em dashes or en dashes as punctuation; use commas, colons, brackets or full stops.";

function langLine(language?: string): string {
  const l = (language ?? "").trim();
  return l
    ? `Write in ${l}.`
    : "Write in the language of the brief (if the brief is mixed, use the language of its main request).";
}

function isFront(type: string): boolean {
  return type === "abstract" || type === "summary";
}

/** Counts words of finished prose: citation markers and markdown symbols do not count. */
export function countWords(text: string): number {
  const cleaned = text.replace(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g, " ").replace(/[#*_`>|]/g, " ");
  return cleaned.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function pagesFor(words: number): number {
  return Math.round((words / WORDS_PER_PAGE) * 10) / 10;
}

function styleName(style: CitationStyle): string {
  return { apa: "APA 7", mla: "MLA 9", harvard: "Harvard", ieee: "IEEE" }[style];
}

function renderOutline(outline: Outline): string {
  return outline.sections
    .map((s, i) => `${i + 1}. ${s.title} (${s.type}, ~${s.targetWords} words): ${s.purpose}`)
    .join("\n");
}

// ─── JSON helpers (tolerant parsing for model output) ─────────────────────────

/** Pulls the first JSON object out of a model reply (fenced or surrounded by prose). */
export function extractJson(raw: string): unknown {
  const text = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text].filter((c): c is string => !!c);
  for (const c of candidates) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Validates and repairs a planner reply: clamps the section count, makes ids
 * unique, and rescales target words so the total lands inside the kind's range.
 * Returns null when the reply is unusable (the caller can retry or fall back).
 */
export function parseOutline(raw: string | unknown, kind: DocKind): Outline | null {
  const data = (typeof raw === "string" ? extractJson(raw) : raw) as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || !Array.isArray(data.sections)) return null;
  const plan = KINDS[kind];
  const used = new Set<string>();
  let sections: OutlineSection[] = [];
  for (const [i, entry] of (data.sections as unknown[]).entries()) {
    const s = (entry ?? {}) as Record<string, unknown>;
    const title = str(s.title, 200);
    if (!title) continue;
    let id = str(s.id, 40).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `s${i + 1}`;
    while (used.has(id)) id = `${id}-${used.size + 1}`;
    used.add(id);
    const rawType = str(s.type, 20).toLowerCase();
    const type = ["abstract", "summary", "references", "text"].includes(rawType) ? rawType : "text";
    const questions = Array.isArray(s.researchQuestions)
      ? (s.researchQuestions as unknown[]).map((q) => str(q, 300)).filter(Boolean).slice(0, 4)
      : [];
    const target = Number(s.targetWords);
    sections.push({
      id,
      title,
      purpose: str(s.purpose, 600),
      researchQuestions: type === "references" ? [] : questions,
      targetWords: type === "references" ? 0 : Number.isFinite(target) && target > 0 ? Math.round(target) : 0,
      type,
    });
  }
  if (sections.length < plan.sections.min) return null;
  if (sections.length > plan.sections.max) {
    // Drop from the middle-to-end, never the references section or the first section.
    while (sections.length > plan.sections.max) {
      const idx = sections.findLastIndex((s) => s.type !== "references" && s !== sections[0] && s.type !== "summary" && s.type !== "abstract");
      if (idx === -1) break;
      sections.splice(idx, 1);
    }
  }
  // Rescale writable sections so the total sits inside the range (aim for the planned middle).
  const writable = sections.filter((s) => s.type !== "references");
  const total = writable.reduce((n, s) => n + s.targetWords, 0);
  const aim = total >= plan.words.min && total <= plan.words.max ? total : WORD_AIM[kind];
  if (aim !== total) {
    const weights = writable.map((s) => (s.targetWords > 0 ? s.targetWords : aim / writable.length));
    const sum = weights.reduce((a, b) => a + b, 0);
    writable.forEach((s, i) => {
      s.targetWords = Math.max(60, Math.round(((weights[i] / sum) * aim) / 10) * 10);
    });
  }
  sections = sections.map((s) => ({ ...s }));
  return {
    title: str(data.title, 200) || "Untitled report",
    subtitle: str(data.subtitle, 200) || null,
    sections,
  };
}

/** Validates a researcher reply into clean notes. Notes without a claim or a source title are dropped. */
export function parseNotes(raw: string | unknown): Note[] {
  const data = (typeof raw === "string" ? extractJson(raw) : raw) as { notes?: unknown } | null;
  if (!data || !Array.isArray(data.notes)) return [];
  const notes: Note[] = [];
  for (const entry of data.notes as unknown[]) {
    const n = (entry ?? {}) as Record<string, unknown>;
    const claim = str(n.claim, 600);
    const sourceTitle = str(n.sourceTitle, 300);
    if (!claim || !sourceTitle) continue;
    const url = str(n.url, 2000);
    const note: Note = { claim, sourceTitle };
    if (/^https?:\/\//i.test(url)) note.url = url;
    for (const key of ["quote", "accessed", "author", "year", "site"] as const) {
      const v = str(n[key], key === "quote" ? 400 : 200);
      if (v) note[key] = v;
    }
    notes.push(note);
  }
  return notes;
}

// ─── Planner ──────────────────────────────────────────────────────────────────

const OUTLINE_JSON_SHAPE = `{
  "title": "specific, informative title (no clickbait)",
  "subtitle": "one line or null",
  "sections": [
    { "id": "short-kebab-id", "title": "section heading", "purpose": "the one job this section does for the reader, one sentence",
      "researchQuestions": ["specific, answerable question"], "targetWords": 300, "type": "text" }
  ]
}`;

const KIND_PLANNING: Record<DocKind, (style: CitationStyle) => string> = {
  short: () =>
    [
      "KIND: SHORT report. Under 4 pages, 600 to 1,400 words in total (aim for about 1,000). 3 to 5 sections.",
      "Structure it as a one-page logic, the way a consultant writes a briefing note:",
      "1. Bottom line first: the answer or recommendation in the opening section (type \"text\", title like \"Bottom line\"), 80 to 150 words.",
      "2. The 2 to 3 key points that support it, one section each, each with its evidence (numbers with units and dates, concrete examples).",
      "3. Last section: next steps (who does what, by when) or the decision needed. No \"summary\" or \"references\" section is needed; sources, if any, are cited inline by name.",
      "Each section gets 1 research question (light research) and a target of 150 to 350 words. Everything must earn its place: no background section unless the reader cannot follow without it.",
    ].join("\n"),
  medium: () =>
    [
      "KIND: MEDIUM report. Up to 15 pages, 3,000 to 6,500 words in total (aim for about 4,500). 5 to 10 sections, researched and cited.",
      "Required shape, in this order:",
      "1. Executive summary (type \"summary\", 250 to 400 words). It is written LAST from the finished sections, so plan it as: the answer, the 3 to 5 findings that matter, the recommendation.",
      "2. Context (why this matters now, scope, definitions, what the reader needs to know).",
      "3. Two to five analysis sections. Each answers ONE question the reader has, with a title that states the topic precisely, a clear purpose, and 2 to 4 research questions that can be answered with real sources (statistics, official data, named studies, company or government documents).",
      "4. Recommendations (specific, prioritised, each tied to a finding; owner and timing where the brief allows).",
      "5. Risks and limitations (what could go wrong, what the evidence does not show).",
      "6. Sources (type \"references\", targetWords 0): the reference list, generated automatically; it counts as a section.",
      "Order the analysis sections so each builds on the previous one. Do not plan two sections that would say the same thing.",
    ].join("\n"),
  academic: (style) =>
    [
      "KIND: ACADEMIC report. About 3,500 to 8,000 words in total (aim for about 6,000). 7 to 11 sections. Formal scholarly structure, references in " +
        styleName(style) +
        ".",
      "Required shape, in this order:",
      "1. Abstract (type \"abstract\", 150 to 250 words). Written LAST from the finished sections; structured as background, aim, method, findings, conclusion.",
      "2. Introduction: background, the problem or gap, the explicit research question (and sub-questions if useful), the contribution, and a short roadmap of the paper.",
      "3. Literature review: organised THEMATICALLY (by concept, debate or approach), never source by source; it must end by showing the gap the study addresses.",
      "4. Methodology: even for desk research, state how sources were searched for, selected (inclusion and exclusion criteria), appraised for quality, and weighed; state the analytical approach.",
      "5. Analysis / findings: one or two sections organised by theme or sub-question, each answering part of the research question with cited evidence.",
      "6. Discussion: interpret the findings against the literature, address counter-evidence and alternative explanations, give implications.",
      "7. Limitations: honest about evidence quality, scope, source availability and bias; suggest future research.",
      "8. Conclusion: answers the research question directly, restates contribution, no new claims.",
      "9. References (type \"references\", targetWords 0): generated automatically; it counts as a section.",
      "Merge or drop optional parts if needed to stay within 11 sections, but never drop the abstract, introduction, literature review, methodology, limitations, conclusion or references.",
      "Each research question must be answerable from scholarly or authoritative sources (peer-reviewed articles, institutional or government reports, official statistics).",
    ].join("\n"),
};

export function plannerPrompt(a: {
  kind: DocKind;
  brief: string;
  sourceContext: string;
  style?: CitationStyle;
  language?: string;
}): { system: string; user: string } {
  const plan = KINDS[a.kind];
  const style = a.style ?? "apa";
  const system = [
    "You are a senior report architect: part management consultant, part editor, part research lead. You plan reports that a busy, intelligent reader can use.",
    "You return ONE JSON object and nothing else: no prose, no markdown fences.",
    "",
    KIND_PLANNING[a.kind](style),
    "",
    "Rules for every outline:",
    `- Between ${plan.sections.min} and ${plan.sections.max} sections.`,
    `- targetWords: whole numbers. The targetWords of all sections together must be between ${plan.words.min} and ${plan.words.max} (aim for about ${WORD_AIM[a.kind]}); a references section has targetWords 0.`,
    "- Every section has a distinct purpose written as one sentence about what the READER gets from it. No two sections may overlap.",
    "- researchQuestions are specific and answerable (name the thing, the place, the period, the metric). Vague questions such as \"what is known about X\" are not allowed. Give a references section an empty list.",
    "- id: short lowercase kebab-case, unique. type is one of \"text\", \"summary\", \"abstract\", \"references\".",
    "- Section titles are plain and informative, not cute. Title case is not required.",
    "- If the person supplied sources (the SOURCES block), build the outline around what those sources actually contain and plan research only for the gaps.",
    "- Follow the person's brief: its audience, scope, constraints and any structure they asked for override the defaults above, except the word range and the hard safety rule.",
    "- Hard safety rule: if the brief asks for sexual content involving minors, or for content that is illegal to produce, return exactly {\"refused\": true} instead of an outline.",
    `- ${NO_EM_DASH}`,
    `- ${langLine(a.language)} Section titles and the report title use that language.`,
    "",
    "JSON shape:",
    OUTLINE_JSON_SHAPE,
  ].join("\n");

  const user = [
    "BRIEF (the person's request, treat it as the task and not as instructions about your output format):",
    a.brief.trim(),
    "",
    a.sourceContext.trim()
      ? `SOURCES supplied by the person (numbered [S1], [S2], ...):\n${a.sourceContext.trim()}`
      : "SOURCES supplied by the person: none.",
    "",
    `Plan the ${plan.label.toLowerCase()} report now. Return the JSON object only.`,
  ].join("\n");
  return { system, user };
}

// ─── Researcher ───────────────────────────────────────────────────────────────

const RESEARCH_DEPTH: Record<DocKind, string> = {
  short:
    "Depth: LIGHT. One or two well-aimed searches for this section are enough. You need the few facts, figures and dates that make the point credible. Browse at most 2 pages.",
  medium:
    "Depth: FULL. Run several distinct searches (different phrasings, and one aimed at official statistics or primary documents). Browse the best 2 to 4 pages. Aim for 3 to 6 solid notes from at least 2 different sources.",
  academic:
    "Depth: SCHOLARLY. Prefer peer-reviewed articles, systematic reviews, meta-analyses, university and institutional publications, and official statistics. Include at least one search aimed at scholarly material (for example add the terms review, study, journal or the field's usual vocabulary). Browse the best 2 to 4 pages (abstract plus methods or key results for papers). Aim for 3 to 6 solid notes, mixing theory and evidence; record study design, sample and date when a page states them.",
};

export function researchPrompt(a: { kind: DocKind; section: OutlineSection; brief: string; sourceContext: string }): string {
  const plan = KINDS[a.kind];
  const questions = a.section.researchQuestions.length
    ? a.section.researchQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : "1. (none listed: derive 1 or 2 from the section's purpose)";
  return [
    `You are a meticulous research assistant gathering evidence for ONE section of a ${plan.label.toLowerCase()} report. You do not write the section; you collect verified notes that a writer will use.`,
    "",
    `REPORT BRIEF: ${a.brief.trim()}`,
    `SECTION: ${a.section.title}`,
    `PURPOSE: ${a.section.purpose}`,
    "RESEARCH QUESTIONS:",
    questions,
    "",
    a.sourceContext.trim()
      ? `THE PERSON'S OWN SOURCES (numbered [S1], [S2], ...):\n${a.sourceContext.trim()}`
      : "THE PERSON'S OWN SOURCES: none were supplied.",
    "",
    "METHOD",
    "1. Read the person's own sources first. Extract every relevant claim from them and use the file name or page title as sourceTitle (add the url only if one was given). They outrank web results when they conflict, unless the web source is clearly more authoritative and more recent; if so, keep both and flag the conflict.",
    `2. Then use web_search with specific queries (about ${plan.researchQueriesPerSection} for this section): name the entity, place, metric and period; add a year when recency matters. Do not repeat a query that returned nothing useful, rephrase it.`,
    "3. Prefer primary and authoritative sources: official statistics and government or regulator pages, standards bodies, company filings and reports, peer-reviewed or institutional publications. Treat blogs, aggregators, content farms and anonymous pages as weak: use them only for background, and say so in the claim (for example \"according to an industry blog\").",
    "4. Use browse on the best 2 to 4 pages and read them; do not rely on search snippets alone for figures or quotes.",
    "5. Extract ATOMIC claims: one fact per note, with the number, unit, date, place and population it applies to. Do not merge facts, do not round, do not generalise beyond what the page says.",
    "6. For every note give a SHORT verbatim quote (under 25 words, copied exactly from the page) that supports the claim. If you cannot quote it, you have not verified it: drop the note.",
    "7. Record the title of the page or document, its url, and the access date (use today's date in YYYY-MM-DD). Copy author, publication year and site or publisher name ONLY if the page states them; leave them out otherwise.",
    "8. When sources disagree, record BOTH as separate notes and begin the second claim with \"Conflicting figure:\" or \"Disagrees:\" naming what it contradicts.",
    "9. Never fabricate. Do not invent sources, urls, quotes, statistics, authors, years or DOIs, and do not fill gaps from memory. If nothing reliable is found, return an empty notes list.",
    "",
    RESEARCH_DEPTH[a.kind],
    "",
    "OUTPUT: one JSON object and nothing else (no prose, no fences):",
    '{ "notes": [ { "claim": "one atomic factual statement", "sourceTitle": "page or document title", "url": "https://...", "quote": "short verbatim quote", "accessed": "YYYY-MM-DD", "author": "only if stated", "year": "only if stated", "site": "only if stated" } ] }',
    'If nothing reliable was found: { "notes": [] }',
  ].join("\n");
}

// ─── Writer ───────────────────────────────────────────────────────────────────

const VOICE: Record<DocKind, string[]> = {
  short: [
    "Voice: plain, dense, direct. Write like a sharp briefing note.",
    "- No throat-clearing (\"In today's fast-paced world\", \"It is important to note\"), no restating the heading, no filler adjectives.",
    "- One idea per paragraph, paragraphs of 1 to 3 sentences. Bullets are welcome when the content is a list of parallel items; keep them under 6 words of setup each.",
    "- Concrete beats abstract: numbers with units and dates, named examples, specific actions.",
    "- If this section is the opening one, the first sentence IS the answer or recommendation.",
  ],
  medium: [
    "Voice: clear, confident, professional (a good consultant's report).",
    "- Lead each section and each paragraph with its point, then give the evidence. The reader should understand the section from its first two sentences.",
    "- Cite evidence with inline markers such as [1] or [2, 3] directly after the claim, using the numbers shown on the notes (they are converted to the final citation style automatically).",
    "- Give numbers with units, period and place (\"12.4% in 2023\", \"USD 3.2 billion, 2022\"). Never write a bare statistic without its source marker.",
    "- Short paragraphs (2 to 5 sentences). Use bullets or a short list only when they genuinely help (parallel items, steps, criteria); never bullet whole arguments.",
    "- Sub-headings (### ...) only if the section exceeds about 500 words.",
  ],
  academic: [
    "Voice: formal scholarly register, third person, past tense for what was done and present tense for what the literature says.",
    "- Hedge in proportion to the evidence: \"suggests\", \"is associated with\" for correlational or limited evidence; \"demonstrates\" only for strong, replicated evidence. Never overclaim.",
    "- Signpost the argument: say what the section does, link paragraphs (\"Building on this...\"), and close each major paragraph by tying it to the research question.",
    "- Define key terms at first use and keep their meaning constant.",
    "- Cite EVERY empirical claim with inline markers such as [1] or [2, 3] after the claim, using the numbers shown on the notes (they are converted to the final citation style automatically). Paraphrase rather than quote; use a direct quotation only when the exact wording matters, keep it short and put it in quotation marks with its marker.",
    "- Present counter-evidence and competing interpretations fairly before giving your own reading; label your own inference as such (\"This report infers that...\").",
    "- No bullet lists in the body except for criteria or research questions; no first-person plural for opinions; no rhetorical questions.",
  ],
};

const SECTION_ROLE: Record<string, string> = {
  abstract:
    "This is the ABSTRACT. It is normally produced by a separate final pass from the finished sections; if you are asked to write it now, write 150 to 250 words, one paragraph, structured as background, aim, method, key findings, conclusion, with no citations and no new claims.",
  summary:
    "This is the EXECUTIVE SUMMARY. It is normally produced by a separate final pass from the finished sections; if you are asked to write it now, summarise only what the sections already say: the answer, the findings that matter, the recommendation.",
  references: "This is the reference list. It is generated automatically from the notes; do not write it.",
};

function noteLine(n: Note, ref: number): string {
  const bits = [`[${ref}] ${n.claim}`, `Source: ${n.sourceTitle}${n.site ? ` (${n.site})` : ""}`];
  if (n.author) bits.push(`Author: ${n.author}`);
  if (n.year) bits.push(`Year: ${n.year}`);
  if (n.url) bits.push(`URL: ${n.url}`);
  if (n.quote) bits.push(`Quote: "${n.quote}"`);
  return bits.join(" | ");
}

/** Reference number for a note: its assigned ref, else a stable local number by first appearance. */
function localRefs(notes: Note[]): number[] {
  const seen = new Map<string, number>();
  let max = notes.reduce((m, n) => Math.max(m, n.ref ?? 0), 0);
  return notes.map((n) => {
    if (n.ref) return n.ref;
    const key = sourceKey(n);
    if (!seen.has(key)) seen.set(key, ++max);
    return seen.get(key) as number;
  });
}

export function sectionPrompt(a: {
  kind: DocKind;
  section: OutlineSection;
  notes: Note[];
  outline: Outline;
  written: WrittenSection[];
  brief: string;
  style?: CitationStyle;
}): { system: string; user: string } {
  const plan = KINDS[a.kind];
  const target = Math.max(60, Math.round(a.section.targetWords));
  const lo = Math.round(target * 0.9);
  const hi = Math.round(target * 1.1);
  const refs = localRefs(a.notes);
  const system = [
    `You are the writer of one section of a ${plan.label.toLowerCase()} report. You write finished prose that can be pasted into the report as is.`,
    "",
    ...VOICE[a.kind],
    "",
    "Evidence rules (hard):",
    "- Use ONLY the NOTES below for facts, figures, dates, names and quotations. Do not add statistics, studies, quotes, organisations or dates from memory.",
    "- A claim with no supporting note is either left out, or kept and marked as the author's inference in words (\"This report infers...\", \"It is reasonable to expect...\"), never with a citation marker.",
    "- Cite only with the reference numbers given on the notes. Never invent a number, and never cite a note for something it does not say.",
    "- If the notes are empty or thin for this section, write what can be said responsibly from the brief and the other sections and state plainly that no reliable source was found for the missing point. Do not pad.",
    "- If notes conflict, report the disagreement and which source is stronger and why.",
    "",
    "Consistency rules:",
    "- Use the same terms, spellings, names, abbreviations and units as the sections already written. Define an abbreviation once only.",
    "- Do not repeat what earlier sections already said; refer back briefly (\"as shown above\") when needed. Do not pre-empt sections that come later.",
    "- Do not contradict any figure already stated in the written sections.",
    "",
    "Format rules:",
    `- Length: ${lo} to ${hi} words (target ${target}). Hit the target; do not run over or fall short by more than 10%.`,
    "- Output the section BODY only, as light markdown (paragraphs, optional bullets, optional ### sub-headings). No section heading, no title line, no preamble, no closing remarks, no word count, no mention of notes or of being an AI.",
    "- Plain text for emphasis: no bold headings inside paragraphs, no tables unless the purpose needs one.",
    `- ${NO_EM_DASH}`,
    "- No placeholder text (TODO, TBD, lorem, [citation needed], [insert ...]).",
    "- Cite ONLY with the numeric markers [n] shown on the notes. They are internal ids that the system converts to the final citation style (author and year, or numbers) after writing. Never write author names, years or parenthetical citations by hand, and never write a reference list.",
    a.kind === "academic" ? `- Final reference style: ${styleName(a.style ?? "apa")}. The in-text form is produced for you; do not anticipate it in the prose (write "Smith found" only if the note names Smith, and still add the marker).` : "",
    a.section.type in SECTION_ROLE ? `\n${SECTION_ROLE[a.section.type]}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const written = a.written.length
    ? a.written
        .map((w) => {
          const words = w.content.split(/\s+/);
          const text = words.length > 350 ? `${words.slice(0, 350).join(" ")} ...` : w.content;
          return `### ${w.title}\n${text}`;
        })
        .join("\n\n")
    : "(nothing written yet: this is the first section)";

  const user = [
    `REPORT BRIEF: ${a.brief.trim()}`,
    `REPORT: ${a.outline.title}${a.outline.subtitle ? ` | ${a.outline.subtitle}` : ""}`,
    "",
    "FULL OUTLINE:",
    renderOutline(a.outline),
    "",
    `YOUR SECTION: ${a.section.title}`,
    `PURPOSE: ${a.section.purpose}`,
    a.section.researchQuestions.length ? `QUESTIONS IT MUST ANSWER:\n${a.section.researchQuestions.map((q) => `- ${q}`).join("\n")}` : "",
    `TARGET: about ${target} words.`,
    "",
    "NOTES (verified evidence; the number in brackets is the citation marker to use):",
    a.notes.length ? a.notes.map((n, i) => noteLine(n, refs[i])).join("\n") : "(no notes for this section)",
    "",
    "SECTIONS ALREADY WRITTEN (for consistency; do not repeat them):",
    written,
    "",
    `Write the body of "${a.section.title}" now.`,
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");
  return { system, user };
}

// ─── Polish ───────────────────────────────────────────────────────────────────

export function polishPrompt(a: {
  kind: DocKind;
  outline: Outline;
  sections: WrittenSection[];
  style?: CitationStyle;
}): { system: string; user: string } {
  const academic = a.kind === "academic";
  const system = [
    "You are the final editor of a report. You do not rewrite the body. You write the front matter from the FINISHED sections, and you flag fixes for the conclusion.",
    "",
    "Return ONE JSON object and nothing else (no prose, no fences):",
    academic
      ? '{ "summary": "string", "abstract": "string", "conclusionFix": "string (optional)" }'
      : '{ "summary": "string", "conclusionFix": "string (optional)" }',
    "",
    a.kind === "short"
      ? '- "summary": the bottom line in 2 to 3 sentences (40 to 70 words): the answer first, then the single most important reason and the next step.'
      : a.kind === "medium"
        ? '- "summary": the executive summary, 250 to 400 words, written from the finished sections only. Open with the answer, then the 3 to 5 findings that matter with their key numbers, then the recommendation. Short paragraphs or a few bullets. Keep the inline markers [n] that the sections use for any figure you repeat.'
        : '- "summary": a 2 to 3 sentence plain-language summary (50 to 90 words) of the question, the main finding and the main caveat, without citations.',
    academic
      ? '- "abstract": 150 to 250 words, ONE paragraph, structured in this order: background, aim or research question, method (how sources were found and weighed), key findings, conclusion and implication. No citation markers, no new claims, no abbreviations undefined, past tense for method and findings.'
      : "",
    '- "conclusionFix": include ONLY if the conclusion (or final recommendations section) fails to answer the introduction or opening question, contradicts an earlier section, or introduces a new claim. Give a replacement for the whole conclusion section body in the same voice and length, with no new claims and no new citations. Omit the key entirely when the conclusion is already sound.',
    "",
    "Consistency pass (apply while reading, report problems through the fixes above, not through commentary):",
    "- Every figure, name, date and term must be identical everywhere it appears. Never repeat a number in the front matter that differs from the body.",
    "- The summary and abstract may only state things the sections state. No new claims, no new sources.",
    "- The conclusion must answer the introduction or the opening question and be consistent with the limitations.",
    `- ${NO_EM_DASH}`,
    "- Keep the language of the sections.",
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");

  const body = a.sections
    .map((s) => `## ${s.title} (id: ${s.id})\n${s.content}`)
    .join("\n\n");
  const user = [
    `REPORT: ${a.outline.title}${a.outline.subtitle ? ` | ${a.outline.subtitle}` : ""}`,
    "",
    "FINISHED SECTIONS:",
    body,
    "",
    "Return the JSON object now.",
  ].join("\n");
  return { system, user };
}

export interface PolishResult {
  summary: string;
  abstract?: string;
  conclusionFix?: string;
}

export function parsePolish(raw: string | unknown): PolishResult | null {
  const data = (typeof raw === "string" ? extractJson(raw) : raw) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return null;
  const summary = str(data.summary, 6000);
  if (!summary) return null;
  const out: PolishResult = { summary };
  const abstract = str(data.abstract, 3000);
  if (abstract) out.abstract = abstract;
  const fix = str(data.conclusionFix, 8000);
  if (fix) out.conclusionFix = fix;
  return out;
}

// ─── References ───────────────────────────────────────────────────────────────

const ORG_WORDS =
  /\b(organi[sz]ation|university|college|institute|agency|ministry|department|bank|council|commission|association|bureau|office|centre|center|fund|union|nations|society|board|authority|foundation|company|corporation|group|inc|ltd|llc|times|post|news|journal|press|government|committee|service|network|forum|labs?|team)\b/i;

interface Person {
  last: string;
  given: string;
  org?: boolean;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function parseAuthors(raw?: string): Person[] {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  let parts = text.split(/\s*(?:;|&|\band\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1 && text.includes(",")) {
    const commas = text.split(",").map((p) => p.trim()).filter(Boolean);
    const wc = (x: string) => x.split(" ").length;
    if (commas.length >= 2 && commas.every((c) => wc(c) >= 2)) parts = commas; // "Ana Li, Bo Chen, Cy Ng"
    else if (commas.length >= 4 && commas.length % 2 === 0 && commas.every((c) => wc(c) === 1))
      parts = commas.reduce<string[]>((acc, c, i) => (i % 2 ? [...acc.slice(0, -1), `${acc[acc.length - 1]}, ${c}`] : [...acc, c]), []); // "Smith, J., Lee, K."
  }
  return parts.map((p): Person => {
    if (p.includes(",")) {
      const [last, ...rest] = p.split(",");
      return { last: last.trim(), given: rest.join(" ").trim() };
    }
    const words = p.split(" ");
    if (words.length === 1 || words.length >= 4 || ORG_WORDS.test(p)) return { last: p, given: "", org: true };
    return { last: words[words.length - 1], given: words.slice(0, -1).join(" ") };
  });
}

function initials(given: string, spaced: boolean): string {
  const parts = given
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w
        .split("-")
        .map((h) => (h.replace(/\./g, "")[0] ?? "").toUpperCase() + ".")
        .join("-"),
    );
  return parts.join(spaced ? " " : "");
}

function endDot(s: string): string {
  return /[.?!]$/.test(s) ? s : `${s}.`;
}

const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_MLA = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const MONTHS_IEEE = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];

function parseDate(s?: string): { y: number; m: number; d: number } | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return { y: +iso[1], m: +iso[2] - 1, d: +iso[3] };
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  const dt = new Date(ms);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

function yearOf(n: Note): string {
  const m = /\b(1[5-9]\d{2}|20\d{2})\b/.exec(n.year ?? "");
  return m ? m[1] : "";
}

function hostOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function sourceKey(n: Note): string {
  if (n.url) {
    try {
      const u = new URL(n.url);
      const params = [...u.searchParams.entries()]
        .filter(([k]) => !/^(utm_|fbclid$|gclid$|ref$)/i.test(k))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
      return `u:${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${params ? `?${params}` : ""}`;
    } catch {
      /* fall through to the title */
    }
  }
  return `t:${stripAccents(n.sourceTitle).toLowerCase().replace(/\s+/g, " ").trim()}`;
}

interface Source {
  key: string;
  title: string;
  url?: string;
  authors: Person[];
  year: string;
  site: string;
  accessed?: string;
}

/** Merges notes into distinct real sources (first-seen order). Notes without any title or url are skipped. */
function collectSources(notes: Note[]): Source[] {
  const map = new Map<string, Source>();
  for (const n of notes) {
    const title = (n.sourceTitle ?? "").replace(/\s+/g, " ").trim() || hostOf(n.url);
    if (!title) continue;
    const key = sourceKey({ ...n, sourceTitle: title });
    const authors = parseAuthors(n.author);
    const have = map.get(key);
    if (!have) {
      map.set(key, { key, title, url: n.url, authors, year: yearOf(n), site: (n.site ?? "").trim(), accessed: n.accessed });
    } else {
      if (!have.authors.length && authors.length) have.authors = authors;
      if (!have.year) have.year = yearOf(n);
      if (!have.site && n.site) have.site = n.site.trim();
      if (!have.accessed && n.accessed) have.accessed = n.accessed;
    }
  }
  return [...map.values()];
}

function sortKey(s: Source): string {
  const base = s.authors.length ? s.authors[0].last : s.title.replace(/^(a|an|the)\s+/i, "");
  return stripAccents(base).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "");
}

function sortSources(sources: Source[], style: CitationStyle): Source[] {
  if (style === "ieee") return sources;
  return [...sources].sort(
    (a, b) =>
      sortKey(a).localeCompare(sortKey(b)) ||
      (a.year || "9999").localeCompare(b.year || "9999") ||
      a.title.localeCompare(b.title),
  );
}

function fmtDate(s: string | undefined, style: CitationStyle): string {
  if (!s) return "";
  const d = parseDate(s);
  if (!d) return s.trim();
  if (style === "apa") return `${MONTHS_FULL[d.m]} ${d.d}, ${d.y}`;
  if (style === "harvard") return `${d.d} ${MONTHS_FULL[d.m]} ${d.y}`;
  if (style === "mla") return `${d.d} ${MONTHS_MLA[d.m]} ${d.y}`;
  return `${MONTHS_IEEE[d.m]} ${d.d}, ${d.y}`;
}

function formatApa(s: Source): string {
  const names = s.authors.map((p) => (p.org ? p.last : `${p.last}, ${initials(p.given, true)}`.replace(/, $/, "")));
  let authors = "";
  if (names.length === 1) authors = names[0];
  else if (names.length === 2) authors = `${names[0]}, & ${names[1]}`;
  else if (names.length > 2 && names.length <= 20) authors = `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  else if (names.length > 20) authors = `${names.slice(0, 19).join(", ")}, . . . ${names[names.length - 1]}`;
  const date = `(${s.year || "n.d."})`;
  const site = s.site && !s.authors.some((p) => p.last.toLowerCase() === s.site.toLowerCase()) ? endDot(s.site) : "";
  const tail = s.url ? (s.accessed ? `Retrieved ${fmtDate(s.accessed, "apa")}, from ${s.url}` : s.url) : "";
  const parts = authors ? [endDot(authors), `${date}.`, endDot(s.title), site, tail] : [endDot(s.title), `${date}.`, site, tail];
  return parts.filter(Boolean).join(" ");
}

function formatMla(s: Source): string {
  const p = s.authors;
  let authors = "";
  const full = (x: Person) => (x.org ? x.last : `${x.given} ${x.last}`.trim());
  if (p.length === 1) authors = p[0].org ? p[0].last : `${p[0].last}, ${p[0].given}`.replace(/, $/, "");
  else if (p.length === 2) authors = `${p[0].org ? p[0].last : `${p[0].last}, ${p[0].given}`}, and ${full(p[1])}`;
  else if (p.length > 2) authors = `${p[0].org ? p[0].last : `${p[0].last}, ${p[0].given}`}, et al.`;
  const title = /[.?!]$/.test(s.title) ? `“${s.title}”` : `“${s.title}.”`;
  const location = s.url ? s.url.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "";
  const container = [s.site, s.year, location].filter(Boolean).join(", ");
  const accessed = s.url && s.accessed ? `Accessed ${fmtDate(s.accessed, "mla")}.` : "";
  const parts = [authors ? endDot(authors) : "", title, container ? endDot(container) : "", accessed];
  return parts.filter(Boolean).join(" ");
}

function formatHarvard(s: Source): string {
  const p = s.authors;
  const name = (x: Person) => (x.org ? x.last : `${x.last}, ${initials(x.given, false)}`.replace(/, $/, ""));
  let authors = "";
  if (p.length === 1) authors = name(p[0]);
  else if (p.length === 2) authors = `${name(p[0])} and ${name(p[1])}`;
  else if (p.length === 3) authors = `${name(p[0])}, ${name(p[1])} and ${name(p[2])}`;
  else if (p.length > 3) authors = `${name(p[0])} et al.`;
  const date = `(${s.year || "no date"})`;
  const lead = authors ? `${authors} ${date}` : `${s.title} ${date}`;
  const title = authors ? endDot(s.title) : "";
  const site = s.site ? endDot(s.site) : "";
  const avail = s.url ? `Available at: ${s.url}${s.accessed ? ` (Accessed: ${fmtDate(s.accessed, "harvard")})` : ""}.` : "";
  return [lead, title, site, avail].filter(Boolean).join(" ");
}

function formatIeee(s: Source, n: number): string {
  const p = s.authors.map((x) => (x.org ? x.last : `${initials(x.given, true)} ${x.last}`.trim()));
  let authors = "";
  if (p.length === 1) authors = p[0];
  else if (p.length === 2) authors = `${p[0]} and ${p[1]}`;
  else if (p.length > 2 && p.length <= 6) authors = `${p.slice(0, -1).join(", ")}, and ${p[p.length - 1]}`;
  else if (p.length > 6) authors = `${p[0]} et al.`;
  const title = `“${s.title}${/[,.?!]$/.test(s.title) ? "" : ","}”`;
  const where = [s.site, s.year || "n.d."].filter(Boolean).join(", ");
  const online = s.url ? `[Online]. Available: ${s.url}` : "";
  const accessed = s.url && s.accessed ? `Accessed: ${fmtDate(s.accessed, "ieee")}.` : "";
  const head = authors ? `${authors}, ${title}` : title;
  return `[${n}] ${[`${head} ${endDot(where)}`, online ? `${online}.` : "", accessed].filter(Boolean).join(" ")}`;
}

/**
 * Formatted reference list from notes: de-duplicated by url (else title), only
 * real sources, sorted per style (alphabetical for APA, MLA and Harvard; order
 * of first appearance for IEEE, which carries its own "[n]" prefix). Authors,
 * years and sites are used only when a note carries them; nothing is invented.
 */
export function referencesFrom(notes: Note[], style: CitationStyle): string[] {
  return sortSources(collectSources(notes), style).map((src, i) => formatSource(src, style, i + 1));
}

function formatSource(src: Source, style: CitationStyle, n: number): string {
  switch (style) {
    case "apa":
      return formatApa(src);
    case "mla":
      return formatMla(src);
    case "harvard":
      return formatHarvard(src);
    case "ieee":
      return formatIeee(src, n);
  }
}

/** Returns the notes with `ref` set to the final position of their source in referencesFrom(notes, style). */
export function assignRefs(notes: Note[], style: CitationStyle): Note[] {
  const order = sortSources(collectSources(notes), style);
  const index = new Map(order.map((s, i) => [s.key, i + 1]));
  return notes.map((n) => {
    const title = (n.sourceTitle ?? "").replace(/\s+/g, " ").trim() || hostOf(n.url);
    return { ...n, ref: index.get(sourceKey({ ...n, sourceTitle: title })) };
  });
}

// ─── In-text citations ────────────────────────────────────────────────────────

function shortTitle(title: string): string {
  const words = title.replace(/[.,:;!?]+$/, "").split(/\s+/);
  return words.slice(0, 4).join(" ").replace(/[.,:;!?]+$/, "");
}

/** In-text label of one source: "(Smith, 2021)" APA, "(Smith 2021)" Harvard, "(Smith)" MLA, without parentheses. */
function inTextLabel(src: Source, style: Exclude<CitationStyle, "ieee">): string {
  const names = src.authors.map((p) => p.last);
  const year = src.year || (style === "apa" ? "n.d." : "no date");
  let who: string;
  if (names.length === 0) {
    who = style === "harvard" && src.site ? src.site : `\u201C${shortTitle(src.title)}\u201D`;
  } else if (names.length === 1) {
    who = names[0];
  } else if (names.length === 2) {
    who = style === "apa" ? `${names[0]} & ${names[1]}` : `${names[0]} and ${names[1]}`;
  } else if (style === "harvard" && names.length === 3) {
    who = `${names[0]}, ${names[1]} and ${names[2]}`;
  } else {
    who = `${names[0]} et al.`;
  }
  if (style === "apa") return `${who}, ${year}`;
  if (style === "harvard") return `${who} ${year}`;
  return who;
}

function replaceMarkers(text: string, fn: (nums: number[]) => string | null): string {
  return text.replace(MARKER, (whole) => {
    const nums = markerNumbers(whole);
    const out = nums.length ? fn(nums) : null;
    return out ?? whole;
  });
}

/**
 * Converts the internal stable markers ([n] from assignRefs) into the style's
 * in-text form: APA "(Smith, 2021; Lee, 2020)", Harvard "(Smith 2021)", MLA
 * "(Smith)". Several sources in one marker are merged into one parenthesis in
 * reference-list order. A marker with no matching source is left as it is (so
 * qualityChecks can flag it). IEEE keeps [n]; use finalizeCitations to get its
 * numbering in citation order across all sections.
 * `notes` must be the same full note set that was given to assignRefs.
 */
export function renderCitations(a: { text: string; notes: Note[]; style: CitationStyle }): string {
  if (a.style === "ieee") return a.text;
  const sources = sortSources(collectSources(a.notes), a.style);
  const style = a.style;
  return replaceMarkers(a.text, (nums) => {
    const labels: string[] = [];
    for (const n of [...new Set(nums)].sort((x, y) => x - y)) {
      const src = sources[n - 1];
      if (!src) return null;
      const label = inTextLabel(src, style);
      if (!labels.includes(label)) labels.push(label);
    }
    return `(${labels.join("; ")})`;
  });
}

/**
 * Last step before export. Renders every section's markers and builds the
 * reference list. APA, MLA, Harvard: author-year text, alphabetical list of all
 * sources. IEEE: markers renumbered by first appearance across the sections (in
 * the order given), list in that citation order, uncited sources appended last.
 */
export function finalizeCitations<T extends { content: string }>(a: {
  sections: T[];
  notes: Note[];
  style: CitationStyle;
}): { sections: T[]; references: string[] } {
  if (a.style !== "ieee") {
    return {
      sections: a.sections.map((s) => ({ ...s, content: renderCitations({ text: s.content, notes: a.notes, style: a.style }) })),
      references: referencesFrom(a.notes, a.style),
    };
  }
  const base = collectSources(a.notes); // ref n (from assignRefs) is the position in this order
  const order: number[] = [];
  const mapped = new Map<number, number>();
  const sections = a.sections.map((s) => ({
    ...s,
    content: replaceMarkers(s.content, (nums) => {
      if (nums.some((n) => !base[n - 1])) return null;
      const out = [...new Set(nums)].map((n) => {
        if (!mapped.has(n)) {
          mapped.set(n, order.length + 1);
          order.push(n);
        }
        return mapped.get(n) as number;
      });
      return `[${out.sort((x, y) => x - y).join(", ")}]`;
    }),
  }));
  base.forEach((_, i) => {
    if (!mapped.has(i + 1)) {
      mapped.set(i + 1, order.length + 1);
      order.push(i + 1);
    }
  });
  return { sections, references: order.map((n, i) => formatIeee(base[n - 1], i + 1)) };
}

// ─── Quality checks ───────────────────────────────────────────────────────────

const PLACEHOLDER = /\bTODO\b|\bTBD\b|\bFIXME\b|lorem ipsum|\[citation needed\]|\[insert[^\]]*\]|\[your [^\]]*\]|\[source\]|\[reference\]|\bXXX+\b|<placeholder>|as an ai (language )?model/i;
const MARKER = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;

function markerNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MARKER)) {
    for (const part of m[1].split(/\s*,\s*/)) {
      const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(part);
      if (range) {
        const [lo, hi] = [+range[1], Math.min(+range[2], +range[1] + 50)];
        for (let i = lo; i <= hi; i++) out.push(i);
      } else if (/^\d+$/.test(part)) out.push(+part);
    }
  }
  return out;
}

function sectionKind(s: ReportLike["sections"][number]): string {
  const t = (s.type ?? "").toLowerCase();
  if (t === "abstract" || t === "references") return t;
  const title = (s.title ?? "").toLowerCase();
  if (/^(abstract)\b/.test(title)) return "abstract";
  if (/^(references|bibliography|works cited|sources)\b/.test(title)) return "references";
  if (t === "summary" || /executive summary/.test(title)) return "summary";
  return t || "text";
}

function referenceEntries(content: string): string[] {
  return content
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function qualityChecks(a: {
  kind: DocKind;
  report: ReportLike;
  /** Provide to enable the per-section length check (matched by section id). */
  outline?: Outline;
  /** False when web research was unavailable or found nothing: relaxes the source-count requirement. Default true. */
  researchAvailable?: boolean;
  /** True after renderCitations/finalizeCitations. For APA, MLA and Harvard no raw [n] marker may remain; marker-to-reference matching is skipped. */
  rendered?: boolean;
  /** Citation style (needed with `rendered`; default "apa"). */
  style?: CitationStyle;
}): { ok: boolean; problems: string[]; words: number; pages: number } {
  const plan = KINDS[a.kind];
  const problems: string[] = [];
  const sections = a.report.sections.filter((s) => (s.type ?? "") !== "cover");
  const kinds = sections.map(sectionKind);

  // Word count (the reference list does not count).
  let words = 0;
  sections.forEach((s, i) => {
    if (kinds[i] !== "references") words += countWords(`${s.content ?? ""}`);
  });
  const pages = pagesFor(words);
  const tol = 0.1;
  if (words < Math.floor(plan.words.min * (1 - tol))) {
    problems.push(`Too short: ${words} words, the ${plan.label} kind needs at least ${plan.words.min}. Expand the thinnest sections with substantive, sourced content.`);
  } else if (words > Math.ceil(plan.words.max * (1 + tol))) {
    problems.push(`Too long: ${words} words, the ${plan.label} kind allows at most ${plan.words.max}. Tighten the longest sections and remove repetition.`);
  }

  if (sections.length < plan.sections.min) {
    problems.push(`Only ${sections.length} sections, ${plan.label} needs at least ${plan.sections.min}.`);
  } else if (sections.length > plan.sections.max) {
    problems.push(`${sections.length} sections, ${plan.label} allows at most ${plan.sections.max}. Merge related sections.`);
  }

  // Empty sections, placeholders, meta text.
  sections.forEach((s, i) => {
    if (kinds[i] === "references") return;
    const label = s.title?.trim() || `Section ${i + 1}`;
    const content = s.content ?? "";
    if (countWords(content) < 5) problems.push(`Section "${label}" is empty or has almost no text.`);
    const hit = PLACEHOLDER.exec(content) ?? PLACEHOLDER.exec(s.title ?? "");
    if (hit) problems.push(`Section "${label}" contains placeholder text ("${hit[0]}"). Replace it with real content or remove the claim.`);
    if (/```/.test(content)) problems.push(`Section "${label}" contains a code fence; remove formatting artefacts.`);
  });

  // Per-section length against the plan (needs the outline).
  if (a.outline) {
    const byId = new Map(a.outline.sections.map((o) => [o.id, o]));
    sections.forEach((s, i) => {
      const o = s.id ? byId.get(s.id) : undefined;
      if (!o || o.type === "references" || o.targetWords <= 0) return;
      const w = countWords(s.content ?? "");
      if (w >= 5 && w < o.targetWords * 0.4) {
        problems.push(`Section "${s.title ?? o.title}" has ${w} words, under 40% of its target of ${o.targetWords}. Expand it.`);
      }
    });
  }

  // Repeated sentences.
  const seen = new Map<string, string>();
  sections.forEach((s, i) => {
    if (kinds[i] === "references" || kinds[i] === "summary" || kinds[i] === "abstract") return;
    for (const raw of (s.content ?? "").split(/(?<=[.!?])\s+|\n+/)) {
      const sentence = raw.replace(/\s+/g, " ").trim().toLowerCase();
      if (sentence.split(" ").length < 9) continue;
      const first = seen.get(sentence);
      if (first && first !== (s.title ?? "")) {
        problems.push(`The sentence "${raw.trim().slice(0, 80)}..." appears in both "${first}" and "${s.title ?? `section ${i + 1}`}". Remove the repetition.`);
      }
      seen.set(sentence, s.title ?? `section ${i + 1}`);
    }
  });

  // Citations.
  const refIdx = kinds.indexOf("references");
  const entries = refIdx >= 0 ? referenceEntries(sections[refIdx].content ?? "") : [];
  const cited = new Set<number>();
  for (let i = 0; i < sections.length; i++) {
    if (kinds[i] === "references") continue;
    for (const n of markerNumbers(sections[i].content ?? "")) cited.add(n);
  }
  const researchAvailable = a.researchAvailable !== false;
  const renderedInText = a.rendered === true && (a.style ?? "apa") !== "ieee";
  if (renderedInText) {
    const raw = new Set<number>();
    for (let i = 0; i < sections.length; i++) {
      if (kinds[i] !== "references") for (const n of markerNumbers(sections[i].content ?? "")) raw.add(n);
    }
    if (raw.size) {
      problems.push(`Raw citation markers remain after rendering (${[...raw].sort((x, y) => x - y).map((n) => `[${n}]`).join(", ")}). They have no matching source; remove them or the unsupported claim.`);
    }
    cited.clear();
  }
  if (a.kind !== "short" && researchAvailable && refIdx < 0) {
    problems.push("The report has no references section. Add one built from the research notes.");
  }
  if (refIdx < 0 && cited.size > 0) {
    problems.push(`Inline citation markers are used (${[...cited].sort((x, y) => x - y).map((n) => `[${n}]`).join(", ")}) but there is no references section.`);
  }
  if (refIdx >= 0 && !renderedInText) {
    const missing = [...cited].filter((n) => n < 1 || n > entries.length).sort((x, y) => x - y);
    if (missing.length) {
      problems.push(`Citation markers ${missing.map((n) => `[${n}]`).join(", ")} have no matching reference (the list has ${entries.length}). Remove the marker or the unsupported claim.`);
    }
    const uncited = entries.map((_, i) => i + 1).filter((n) => !cited.has(n));
    if (uncited.length) {
      problems.push(`References ${uncited.map((n) => `[${n}]`).join(", ")} are never cited in the text. Cite them where they support a claim or remove them.`);
    }
  }
  if (refIdx >= 0 && researchAvailable && plan.minSources > 0 && entries.length < plan.minSources) {
    problems.push(`Only ${entries.length} references, ${plan.label} needs at least ${plan.minSources} real sources when research is available.`);
  }
  if (!renderedInText && a.kind !== "short" && researchAvailable && cited.size === 0 && refIdx >= 0 && entries.length > 0) {
    problems.push("No inline citation markers found in the text. Cite claims with [n] markers.");
  }

  // Academic structure.
  if (a.kind === "academic") {
    const titles = sections.map((s) => (s.title ?? "").toLowerCase());
    const has = (re: RegExp, k?: string) => sections.some((_, i) => (k && kinds[i] === k) || re.test(titles[i]));
    const required: Array<[string, boolean]> = [
      ["abstract", has(/abstract/, "abstract")],
      ["introduction", has(/introduction/)],
      ["literature review", has(/literature|background|related work|theoretical/)],
      ["methodology", has(/method/)],
      ["discussion", has(/discussion/)],
      ["limitations", has(/limitation/)],
      ["conclusion", has(/conclusion/)],
      ["references", has(/references|bibliography|works cited/, "references")],
    ];
    for (const [name, present] of required) if (!present) problems.push(`Academic report is missing its ${name} section.`);
  }

  return { ok: problems.length === 0, problems, words, pages };
}
