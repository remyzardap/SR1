import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KeyboardEvent } from "react";
import { rovingIndex, radioKeyDown } from "./radioKeys";

const IDS = ["detail", "close", "medium", "wide"];

interface Probe {
  key: string;
  focused?: string;
  preventDefault: () => void;
  target: string[];
  behavior: string[];
}

function eventFor(key: string, opts: { focus?: string; reduced?: boolean } = {}): KeyboardEvent<HTMLElement> & Probe {
  const target: string[] = [];
  const behavior: string[] = [];
  const el = opts.focus
    ? {
        focus: (o: { preventScroll: boolean }) => target.push(`${opts.focus}:${o.preventScroll}`),
        scrollIntoView: (o: { behavior: string }) => behavior.push(o.behavior),
      }
    : null;
  const e = {
    key,
    target,
    behavior,
    preventDefault: () => target.push("prevented"),
    currentTarget: {
      querySelector: (selector: string) => {
        target.push(selector);
        return el;
      },
    },
  } as unknown as KeyboardEvent<HTMLElement> & Probe;
  if (opts.reduced) (globalThis as { matchMedia?: unknown }).matchMedia = () => ({ matches: true });
  return e;
}

beforeEach(() => {
  (globalThis as { CSS?: unknown }).CSS = { escape: (s: string) => s };
  (globalThis as { matchMedia?: unknown }).matchMedia = () => ({ matches: false });
});

afterEach(() => {
  delete (globalThis as { CSS?: unknown }).CSS;
  delete (globalThis as { matchMedia?: unknown }).matchMedia;
});

describe("rovingIndex", () => {
  it("makes the picked item the only tab stop", () => {
    expect(rovingIndex(IDS, "close", "close")).toBe(0);
    expect(rovingIndex(IDS, "close", "detail")).toBe(-1);
  });

  it("falls back to the first item when nothing is picked", () => {
    expect(rovingIndex(IDS, null, "detail")).toBe(0);
    expect(rovingIndex(IDS, undefined, "detail")).toBe(0);
    expect(rovingIndex(IDS, "", "detail")).toBe(0);
    expect(rovingIndex(IDS, null, "close")).toBe(-1);
  });

  it("falls back to the first item when the value is not in this group", () => {
    expect(rovingIndex(IDS, "gone", "detail")).toBe(0);
    expect(rovingIndex(IDS, "gone", "close")).toBe(-1);
  });

  it("leaves an empty group with no tab stop at all", () => {
    expect(rovingIndex([], null, "detail")).toBe(-1);
  });
});

describe("radioKeyDown", () => {
  const pick = (key: string, value: string | null, opts: { focus?: string; reduced?: boolean } = {}) => {
    const picked: string[] = [];
    const e = eventFor(key, opts);
    radioKeyDown(IDS, value, (id) => picked.push(id))(e);
    return { picked, e };
  };

  it("moves forward and wraps from the last item", () => {
    expect(pick("ArrowRight", "close").picked).toEqual(["medium"]);
    expect(pick("ArrowDown", "medium").picked).toEqual(["wide"]);
    expect(pick("ArrowRight", "wide").picked).toEqual(["detail"]);
  });

  it("moves back and wraps from the first item", () => {
    expect(pick("ArrowLeft", "close").picked).toEqual(["detail"]);
    expect(pick("ArrowUp", "detail").picked).toEqual(["wide"]);
  });

  it("jumps to the ends with Home and End", () => {
    expect(pick("Home", "medium").picked).toEqual(["detail"]);
    expect(pick("End", "medium").picked).toEqual(["wide"]);
  });

  it("starts from the ends when nothing is picked yet", () => {
    expect(pick("ArrowRight", null).picked).toEqual(["detail"]);
    expect(pick("ArrowDown", null).picked).toEqual(["detail"]);
    expect(pick("ArrowLeft", null).picked).toEqual(["wide"]);
    expect(pick("ArrowUp", null).picked).toEqual(["wide"]);
  });

  it("leaves unrelated keys alone", () => {
    for (const key of ["a", "Enter", " ", "Tab", "Escape", "PageDown"]) {
      const { picked, e } = pick(key, "close");
      expect(picked, key).toEqual([]);
      expect(e.target, `${key} must not call preventDefault`).not.toContain("prevented");
    }
  });

  it("moves focus to the item it just picked, without scrolling the page", () => {
    const { picked, e } = pick("ArrowRight", "close", { focus: "medium" });
    expect(picked).toEqual(["medium"]);
    expect(e.target).toContain('[data-id="medium"]');
    expect(e.target).toContain("medium:true");
    expect(e.behavior).toEqual(["smooth"]);
  });

  it("scrolls instantly when motion is reduced", () => {
    const { e } = pick("ArrowRight", "close", { focus: "medium", reduced: true });
    expect(e.behavior).toEqual(["auto"]);
  });

  it("still reports the pick when the tile cannot be found", () => {
    const { picked, e } = pick("ArrowRight", "close");
    expect(picked).toEqual(["medium"]);
    expect(e.behavior).toEqual([]);
  });
});
