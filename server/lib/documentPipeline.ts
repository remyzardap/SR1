/**
 * Documents: the generation pipeline behind POST /api/documents/generate.
 *
 * reading -> planning -> researching -> writing -> checking -> assembling
 *
 * The pipeline is transport-free: it reports through `emit(event, data)` and stops when `signal`
 * aborts. server/routers/documents.ts owns the HTTP side (session, quota, SSE).
 *
 * Models: planning, writing, repair and polish are single completions (server/lib/fnLlm `complete`);
 * research runs on the tool-using Kemma engine with web_search and browse only.
 *
 * Nothing here invents a source. A research note keeps its url only when the engine's own tools
 * returned that url (or the person supplied it), and a note with no verifiable origin is dropped.
 */

import { kemmaExecute, type EngineOutput } from "../kemma/engine";
import type { Tier } from "../core/kemmaRouter";
import { complete, type ChatMessage } from "./fnLlm";
import { FnError } from "./fnErrors";
import { isBlockedPrompt, BLOCKED_MESSAGE } from "./sensitive";
import { parseAttachments } from "./attachments";
import {
  KINDS,
  plannerPrompt,
  researchPrompt,
  sectionPrompt,
  polishPrompt,
  referencesFrom,
  qualityChecks,
  assignRefs,
  finalizeCitations,
  parseOutline,
  parseNotes,
  parsePolish,
  extractJson,
  countWords,
  type DocKind,
  type CitationStyle,
  type Outline,
  type OutlineSection,
  type Note,
} from "./documentKinds";
import { ingestSources, type SourceInput } from "./documentSources";

// ─── Request ──────────────────────────────────────────────────────────────────

export const MAX_BRIEF_CHARS = 8000;
const KIND_IDS: readonly DocKind[] = ["short", "medium", "academic"];
const STYLE_IDS: readonly CitationStyle[] = ["apa", "mla", "harvard", "ieee"];
const MAX_URLS = 8;
const MAX_HTML_BLOBS = 3;
const MAX_HTML_BYTES = 200 * 1024;

export interface GenerateRequest {
  brief: string;
  kind: DocKind;
  theme: string;
  style: CitationStyle;
  language?: string;
  sources: SourceInput;
}

/** Validates the body of POST /api/documents/generate. Throws FnError(400) with a user-safe message. */
export function parseGenerateRequest(body: unknown): GenerateRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FnError(400, "A JSON body is required.");
  const b = body as Record<string, unknown>;

  if (typeof b.brief !== "string" || !b.brief.trim()) throw new FnError(400, "Describe the document you want.");
  const brief = b.brief.trim();
  if (brief.length > MAX_BRIEF_CHARS) throw new FnError(400, `The description is too long (max ${MAX_BRIEF_CHARS} characters).`);

  if (typeof b.kind !== "string" || !KIND_IDS.includes(b.kind as DocKind)) throw new FnError(400, "Pick short, medium or academic.");
  const kind = b.kind as DocKind;

  // Medium reports are numbered (IEEE) unless the person chose a style; academic defaults to APA 7.
  let style: CitationStyle = kind === "medium" ? "ieee" : "apa";
  if (b.style !== undefined && b.style !== null && b.style !== "") {
    if (typeof b.style !== "string" || !STYLE_IDS.includes(b.style as CitationStyle)) throw new FnError(400, "That citation style is not supported.");
    style = b.style as CitationStyle;
  }

  const theme = typeof b.theme === "string" && /^[a-z0-9_-]{1,32}$/i.test(b.theme) ? b.theme : "corporate";

  let language: string | undefined;
  if (typeof b.language === "string" && b.language.trim()) language = b.language.trim().replace(/[^\p{L}\p{N} _()-]/gu, "").slice(0, 40) || undefined;

  const sources: SourceInput = {};
  const rawSources = b.sources;
  if (rawSources !== undefined && rawSources !== null) {
    if (typeof rawSources !== "object" || Array.isArray(rawSources)) throw new FnError(400, "sources is not valid.");
    const s = rawSources as Record<string, unknown>;

    const attachments = parseAttachments(s.attachments);
    if (attachments.length > 0) sources.attachments = attachments;

    if (s.urls !== undefined && s.urls !== null) {
      if (!Array.isArray(s.urls) || s.urls.some((u) => typeof u !== "string")) throw new FnError(400, "urls is not valid.");
      if (s.urls.length > MAX_URLS) throw new FnError(400, `Up to ${MAX_URLS} web links can be used at once.`);
      const urls = (s.urls as string[]).map((u) => u.trim().slice(0, 2000)).filter(Boolean);
      if (urls.length > 0) sources.urls = urls;
    }

    if (s.html !== undefined && s.html !== null) {
      if (!Array.isArray(s.html)) throw new FnError(400, "html is not valid.");
      if (s.html.length > MAX_HTML_BLOBS) throw new FnError(400, `Up to ${MAX_HTML_BLOBS} HTML sources can be used at once.`);
      const html = s.html.map((h) => {
        const item = h as { name?: unknown; html?: unknown };
        if (!item || typeof item.html !== "string") throw new FnError(400, "An HTML source is not valid.");
        if (Buffer.byteLength(item.html, "utf8") > MAX_HTML_BYTES) throw new FnError(400, "An HTML source is over the 200 KB limit.");
        return { name: typeof item.name === "string" ? item.name.slice(0, 120) : undefined, html: item.html };
      });
      if (html.length > 0) sources.html = html;
    }
  }

  return { brief, kind, theme, style, language, sources };
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export const CALL_CAPS: Record<DocKind, number> = { short: 6, medium: 40, academic: 60 };
export const TIME_CAPS_MS: Record<DocKind, number> = { short: 150_000, medium: 10 * 60_000, academic: 16 * 60_000 };

/** Raised when a per-request cap is hit. The pipeline stops cleanly and sends what it has. */
export class CapError extends Error {
  constructor(public readonly cap: "calls" | "time") {
    super(cap === "calls" ? "call cap" : "time cap");
    this.name = "CapError";
  }
}

/** Raised when the client went away. Nothing more is sent. */
export class ClientGoneError extends Error {
  constructor() {
    super("client aborted");
    this.name = "ClientGoneError";
  }
}

// ─── Progress ─────────────────────────────────────────────────────────────────

type StageId = "reading" | "planning" | "researching" | "writing" | "checking" | "assembling";
const STAGES: StageId[] = ["reading", "planning", "researching", "writing", "checking", "assembling"];
const STAGE_LABELS: Record<StageId, string> = {
  reading: "Reading your sources",
  planning: "Planning the structure",
  researching: "Researching",
  writing: "Writing",
  checking: "Checking quality",
  assembling: "Putting it together",
};

/** Share of the whole run each stage is worth. Reading is free (it ends before any model call). */
export const STAGE_WEIGHTS: Record<DocKind, Record<StageId, number>> = {
  short: { reading: 0, planning: 0.1, researching: 0.05, writing: 0.65, checking: 0.1, assembling: 0.1 },
  medium: { reading: 0, planning: 0.05, researching: 0.35, writing: 0.45, checking: 0.05, assembling: 0.1 },
  academic: { reading: 0, planning: 0.05, researching: 0.35, writing: 0.45, checking: 0.05, assembling: 0.1 },
};

export class ProgressTracker {
  private last = 0;
  private startedAt: number;
  constructor(private readonly kind: DocKind, private readonly emit: (p: { progress: number; etaSeconds: number | null }) => void, private readonly now: () => number = Date.now) {
    this.startedAt = now();
  }

  /** `fraction` is how much of `stage` is done (0..1). Emits only when the number goes up. */
  set(stage: StageId, fraction: number): number {
    const weights = STAGE_WEIGHTS[this.kind];
    let before = 0;
    for (const id of STAGES) {
      if (id === stage) break;
      before += weights[id];
    }
    const value = Math.min(1, Math.max(0, before + weights[stage] * Math.min(1, Math.max(0, fraction))));
    // Rounded to the percent so the stream is not flooded and the number can never wobble backwards.
    const rounded = Math.round(value * 100) / 100;
    if (rounded > this.last) {
      this.last = rounded;
      this.emit({ progress: rounded, etaSeconds: this.eta(rounded) });
    }
    return this.last;
  }

  private eta(progress: number): number | null {
    const elapsed = (this.now() - this.startedAt) / 1000;
    if (progress < 0.05 || elapsed < 2) return null;
    return Math.max(0, Math.round((elapsed / progress) * (1 - progress)));
  }
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function stripFences(text: string): string {
  return text.replace(/^```(?:markdown|md|text)?\s*\n/i, "").replace(/\n```\s*$/i, "").trim();
}

function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

const NEEDS_FACTS = /\b(19|20)\d{2}\b|\d|latest|current|recent|today|statistic|market|price|cost|news|how many|how much|compare|comparison|versus|\bvs\b|study|studies|research|trend|forecast|regulation|law\b|policy/i;

/** Whether a short document's brief calls for looked-up facts (one light research pass). */
export function briefNeedsFacts(brief: string): boolean {
  return NEEDS_FACTS.test(brief);
}

/** Outline section types the pipeline does not write itself: polish fills them (references come from the notes). */
const FILLED_BY_POLISH = new Set(['abstract', 'summary']);

interface WrittenSection { id: string; title: string; content: string }

// ─── Run ──────────────────────────────────────────────────────────────────────

export interface PipelineArgs {
  userId: number;
  tier: Tier;
  request: GenerateRequest;
  emit: (event: string, data: unknown) => void;
  /** Aborts when the client goes away. */
  signal: AbortSignal;
  /** Test hooks. */
  now?: () => number;
  callCap?: number;
  timeCapMs?: number;
}

export interface PipelineResult {
  status: "done" | "partial" | "failed" | "aborted";
  /** Model calls made (completions plus engine runs). */
  calls: number;
  engineCalls: number;
  tokens: number;
}

export async function runDocumentPipeline(args: PipelineArgs): Promise<PipelineResult> {
  const { userId, tier, request, signal } = args;
  const { kind, brief, style, language } = request;
  const plan = KINDS[kind];
  const now = args.now ?? Date.now;
  const startedAt = now();
  const callCap = args.callCap ?? CALL_CAPS[kind];
  const timeCap = args.timeCapMs ?? TIME_CAPS_MS[kind];

  // One controller covers both ways the run can stop early: the client leaving and the wall-time cap.
  const controller = new AbortController();
  const onClientAbort = () => controller.abort(new ClientGoneError());
  if (signal.aborted) return { status: "aborted", calls: 0, engineCalls: 0, tokens: 0 };
  signal.addEventListener("abort", onClientAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new CapError("time")), timeCap);
  const run = controller.signal;

  let calls = 0;
  let engineCalls = 0;
  let tokens = 0;

  // Nothing more is sent once the client is gone. A cap abort still reports what exists.
  const emit = (event: string, data: unknown) => {
    if (run.aborted && !(run.reason instanceof CapError)) return;
    args.emit(event, data);
  };
  const progress = new ProgressTracker(kind, (p) => emit("progress", p), now);

  const check = () => {
    if (run.aborted) throw run.reason instanceof CapError ? run.reason : new ClientGoneError();
  };
  const takeCall = () => {
    check();
    if (calls >= callCap) throw new CapError("calls");
    if (now() - startedAt >= timeCap) throw new CapError("time");
    calls += 1;
  };
  const remainingCalls = () => callCap - calls;

  /** Rejects as soon as the run aborts, so an engine call that cannot take a signal does not hold the request. */
  const raceAbort = <T>(p: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(run.reason instanceof CapError ? run.reason : new ClientGoneError());
      if (run.aborted) return onAbort();
      run.addEventListener("abort", onAbort, { once: true });
      p.then(
        (v) => { run.removeEventListener("abort", onAbort); resolve(v); },
        (e) => { run.removeEventListener("abort", onAbort); reject(e); }
      );
    });

  const llm = async (system: string, user: string, purpose: string, maxTokens: number, reasoning: "low" | "medium" = "low"): Promise<string> => {
    takeCall();
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    const result = await raceAbort(complete(messages, { userId, slot: "chat", reasoning, purpose: `documents:${purpose}`, maxTokens, signal: run }));
    tokens += result.inputTokens + result.outputTokens;
    check();
    return result.text;
  };

  const stage = (id: StageId) => {
    check();
    emit("stage", { id, label: STAGE_LABELS[id], step: STAGES.indexOf(id) + 1, steps: STAGES.length });
  };

  // State kept outside the try so a cap can still assemble what exists.
  let outline: Outline | null = null;
  const written: WrittenSection[] = [];
  const notes: Note[] = [];
  let sourcesUsed = 0;
  let summary: string | null = null;
  let abstract: string | null = null;

  /**
   * The report in the existing schema. `rendered` turns the stable [n] markers into the style's in-text form
   * (author-year for APA, MLA and Harvard; IEEE keeps numbers in citation order) and builds the reference list
   * from the same notes, so text and list always agree. A draft (rendered false) keeps [n] for qualityChecks.
   */
  const buildReport = (rendered: boolean) => {
    const front: WrittenSection[] = [];
    if (kind === "academic") {
      const text = abstract ?? summary;
      if (text) front.push({ id: "abstract", title: "Abstract", content: text });
    } else if (summary) {
      front.push({ id: "summary", title: "Executive Summary", content: summary });
    }
    const frontType = front.length > 0 ? (front[0].id === "abstract" ? "abstract" : "summary") : "section";
    let sections = [...front, ...written];
    let refs: string[];
    if (rendered) {
      const done = finalizeCitations({ sections, notes, style });
      sections = done.sections;
      refs = done.references;
    } else {
      refs = referencesFrom(notes, style);
    }
    refs = refs.filter((r) => typeof r === "string" && r.trim());
    const date = new Date(now()).toISOString().slice(0, 10);
    const title = outline?.title ?? "Untitled document";
    const out: Array<Record<string, unknown>> = [{ id: "cover", type: "cover", title, content: `Prepared ${date}` }];
    sections.forEach((sec, i) => {
      out.push({ id: sec.id, type: i < front.length ? frontType : "section", title: sec.title, content: sec.content.slice(0, 29_000) });
    });
    if (refs.length > 0 && (kind !== "short" || notes.length > 0)) {
      out.push({ id: "references", type: "references", title: "References", style, content: refs.join("\n").slice(0, 29_000) });
    }
    return { title, subtitle: outline?.subtitle ?? null, theme: request.theme, author: null, date, sections: out };
  };

  const finishPartial = (message: string): PipelineResult => {
    if (written.length > 0) {
      progress.set("assembling", 1);
      emit("report", buildReport(true));
    }
    emit("error", { message });
    return { status: written.length > 0 ? "partial" : "failed", calls, engineCalls, tokens };
  };

  try {
    // ── reading ──
    stage("reading");
    if (isBlockedPrompt(brief)) {
      emit("error", { message: BLOCKED_MESSAGE });
      return { status: "failed", calls, engineCalls, tokens };
    }
    const streamed = new Set<string>();
    const notice = (message: string) => {
      if (streamed.has(message)) return;
      streamed.add(message);
      emit("notice", { message });
    };
    const ingested = await ingestSources({ userId, input: request.sources, signal: run, onNotice: notice });
    check();
    // The helper may report a notice through onNotice, in its result, or both: each is forwarded once.
    for (const m of ingested.notices) notice(m);
    if (isBlockedPrompt(ingested.context)) {
      emit("error", { message: BLOCKED_MESSAGE });
      return { status: "failed", calls, engineCalls, tokens };
    }
    const sourceContext = ingested.context;
    for (const s of ingested.used) {
      emit("source", { id: s.id, title: s.title, ...(s.url ? { url: s.url } : {}) });
      sourcesUsed += 1;
    }
    const userSourceTitles = ingested.used.map((s) => s.title.toLowerCase());
    const userSourceUrls = new Set(ingested.used.map((s) => (s.url ? normaliseUrl(s.url) : "")).filter(Boolean));
    for (const u of request.sources.urls ?? []) userSourceUrls.add(normaliseUrl(u));

    // ── planning ──
    stage("planning");
    const prompt = plannerPrompt({ kind, brief, sourceContext, style, language });
    let parsedOutline: Outline | null = null;
    for (let attempt = 0; attempt < 2 && !parsedOutline; attempt++) {
      const user = attempt === 0 ? prompt.user : `${prompt.user}\n\nYour previous reply was not valid JSON or did not follow the schema. Reply with the JSON object only, no commentary and no code fences.`;
      const text = await llm(prompt.system, user, "plan", 3000);
      const json = extractJson(text) as { refused?: unknown } | null;
      if (json && json.refused === true) {
        // The planner declined an unsafe brief: no further model spend.
        emit("error", { message: BLOCKED_MESSAGE });
        return { status: "failed", calls, engineCalls, tokens };
      }
      parsedOutline = parseOutline(json ?? text, kind);
    }
    if (!parsedOutline) {
      emit("error", { message: "I could not plan this document. Please try again." });
      return { status: "failed", calls, engineCalls, tokens };
    }
    outline = parsedOutline;

    // The call budget has to cover: one write per section, one polish, and (not for short) up to two repairs.
    const repairReserve = kind === "short" ? 0 : 2;
    const researchReserve = kind === "short" && briefNeedsFacts(brief) ? 1 : 0;
    const reserve = 1 + repairReserve;
    const isWritable = (t: OutlineSection) => !FILLED_BY_POLISH.has(t.type) && t.type !== "references";
    let writable = outline.sections.filter(isWritable);
    if (writable.length + reserve + researchReserve > remainingCalls()) {
      const room = Math.max(1, remainingCalls() - reserve - researchReserve);
      const kept = new Set(fitSections(writable, room).map((x) => x.id));
      outline = { ...outline, sections: outline.sections.filter((x) => !isWritable(x) || kept.has(x.id)) };
      writable = outline.sections.filter(isWritable);
    }
    emit("outline", { title: outline.title, subtitle: outline.subtitle, sections: outline.sections.map((x) => ({ id: x.id, title: x.title })) });
    progress.set("planning", 1);

    // ── researching ──
    const noteIdxBySection = new Map<string, number[]>();
    const seenSourceKeys = new Set<string>();
    const registerNotes = (sectionIds: string[], list: Note[]) => {
      const first = notes.length;
      for (const n of list) {
        notes.push(n);
        const key = (n.url ? normaliseUrl(n.url) : n.sourceTitle.toLowerCase());
        if (!seenSourceKeys.has(key) && !userSourceTitles.includes(n.sourceTitle.toLowerCase()) && !(n.url && userSourceUrls.has(normaliseUrl(n.url)))) {
          seenSourceKeys.add(key);
          sourcesUsed += 1;
          emit("source", { id: `web${seenSourceKeys.size}`, title: n.sourceTitle, ...(n.url ? { url: n.url } : {}) });
        }
      }
      const idx = Array.from({ length: notes.length - first }, (_, i) => first + i);
      for (const id of sectionIds) noteIdxBySection.set(id, idx);
    };

    const doResearch = async (section: OutlineSection): Promise<Note[]> => {
      takeCall();
      engineCalls += 1;
      const output: EngineOutput = await raceAbort(
        kemmaExecute({
          userId,
          messages: [{ role: "user", content: researchPrompt({ kind, section, brief, sourceContext }) }],
          tier,
          isThinking: false,
          allowedTools: ["web_search", "browse"],
          toolBudget: plan.research === "scholarly" ? 8 : plan.research === "full" ? 5 : 3,
          isSubAgent: true,
        })
      );
      tokens += output.tokensUsed?.total ?? 0;
      if (output.isError || (output.modelsUsed.length === 0 && output.stepsUsed === 0)) {
        emit("notice", { message: `Research for "${section.title}" could not be completed, so that part relies on your own material.` });
        return [];
      }
      return extractNotes(output, userSourceTitles, userSourceUrls);
    };

    if (plan.research === "light") {
      // Short: one light pass over the whole brief, only when it asks for facts.
      if (briefNeedsFacts(brief) && remainingCalls() > writable.length + reserve) {
        stage("researching");
        const whole: OutlineSection = { id: "all", title: outline.title, purpose: brief.slice(0, 400), researchQuestions: writable.map((s) => s.title), targetWords: 0, type: "section" };
        try {
          registerNotes(writable.map((x) => x.id), await doResearch(whole));
        } catch (err) {
          if (err instanceof CapError || err instanceof ClientGoneError) throw err;
          emit("notice", { message: "I could not look up extra facts, so this draws on what you provided." });
        }
      }
      progress.set("researching", 1);
    } else {
      stage("researching");
      const list = writable;
      const writes = list.length;
      let doneCount = 0;
      for (let i = 0; i < list.length; i += 3) {
        check();
        const spare = Math.max(0, remainingCalls() - writes - reserve);
        const batch = list.slice(i, i + 3).slice(0, spare);
        if (batch.length < Math.min(3, list.length - i)) {
          emit("notice", { message: "Some extra research was skipped to stay inside the request limit." });
        }
        const results = await Promise.all(
          batch.map(async (s) => {
            try {
              return { id: s.id, notes: await doResearch(s) };
            } catch (err) {
              if (err instanceof CapError || err instanceof ClientGoneError) throw err;
              emit("notice", { message: `Research for "${s.title}" could not be completed, so that part relies on your own material.` });
              return { id: s.id, notes: [] as Note[] };
            }
          })
        );
        for (const r of results) {
          registerNotes([r.id], r.notes);
        }
        doneCount += Math.min(3, list.length - i);
        progress.set("researching", doneCount / list.length);
      }
      if (notes.length === 0) {
        emit("notice", { message: "Research found no usable sources. The text says so where evidence is missing instead of guessing." });
      }
    }

    // ── writing ──
    stage("writing");
    // Reference numbers are fixed once, here: the [n] a section uses is its final position in the list.
    const refNotes = assignRefs(notes, style);
    const toWrite = writable;
    const writeOne = async (section: OutlineSection, extra?: string): Promise<string> => {
      const sectionNotes = kind === "short" ? refNotes : (noteIdxBySection.get(section.id) ?? []).map((i) => refNotes[i]);
      const p = sectionPrompt({
        kind,
        section,
        notes: sectionNotes,
        outline: outline!,
        written: written.filter((w) => w.id !== section.id),
        brief,
        style,
      });
      const system = extra ? `${p.system}\n\n${extra}` : p.system;
      const maxTokens = Math.min(4000, Math.max(700, Math.round((section.targetWords || 400) * 2.4)));
      const text = stripFences(await llm(system, p.user, "section", maxTokens, kind === "academic" ? "medium" : "low"));
      if (!text) throw new Error("empty section");
      return text;
    };

    for (let i = 0; i < toWrite.length; i++) {
      const section = toWrite[i];
      let content: string;
      try {
        content = await writeOne(section);
      } catch (err) {
        if (err instanceof CapError || err instanceof ClientGoneError) throw err;
        try {
          content = await writeOne(section);
        } catch (err2) {
          if (err2 instanceof CapError || err2 instanceof ClientGoneError) throw err2;
          return finishPartial("Writing stopped part way. Here is what was finished.");
        }
      }
      written.push({ id: section.id, title: section.title, content });
      emit("section", { id: section.id, title: section.title, content });
      progress.set("writing", (i + 1) / toWrite.length);
    }

    // ── checking ──
    stage("checking");
    const researchAvailable = notes.length > 0;
    // The abstract and summary are written at the end: a stand-in keeps the structure check from flagging them.
    if (kind === "academic") abstract = "Abstract pending final polish of the full document text.";
    const verdict = qualityChecks({ kind, report: buildReport(false), outline, researchAvailable });
    abstract = null;
    if (!verdict.ok && remainingCalls() > 1) {
      const failing = failingSections(verdict.problems, written, outline.sections);
      for (const target of failing) {
        if (remainingCalls() <= 1) break; // keep the last call for the polish
        const section = outline.sections.find((s) => s.id === target.id);
        if (!section) continue;
        try {
          const revised = await writeOne(
            section,
            `REVISION: the first draft of this section had these problems. Fix them without adding unsupported claims or repeating other sections.\n${verdict.problems.map((p) => `- ${p}`).join("\n")}\nCurrent draft:\n${target.content}`
          );
          const idx = written.findIndex((w) => w.id === target.id);
          if (idx >= 0) {
            written[idx] = { ...written[idx], content: revised };
            emit("section", { id: target.id, title: written[idx].title, content: revised });
          }
        } catch (err) {
          if (err instanceof CapError || err instanceof ClientGoneError) throw err;
          // A failed repair keeps the first draft.
        }
      }
    }
    progress.set("checking", 1);

    // ── assembling ──
    stage("assembling");
    let polished: ReturnType<typeof parsePolish> = null;
    if (remainingCalls() >= 1) {
      try {
        const p = polishPrompt({ kind, outline, sections: written, style });
        polished = parsePolish(await llm(p.system, p.user, "polish", 1800));
      } catch (err) {
        if (err instanceof CapError || err instanceof ClientGoneError) throw err;
        // Fall back to a summary built from the document's own words.
      }
    }
    summary = polished?.summary || fallbackSummary(written);
    abstract = polished?.abstract || null;
    if (polished?.conclusionFix) {
      const idx = written.findIndex((w) => /conclusion/i.test(w.title));
      if (idx >= 0) {
        written[idx] = { ...written[idx], content: polished.conclusionFix };
        emit("section", { id: written[idx].id, title: written[idx].title, content: written[idx].content });
      }
    }

    // Last step before export: markers become the style's in-text citations, then one more check.
    const report = buildReport(true);
    const final = qualityChecks({ kind, report, outline, researchAvailable, rendered: true, style });
    if (!final.ok) console.warn(`[documents] finished with ${final.problems.length} quality note(s) for user ${userId}`);
    emit("report", report);
    progress.set("assembling", 1);

    emit("done", {
      tookSeconds: Math.round((now() - startedAt) / 100) / 10,
      words: final.words,
      pages: final.pages,
      sources: sourcesUsed,
    });
    return { status: "done", calls, engineCalls, tokens };
  } catch (err) {
    if (err instanceof ClientGoneError || (run.aborted && !(run.reason instanceof CapError))) {
      return { status: "aborted", calls, engineCalls, tokens };
    }
    if (err instanceof CapError) {
      return finishPartial(
        err.cap === "time"
          ? "This took longer than the time limit allows, so I stopped. Here is what was finished."
          : "This reached the limit on work for one document, so I stopped. Here is what was finished."
      );
    }
    console.error("[documents] generation failed:", err instanceof Error ? err.message : err);
    return finishPartial("The document could not be completed. Please try again.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onClientAbort);
  }
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

/** Keeps `room` sections: the opening ones and the final one, so the document still has a start and an end. */
export function fitSections(sections: OutlineSection[], room: number): OutlineSection[] {
  if (sections.length <= room) return sections;
  if (room <= 1) return sections.slice(0, 1);
  return [...sections.slice(0, room - 1), sections[sections.length - 1]];
}

/**
 * Turns the engine's answer into notes, and removes anything it cannot vouch for: a url survives only when
 * the engine's tools returned it (or the person supplied it); a note with neither a verified url nor the title
 * of one of the person's own sources or of a tool-returned page is dropped.
 */
export function extractNotes(output: EngineOutput, userTitles: string[], userUrls: Set<string>): Note[] {
  const list = parseNotes(output.response ?? "");
  const toolUrls = new Set((output.sources ?? []).map((src) => normaliseUrl(src.url)));
  const toolTitles = new Set((output.sources ?? []).map((src) => src.title.trim().toLowerCase()));
  const accessed = new Date().toISOString().slice(0, 10);
  const out: Note[] = [];
  for (const n of list.slice(0, 40)) {
    let url = n.url;
    if (url && !toolUrls.has(normaliseUrl(url)) && !userUrls.has(normaliseUrl(url))) url = undefined;
    const lower = n.sourceTitle.trim().toLowerCase();
    const known = !!url || userTitles.includes(lower) || toolTitles.has(lower);
    if (!known) continue;
    const { url: _drop, ...rest } = n;
    out.push({ ...rest, ...(url ? { url } : {}), accessed: n.accessed || accessed });
  }
  return out;
}

/** The sections a quality problem points at: named by id or title, else the thinnest ones against their target. */
export function failingSections(problems: string[], written: WrittenSection[], outline: OutlineSection[]): WrittenSection[] {
  const text = problems.join("\n").toLowerCase();
  const named = written.filter((w) => text.includes(w.id.toLowerCase()) || (w.title.length > 3 && text.includes(w.title.toLowerCase())));
  if (named.length > 0) return named.slice(0, 3);
  const targetOf = (id: string) => outline.find((s) => s.id === id)?.targetWords ?? 0;
  const ranked = written
    .map((w) => ({ w, ratio: targetOf(w.id) ? countWords(w.content) / targetOf(w.id) : 1 }))
    .sort((a, b) => a.ratio - b.ratio);
  const thin = ranked.filter((x) => x.ratio < 0.6).slice(0, 3);
  // A document that is too short overall with no single thin section: expand the two thinnest.
  if (thin.length === 0 && /too short/.test(text)) return ranked.slice(0, 2).map((x) => x.w);
  return thin.map((x) => x.w);
}

/** Used only when the polish call fails: the opening sentences of the first sections, in the document's own words. */
export function fallbackSummary(written: WrittenSection[]): string {
  const parts: string[] = [];
  for (const w of written.slice(0, 3)) {
    const first = w.content.replace(/\s+/g, " ").trim().match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
    if (first) parts.push(first);
  }
  return parts.join(" ").slice(0, 900) || "See the sections below.";
}
