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
