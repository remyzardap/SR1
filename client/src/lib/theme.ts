/**
 * Appearance settings: the theme choice, the Reduce motion switch and the
 * Background art switch.
 *
 * All three live on <html>, where the token layer can read them:
 * - data-mode="light" | "dark" picks a palette; the attribute is removed for System,
 *   which lets reskin-tokens.css follow the OS prefers-color-scheme.
 * - data-reduce-motion="true" snaps the progress art instead of animating it.
 * - data-bg-art="off" hides the decorative wash and grain behind the workspace.
 *
 * The values are mirrored in localStorage so the inline script in
 * client/index.html can restore them before the first paint (no light flash on a
 * dark choice). Keep the keys in step with that script.
 */

import { REDUCE_MOTION_STORAGE_KEY } from "@/components/art/useMotion";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "sutaeru.theme";
export const BG_ART_STORAGE_KEY = "sutaeru.background-art";
/** Re-dispatched on window after any appearance change, for React readers. */
export const APPEARANCE_EVENT = "sutaeru:appearance";

const CHOICES: ThemeChoice[] = ["light", "dark", "system"];

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / storage disabled: the setting just won't persist
  }
}

function announce() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(APPEARANCE_EVENT));
  }
}

/** The saved choice. Defaults to System, which follows the OS. */
export function readThemeChoice(): ThemeChoice {
  const saved = store()?.getItem(THEME_STORAGE_KEY);
  return saved && (CHOICES as string[]).includes(saved) ? (saved as ThemeChoice) : "system";
}

/** Put the choice on <html>. Does not touch storage. */
export function applyThemeChoice(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
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
  if (typeof document !== "undefined") {
    if (on) document.documentElement.dataset.reduceMotion = "true";
    else delete document.documentElement.dataset.reduceMotion;
  }
  announce();
}

/** Background art: on unless it was switched off. */
export function readBackgroundArt(): boolean {
  return store()?.getItem(BG_ART_STORAGE_KEY) !== "off";
}

export function setBackgroundArt(on: boolean): void {
  store()?.setItem(BG_ART_STORAGE_KEY, on ? "on" : "off");
  if (typeof document !== "undefined") {
    if (on) delete document.documentElement.dataset.bgArt;
    else document.documentElement.dataset.bgArt = "off";
  }
  announce();
}

/** The palette actually on screen right now. */
export function currentMode(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
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
  const root = document.documentElement;
  if (readReduceMotion()) root.dataset.reduceMotion = "true";
  else delete root.dataset.reduceMotion;
  if (readBackgroundArt()) delete root.dataset.bgArt;
  else root.dataset.bgArt = "off";
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

export { readArtIntensity, setArtIntensity } from "@/components/art/PaperGrain";
