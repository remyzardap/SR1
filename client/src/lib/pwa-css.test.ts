import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contract tests for the parts of the PWA polish that live in CSS and JSX.
 *
 * There is no DOM test environment in this repo (no jsdom, no
 * testing-library), so a render test cannot say "the card clears the home
 * indicator". These assertions go to where that is actually decided - the
 * shipped stylesheet and the shipped component - and pin the two things that
 * break silently: a rule that moves inside an `@layer` block loses to the
 * Tailwind utility it was overriding, and a class renamed in one file only is a
 * class that does nothing.
 */

const INDEX_CSS = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const PREVIEW_CSS = readFileSync(new URL("../styles/preview.css", import.meta.url), "utf8");
const CHAT_RESKIN_CSS = readFileSync(new URL("../styles/chat-reskin.css", import.meta.url), "utf8");
const INSTALL_PROMPT_TSX = readFileSync(
  new URL("../components/redo/InstallPrompt.tsx", import.meta.url),
  "utf8"
);

/** The body of the first `{...}` block that follows `marker`. */
function blockBody(source: string, marker: string): string {
  const start = source.indexOf(marker);
  expect(start, `${marker} is missing from the stylesheet`).toBeGreaterThan(-1);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

/** Every `@at-rule { ... }` range in the file, so a position can be tested for
 *  being inside a layer (layered rules lose to unlayered ones, and Tailwind's
 *  utilities sit in a layer). */
function blockRanges(source: string, opener: RegExp): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const global = new RegExp(opener.source, opener.flags.includes("g") ? opener.flags : `${opener.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = global.exec(source)) !== null) {
    const open = source.indexOf("{", match.index);
    if (open === -1) continue;
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          ranges.push([match.index, i + 1]);
          break;
        }
      }
    }
  }
  return ranges;
}

function selectorAt(source: string, selector: RegExp): number {
  const index = source.search(selector);
  expect(index, `${selector} is missing from the stylesheet`).toBeGreaterThan(-1);
  return index;
}

describe("the install card clears the phone's home indicator", () => {
  it("adds the safe-area inset to the card's bottom offset", () => {
    const rule = blockBody(INDEX_CSS, ".pwa-bottom-card");
    expect(rule).toMatch(/bottom:\s*calc\(1\.5rem \+ env\(safe-area-inset-bottom/);
  });

  it("declares that rule outside every @layer block", () => {
    const index = selectorAt(INDEX_CSS, /\.pwa-bottom-card\s*\{/);
    const layered = blockRanges(INDEX_CSS, /@layer/).some(
      ([start, end]) => index >= start && index < end
    );
    // Inside a layer it would lose to `bottom-4` on the element and do nothing.
    expect(layered).toBe(false);
  });

  it("applies the class to both bottom-anchored cards, keeping a plain offset as fallback", () => {
    const cards = [...INSTALL_PROMPT_TSX.matchAll(/"[^"]*\bfixed\b[^"]*"/g)].map((match) => match[0]);
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card).toContain("pwa-bottom-card");
      // Browsers without env() support fall back to this utility.
      expect(card).toMatch(/bottom-4/);
    }
  });

  it("leaves the chat's bottom inset with the composer, not the header row", () => {
    const row = blockBody(PREVIEW_CSS, ".sutaeru-chat-mobile-modes {");
    expect(row).not.toMatch(/padding[^;]*env\(safe-area-inset-bottom/);
    const composer = blockBody(CHAT_RESKIN_CSS, ".sutaeru-chat .sutaeru-run-composer");
    expect(composer).toMatch(/padding-bottom:\s*max\(18px,\s*env\(safe-area-inset-bottom\)\)/);
  });
});

describe("the card's slide-up entrance respects reduced motion", () => {
  it("drops the animation for the OS setting", () => {
    expect(blockBody(INDEX_CSS, "@media (prefers-reduced-motion: reduce)")).toMatch(
      /\.animate-slide-up\s*\{\s*animation:\s*none/
    );
  });

  it("drops the animation for the in-app toggle, which sets data-reduce-motion on <html>", () => {
    expect(INDEX_CSS).toMatch(
      /\[data-reduce-motion="true"\]\s+\.animate-slide-up\s*\{\s*animation:\s*none/
    );
  });

  it("guards the class the component really puts on the cards", () => {
    const cards = [...INSTALL_PROMPT_TSX.matchAll(/"animate-slide-up"/g)].map((match) => match[0]);
    expect(cards).toHaveLength(2);
    // The keyframes end at the element's own state (opacity 1, no offset), so
    // killing the animation still leaves the card visible.
    expect(INDEX_CSS).toMatch(/@keyframes slide-up\s*\{[\s\S]*?to\s*\{\s*opacity:\s*1/);
  });
});
