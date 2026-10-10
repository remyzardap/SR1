import { afterEach, describe, expect, it } from "vitest";
import { prefersReducedMotion } from "./transitions";

/* vitest runs this file with `environment: "node"` — there is no window or document here, so the
   two sources the function reads are installed by hand. The originals come back after every case,
   because these globals are shared with the rest of the process. */
const original = { window: globalThis.window, document: globalThis.document };

afterEach(() => {
  (globalThis as { window?: unknown }).window = original.window;
  (globalThis as { document?: unknown }).document = original.document;
});

function withWindow(matchMedia: () => { matches: boolean }) {
  (globalThis as { window?: unknown }).window = { matchMedia };
}

describe("prefersReducedMotion", () => {
  it("is false where there is no window at all", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(prefersReducedMotion()).toBe(false);
  });

  it("follows the OS query", () => {
    withWindow(() => ({ matches: true }));
    expect(prefersReducedMotion()).toBe(true);
    withWindow(() => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it("follows the in-app setting even when the OS says no", () => {
    withWindow(() => ({ matches: false }));
    (globalThis as { document?: unknown }).document = {
      documentElement: { getAttribute: (name: string) => (name === "data-reduce-motion" ? "true" : null) },
    };
    expect(prefersReducedMotion()).toBe(true);
  });

  it("is false when the attribute is absent or says false", () => {
    withWindow(() => ({ matches: false }));
    for (const value of [null, "false"]) {
      (globalThis as { document?: unknown }).document = { documentElement: { getAttribute: () => value } };
      expect(prefersReducedMotion()).toBe(false);
    }
  });

  it("survives a browser that throws on matchMedia", () => {
    withWindow(() => {
      throw new Error("no media queries here");
    });
    (globalThis as { document?: unknown }).document = { documentElement: { getAttribute: () => null } };
    expect(prefersReducedMotion()).toBe(false);
  });

  it("treats a window without matchMedia as no preference", () => {
    (globalThis as { window?: unknown }).window = {};
    (globalThis as { document?: unknown }).document = undefined;
    expect(prefersReducedMotion()).toBe(false);
  });
});
