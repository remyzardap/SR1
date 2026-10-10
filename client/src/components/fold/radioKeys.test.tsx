import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { radioKeyDown, rovingIndex } from "./radioKeys";
import { TwoUp } from "./Showcase";

const press = (key: string, value: string, ids = ["a", "b", "c"]) => {
  const onChange = vi.fn();
  const handler = radioKeyDown(ids, value, onChange);
  const e = { key, preventDefault: vi.fn(), currentTarget: { querySelector: () => null } };
  handler(e as never);
  return onChange;
};

describe("radioKeyDown", () => {
  it("moves the pick with arrows, wrapping at both ends", () => {
    expect(press("ArrowRight", "a")).toHaveBeenCalledWith("b");
    expect(press("ArrowRight", "c")).toHaveBeenCalledWith("a");
    expect(press("ArrowLeft", "a")).toHaveBeenCalledWith("c");
  });

  it("with nothing picked, forward lands on the first and back on the last", () => {
    expect(press("ArrowRight", "")).toHaveBeenCalledWith("a");
    expect(press("ArrowLeft", "")).toHaveBeenCalledWith("c");
  });

  it("ignores other keys", () => {
    expect(press("Enter", "a")).not.toHaveBeenCalled();
  });

  it("keeps one tab stop, on the first item when nothing is picked", () => {
    expect(rovingIndex(["a", "b"], "", "a")).toBe(0);
    expect(rovingIndex(["a", "b"], "", "b")).toBe(-1);
  });
});

describe("TwoUp action", () => {
  const items = [
    { id: "x", name: "One", art: "/a.webp" },
    { id: "y", name: "Two", art: "/b.webp" },
  ];
  it("renders plain buttons, not a radiogroup, so arrows never navigate", () => {
    const html = renderToStaticMarkup(<TwoUp action label="Start" items={items} value="" onChange={() => {}} />);
    expect(html).toContain('role="group"');
    expect(html).not.toContain("radio");
    expect(html).not.toContain("aria-checked");
  });
});
