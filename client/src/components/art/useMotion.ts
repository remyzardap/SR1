import { useEffect, useState } from "react";

/**
 * Motion preference for the art components.
 * Honours, in order: a data-reduce-motion="true" attribute on <html> (the app's
 * Reduce motion setting), the same choice in localStorage, and the OS
 * prefers-reduced-motion media query.
 * CSS transitions use var(--r-motion) and go to 0 under the same conditions.
 */
export const REDUCE_MOTION_STORAGE_KEY = "sutaeru.reduce-motion";
/**
 * Re-dispatched on window after any appearance change (lib/theme.ts), so JS-driven
 * art re-snaps the moment a switch moves instead of waiting for a reload.
 */
export const APPEARANCE_EVENT = "sutaeru:appearance";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.reduceMotion === "true") return true;
  try {
    if (localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) === "true") return true;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Reactive variant for components that animate through JS. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(prefersReducedMotion());
    mq.addEventListener("change", onChange);
    window.addEventListener("storage", onChange);
    // The app's own Reduce motion switch: without this the bars keep animating
    // until the page is reloaded.
    window.addEventListener(APPEARANCE_EVENT, onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener(APPEARANCE_EVENT, onChange);
    };
  }, []);
  return reduced;
}

/** Clamp a 0..1 progress prop into something safe to render. */
export function clampProgress(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/** The standard eta copy: ABOUT N S LEFT. */
export function etaLabel(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  return `ABOUT ${Math.max(0, Math.round(seconds))} S LEFT`;
}
