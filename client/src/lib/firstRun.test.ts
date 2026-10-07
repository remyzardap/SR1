import { describe, expect, it } from "vitest";

import {
  FIRST_RUN_CARDS,
  FIRST_RUN_DISMISS_LABEL,
  FIRST_RUN_STORAGE_KEY,
  FIRST_RUN_TITLE,
  markFirstRunSeen,
  shouldShowFirstRun,
  type FlagStorage,
} from "./firstRun";

/** Minimal localStorage stand-in; the real thing is not available in the node test env. */
function fakeStorage(initial: Record<string, string> = {}): FlagStorage & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => void data.set(key, value),
  };
}

/** Storage that throws the way a blocked or sandboxed browser does. */
function brokenStorage(): FlagStorage {
  const fail = () => {
    throw new Error("SecurityError: storage is disabled");
  };
  return { getItem: fail, setItem: fail };
}

describe("show-once rule", () => {
  it("shows on the very first sign-in", () => {
    const storage = fakeStorage();
    expect(shouldShowFirstRun(storage)).toBe(true);
  });

  it("never shows again after it has been marked seen", () => {
    const storage = fakeStorage();
    markFirstRunSeen(storage);
    expect(shouldShowFirstRun(storage)).toBe(false);
  });

  it("stays hidden through every later sign-in", () => {
    const storage = fakeStorage();
    markFirstRunSeen(storage);
    // Signing in again reads the same browser storage — not a fresh one.
    for (let visit = 0; visit < 3; visit += 1) {
      expect(shouldShowFirstRun(storage)).toBe(false);
    }
  });

  it("marks under the dot-namespaced key, with a time you can read back", () => {
    const storage = fakeStorage();
    markFirstRunSeen(storage);
    const stored = storage.data.get(FIRST_RUN_STORAGE_KEY);
    expect([...storage.data.keys()]).toEqual([FIRST_RUN_STORAGE_KEY]);
    expect(() => new Date(stored!).toISOString()).not.toThrow();
  });

  it("does not interrupt anyone at every sign-in when storage is unavailable", () => {
    expect(shouldShowFirstRun(brokenStorage())).toBe(false);
    expect(shouldShowFirstRun(null)).toBe(false);
  });

  it("survives storage that refuses to be written to", () => {
    expect(markFirstRunSeen(brokenStorage())).toBe(false);
  });

  it("has nothing to show outside a browser", () => {
    // This suite runs in the node environment, so there is no window at all.
    expect(shouldShowFirstRun()).toBe(false);
    expect(markFirstRunSeen()).toBe(false);
  });

  it("counts an empty flag as already seen", () => {
    expect(shouldShowFirstRun(fakeStorage({ [FIRST_RUN_STORAGE_KEY]: "" }))).toBe(false);
  });
});

describe("first-run copy", () => {
  it("says the three things, in the promised words", () => {
    expect([...FIRST_RUN_CARDS]).toEqual([
      "Ask anything, in your own words",
      "It can look things up and show where it found them",
      "You are always asked before it sends or changes anything",
    ]);
  });

  it("opens with a welcome and closes with one clear action", () => {
    expect(FIRST_RUN_TITLE).toBe("Welcome to Sutaeru");
    expect(FIRST_RUN_DISMISS_LABEL).toBe("Get started");
  });

  it("keeps every word out of the technical", () => {
    const banned = [
      "gpt",
      "claude",
      "gemini",
      "llama",
      "mistral",
      "openai",
      "anthropic",
      "model",
      "prompt",
      "token",
      "session",
      "error",
      "assistant",
      "bot",
      "AI",
    ];
    const lines = [FIRST_RUN_TITLE, ...FIRST_RUN_CARDS, FIRST_RUN_DISMISS_LABEL];
    for (const line of lines) {
      const lower = line.toLowerCase();
      for (const word of banned) {
        expect(lower.includes(word.toLowerCase()), `${line} :: ${word}`).toBe(false);
      }
    }
  });

  it("keeps the cards short enough to read at a glance", () => {
    for (const line of FIRST_RUN_CARDS) {
      expect(line.split(" ").length).toBeLessThanOrEqual(12);
    }
  });
});
