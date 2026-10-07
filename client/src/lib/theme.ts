/**
 * Appearance settings: the theme choice, the Reduce motion switch, the Background art
 * switch, the Art intensity slider and the How Sutaeru talks sliders.
 *
 * The appearance ones live on <html>, where the token layer can read them:
 * - data-mode="light" | "dark" picks a palette; the attribute is removed for System,
 *   which lets reskin-tokens.css follow the OS prefers-color-scheme.
 * - data-reduce-motion="true" snaps the progress art instead of animating it.
 * - data-art="on" | "off" shows or hides the washi grain and the dither/halftone edges
 *   (redo/grain.css). data-bg-art mirrors it for the older chat chrome.
 * - --art-intensity (0.2 – 1) scales the grain and the dither canvases.
 *
 * The voice sliders are a preference only: they are stored and drive the on-screen
 * sample, nothing else.
 *
 * Every value is mirrored in localStorage so the inline script in client/index.html
 * can restore them before the first paint (no light flash on a dark choice).
 * Keep the keys in step with that script.
 */

import { APPEARANCE_EVENT, REDUCE_MOTION_STORAGE_KEY } from "@/components/art/useMotion";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "sutaeru.theme";
export const BG_ART_STORAGE_KEY = "sutaeru.background-art";
export const ART_INTENSITY_STORAGE_KEY = "sutaeru.art-intensity";
export const VOICE_STORAGE_KEY = "sutaeru.voice";
/** Re-dispatched on window after any appearance change, for React readers. */
export { APPEARANCE_EVENT };

const CHOICES: ThemeChoice[] = ["light", "dark", "system"];

/** The Art intensity slider's range and its default (the prototype's). */
export const ART_INTENSITY_MIN = 20;
export const ART_INTENSITY_MAX = 100;
export const ART_INTENSITY_DEFAULT = 70;

/** How Sutaeru talks: 0 = Concise/Formal, 100 = Detailed/Casual. */
export interface VoiceStyle {
  detail: number;
  tone: number;
}

export const VOICE_DEFAULT: VoiceStyle = { detail: 45, tone: 62 };

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / storage disabled: the setting just won't persist
  }
}

function announce() {
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

/** The saved choice. Defaults to System, which follows the OS. */
export function readThemeChoice(): ThemeChoice {
  const saved = store()?.getItem(THEME_STORAGE_KEY);
  return saved && (CHOICES as string[]).includes(saved) ? (saved as ThemeChoice) : "system";
}

/** Put the choice on <html>. Does not touch storage. */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") {
    delete root.dataset.mode;
    delete root.dataset.theme;
  } else {
    root.dataset.mode = choice;
    root.dataset.theme = choice;
  }
  syncThemeColor();
}

export function setThemeChoice(choice: ThemeChoice): void {
  store()?.setItem(THEME_STORAGE_KEY, choice);
  applyThemeChoice(choice);
  announce();
}

/** Reduce motion: the explicit switch, or the OS when the switch is off. */
export function readReduceMotion(): boolean {
  return store()?.getItem(REDUCE_MOTION_STORAGE_KEY) === "true";
}

export function setReduceMotion(on: boolean): void {
  store()?.setItem(REDUCE_MOTION_STORAGE_KEY, on ? "true" : "false");
  applyReduceMotion(on);
  announce();
}

/** Put the choice on <html>. Does not touch storage. */
export function applyReduceMotion(on: boolean): void {
  const root = document.documentElement;
  if (on) root.dataset.reduceMotion = "true";
  else delete root.dataset.reduceMotion;
}

/** Background art: on unless it was switched off. */
export function readBackgroundArt(): boolean {
  return store()?.getItem(BG_ART_STORAGE_KEY) !== "off";
}

export function setBackgroundArt(on: boolean): void {
  store()?.setItem(BG_ART_STORAGE_KEY, on ? "on" : "off");
  applyBackgroundArt(on);
  announce();
}

/** Put the choice on <html>. Does not touch storage. */
export function applyBackgroundArt(on: boolean): void {
  const root = document.documentElement;
  // data-art is what the redo grain/dither rules read; data-bg-art is the older
  // attribute the pre-redo chat chrome still keys off. Both move together.
  const value = on ? "on" : "off";
  root.dataset.art = value;
  root.dataset.bgArt = value;
}

/** Art intensity: the slider's value, 20 – 100. Defaults to 70. */
export function readArtIntensity(): number {
  const saved = store()?.getItem(ART_INTENSITY_STORAGE_KEY);
  if (saved === null) return ART_INTENSITY_DEFAULT;
  const raw = Number(saved);
  if (!Number.isFinite(raw)) return ART_INTENSITY_DEFAULT;
  return clampIntensity(Math.round(raw));
}

function clampIntensity(value: number): number {
  return Math.min(ART_INTENSITY_MAX, Math.max(ART_INTENSITY_MIN, value));
}

export function setArtIntensity(value: number): void {
  const next = clampIntensity(Math.round(value));
  store()?.setItem(ART_INTENSITY_STORAGE_KEY, String(next));
  applyArtIntensity(next);
  announce();
}

/** Publish the 0.2 – 1 multiplier the grain and the dither canvases scale by. */
export function applyArtIntensity(value: number): void {
  document.documentElement.style.setProperty("--art-intensity", String(clampIntensity(value) / 100));
}

/** How Sutaeru talks. Clamped to the slider range, defaults to the prototype's. */
export function readVoiceStyle(): VoiceStyle {
  try {
    const saved = store()?.getItem(VOICE_STORAGE_KEY);
    if (!saved) return { ...VOICE_DEFAULT };
    const parsed = JSON.parse(saved) as Partial<VoiceStyle>;
    return {
      detail: clampPercent(Number(parsed?.detail), VOICE_DEFAULT.detail),
      tone: clampPercent(Number(parsed?.tone), VOICE_DEFAULT.tone),
    };
  } catch {
    return { ...VOICE_DEFAULT };
  }
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function setVoiceStyle(next: VoiceStyle): void {
  const saved: VoiceStyle = {
    detail: clampPercent(Number(next.detail), VOICE_DEFAULT.detail),
    tone: clampPercent(Number(next.tone), VOICE_DEFAULT.tone),
  };
  store()?.setItem(VOICE_STORAGE_KEY, JSON.stringify(saved));
}

/** The palette actually on screen right now. */
export function currentMode(): "light" | "dark" {
  const choice = readThemeChoice();
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Keep the browser chrome (the status bar of the installed PWA) in step with the page. */
export function syncThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  meta.setAttribute("content", currentMode() === "dark" ? "#1C1B19" : "#F7F6F2");
}

/** Restore every saved choice. Safe to call more than once. */
export function applyAppearance(): void {
  applyThemeChoice(readThemeChoice());
  applyReduceMotion(readReduceMotion());
  applyBackgroundArt(readBackgroundArt());
  applyArtIntensity(readArtIntensity());
  syncThemeColor();
}

/**
 * Subscribe to appearance changes (our own switch, the OS theme, another tab).
 * Returns the unsubscribe function.
 */
export function onAppearanceChange(listener: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", listener);
  window.addEventListener(APPEARANCE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    mq.removeEventListener("change", listener);
    window.removeEventListener(APPEARANCE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
