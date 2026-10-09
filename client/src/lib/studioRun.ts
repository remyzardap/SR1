/* Image studio: engines, the suggestion rule, cost and time estimates.
   Engine ids are the real ones the server speaks; names and characters come from the prototype. */

import { direction, type Shot } from "@/lib/studio";

export type EngineId = "gemini" | "qwen" | "openai" | "forge";
export type Quality = "standard" | "high";

export interface Engine {
  id: EngineId;
  label: string;
  model: string;
  qualityModel: string;
  available: boolean;
  defaultEngine: boolean;
  supportsReference: boolean;
}

export interface EngineMeta {
  name: string;
  /** Shown on the card, as a mono line. */
  time: string;
  line: string;
  meters: { Speed: number; Detail: number; Text: number };
  /** Credits per picture at Standard. */
  cost: number;
  /** Seconds for one Standard picture. */
  secs: number;
  /** Character photograph under /studio/t/ or /studio/o/, when there is one. A missing file falls back to the drawn mark. */
  img?: string;
}

export const ENGINE_META: Record<EngineId, EngineMeta> = {
  gemini: { name: "Gemini", time: "10 to 17 s", line: "Best at clean text and crisp shapes.", meters: { Speed: 4, Detail: 3, Text: 5 }, cost: 2, secs: 13, img: "/studio/t/eng-gemini.webp" },
  openai: { name: "OpenAI", time: "12 to 20 s", line: "Soft light and a cinematic mood.", meters: { Speed: 3, Detail: 4, Text: 3 }, cost: 3, secs: 16, img: "/studio/t/eng-openai.webp" },
  qwen: { name: "Wan", time: "16 s and up", line: "Fine natural detail and texture.", meters: { Speed: 2, Detail: 5, Text: 2 }, cost: 2, secs: 18, img: "/studio/t/eng-wan.webp" },
  forge: { name: "GPU", time: "Up to 5 min", line: "Open models on our own GPU, started on demand.", meters: { Speed: 1, Detail: 3, Text: 2 }, cost: 1, secs: 90, img: "/studio/o/eng-forge.webp" },
};

export const FALLBACK_ENGINES: Engine[] = [
  { id: "gemini", label: "Gemini", model: "", qualityModel: "", available: true, defaultEngine: true, supportsReference: true },
  { id: "openai", label: "OpenAI", model: "", qualityModel: "", available: true, defaultEngine: false, supportsReference: true },
  { id: "qwen", label: "Wan", model: "", qualityModel: "", available: true, defaultEngine: false, supportsReference: true },
];

/** The first quoted run of words, upper-cased, which prints on the mug. */
export function labelFromPrompt(text: string): string {
  const m = text.match(/["“”'‘’]([^"“”'‘’]{1,14})["“”'‘’]/);
  return m ? m[1].toUpperCase() : "";
}

/** Which engine reads this shot best, and why. Falls back to what is available. */
export function suggestEngine(shot: Shot, label: string, available: EngineId[]): { id: EngineId; why: string } {
  let id: EngineId;
  let why: string;
  if (label) {
    id = "gemini";
    why = "Your prompt has words in quotes. Gemini sets type cleanly.";
  } else if (shot.look === "film" || ["golden", "night", "backlit"].includes(shot.light)) {
    id = "openai";
    why = "Moody light and film looks read best with OpenAI.";
  } else if (shot.look === "painted" || shot.look === "ink" || shot.look === "clay") {
    id = "gemini";
    why = "Clean shapes and flat colour suit Gemini.";
  } else {
    id = "qwen";
    why = "Natural detail and texture is where Wan is strongest.";
  }
  if (!available.includes(id)) {
    const alt = available[0] ?? "gemini";
    return { id: alt, why: `${ENGINE_META[alt].name} is the engine ready right now.` };
  }
  return { id, why };
}

export function estimate(engine: EngineId, quality: Quality, count: number) {
  const m = ENGINE_META[engine];
  const hi = quality === "high";
  return {
    credits: m.cost * (hi ? 2 : 1) * count,
    secs: Math.round(m.secs * (hi ? 1.6 : 1) + (count - 1) * 4),
  };
}

/** The prompt sent to the engine: the person's words, then the camera sentence when it is on. */
export function engineBrief(text: string, shot: Shot, directionOn: boolean): string {
  return directionOn ? `${text}\n\n${direction(shot)}` : text;
}

export type RunPhase = 0 | 1 | 2;

/** Queued, drawing, saving for a 0..1 progress. */
export function phaseOf(p: number, started: boolean): RunPhase {
  if (!started) return 0;
  return p < 0.92 ? 1 : 2;
}

/* ── Run progress ──────────────────────────────────────────────────────
   The engines do not report progress, so the bar follows the engine's usual time on a curve that
   never stops moving and never reaches the end: fast at first, slower as it nears the hold.
   Real signals (a picture made, the file saving) only ever push it forward. */

/** Time spent sending the brief before drawing starts. */
export const PREP_MS = 900;
/** The estimate never passes this; the real picture finishes the bar. */
export const RUN_HOLD = 0.96;
/** Where the estimate is when the usual time is up. */
const AT_USUAL = 0.86;
/** Soft start: the first tenth of the usual time eases in instead of leaping off zero. */
const EASE_IN = 0.1;
const soft = (x: number) => x - EASE_IN * (1 - Math.exp(-x / EASE_IN));
const K = -Math.log(1 - AT_USUAL / RUN_HOLD) / soft(1);
/** Past this share of the usual time the run is "taking longer than usual". */
export const SLOW_AFTER = 1.35;

/** Estimated 0..1 progress, `elapsedMs` into a run that usually takes `expectedMs`. */
export function runProgress(elapsedMs: number, expectedMs: number): number {
  const t = Math.max(0, elapsedMs - PREP_MS);
  const x = t / Math.max(1000, expectedMs);
  return RUN_HOLD * (1 - Math.exp(-K * soft(x)));
}

export type RunStage = "preparing" | "warming" | "drawing" | "refining" | "saving";

export interface RunStatusInput {
  elapsedMs: number;
  expectedMs: number;
  engine: EngineId;
  /** Pictures already made, when more than one was asked for. */
  made?: number;
  count?: number;
  /** Every picture is made and the files are loading. */
  saving?: boolean;
}

export interface RunStatus {
  progress: number;
  stage: RunStage;
  /** The calm mono word for the stage. */
  word: string;
  /** Honest time left, or a calm note once the usual time has passed. */
  timeText: string;
  /** Seconds left on the usual time, or null when unknown or past it. */
  etaSeconds: number | null;
  slow: boolean;
}

const WORDS: Record<RunStage, string> = {
  preparing: "Preparing",
  warming: "Waking the GPU",
  drawing: "Drawing",
  refining: "Refining detail",
  saving: "Saving to Files",
};

/** "About 8 s left", "About 2 min left", "A few seconds left". */
export function timeLeftText(secs: number): string {
  if (secs <= 4) return "A few seconds left";
  if (secs < 60) return `About ${Math.ceil(secs)} s left`;
  return `About ${Math.ceil(secs / 60)} min left`;
}

export function runStatus(i: RunStatusInput): RunStatus {
  const count = Math.max(1, i.count ?? 1);
  const made = Math.min(count, Math.max(0, i.made ?? 0));
  const estimated = runProgress(i.elapsedMs, i.expectedMs);
  /* Each finished picture is a real step; the estimate fills the part still being drawn. */
  const real = count > 1 ? (made / count) * RUN_HOLD : 0;
  let progress = Math.max(estimated, real);
  if (i.saving) progress = Math.max(progress, RUN_HOLD);
  const x = (i.elapsedMs - PREP_MS) / Math.max(1000, i.expectedMs);
  const slow = !i.saving && x > SLOW_AFTER;

  let stage: RunStage;
  if (i.saving) stage = "saving";
  else if (i.elapsedMs < PREP_MS) stage = "preparing";
  else if (i.engine === "forge" && (x < 0.3 || slow)) stage = "warming";
  else if (progress < 0.62) stage = "drawing";
  else stage = "refining";

  const left = (i.expectedMs - Math.max(0, i.elapsedMs - PREP_MS)) / 1000;
  let timeText: string;
  let etaSeconds: number | null = null;
  if (i.saving) timeText = "Almost done";
  else if (stage === "preparing") timeText = "Starting";
  else if (left > 0) {
    etaSeconds = left;
    timeText = timeLeftText(left);
  } else timeText = slow ? "Taking longer than usual" : "Almost there";

  let word = WORDS[stage];
  if (count > 1 && made > 0 && !i.saving) word = `${made} of ${count} ready`;
  return { progress, stage, word, timeText, etaSeconds, slow };
}

/** The calm explanation under "Taking longer than usual". */
export function usualText(engine: EngineId): string {
  return engine === "forge" ? "A cold GPU can take up to 5 minutes to start." : "Busy engines sometimes need a little longer.";
}
