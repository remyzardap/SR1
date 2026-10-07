/**
 * The first-run screen (T-74 / F-12) — a warm hand-off for someone who is not
 * technical, shown once after their very first sign-in.
 *
 * Deliberately separate from the existing onboarding flow (`/onboarding`, which
 * keeps its state on the server): a new person can land on any page after signing
 * in, and the promise of this screen is "once, then never again", so the flag lives
 * in this browser's localStorage and asks nothing of them.
 *
 * The copy below is the whole screen, in the person's own words. Plain and short —
 * no model or vendor names, no technical words.
 */

/** Dot-namespaced like `sutaeru.inviteCode`, so one grep finds everything stored. */
export const FIRST_RUN_STORAGE_KEY = "sutaeru.firstRunSeen";

export const FIRST_RUN_TITLE = "Welcome to Sutaeru";

/** The three cards, in order. */
export const FIRST_RUN_CARDS = [
  "Ask anything, in your own words",
  "It can look things up and show where it found them",
  "You are always asked before it sends or changes anything",
] as const;

export const FIRST_RUN_DISMISS_LABEL = "Get started";

/** The part of `localStorage` this module needs. */
export type FlagStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function defaultStorage(): FlagStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Reading the object itself can throw (blocked cookies, sandboxed frame).
    return null;
  }
}

/**
 * True until the greeting has been shown on this device.
 *
 * A browser that will not give us storage is not a reason to interrupt someone at
 * every sign-in, so a storage we cannot read counts as "already shown".
 */
export function shouldShowFirstRun(storage: FlagStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(FIRST_RUN_STORAGE_KEY) == null;
  } catch {
    return false;
  }
}

/**
 * Records that the person has been greeted, so no later visit interrupts them.
 *
 * The value is the moment it was recorded — when an investigator asks when a screen
 * was first shown, the answer is in storage rather than in a commit message. Returns
 * false when there is nowhere to record it.
 */
export function markFirstRunSeen(storage: FlagStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(FIRST_RUN_STORAGE_KEY, new Date().toISOString());
    return true;
  } catch {
    // Safari private mode throws on write. The screen still shows.
    return false;
  }
}
