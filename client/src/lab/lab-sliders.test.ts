/**
 * T-129 guards for the design lab.
 *
 * Two regressions are pinned here:
 *  1. Lab controls must use the themed Slider, never a browser `<input type="range">` (the blue
 *     default track that the redesign explicitly rejects).
 *  2. Lab layout must not ask for a grid track or a caption wider than a phone viewport — at
 *     360 px the page has `overflow-x: hidden`, so oversized content is clipped, not scrolled.
 *
 * The checks read source text on purpose: this suite runs in a node environment with no DOM, and
 * the two rules are about what the lab pages are made of. Slider behaviour itself is covered by
 * components/art/art.test.ts.
 */
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LabSliderRow } from "./LabSliderRow";

const LAB_DIR = __dirname;

/** Lab page components and the shared row — `.test.ts` files are guards, not shipped UI. */
function labSources(): string[] {
  return fs
    .readdirSync(LAB_DIR)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => path.join(LAB_DIR, name));
}

function labSource(name: string): string {
  const file = path.join(LAB_DIR, name);
  expect(fs.existsSync(file), `${name} is missing`).toBe(true);
  return fs.readFileSync(file, "utf8");
}

describe("lab sliders (T-129)", () => {
  it("never falls back to a browser range input", () => {
    const rangeAttr = /type\s*=\s*["']range["']/;
    for (const file of labSources()) {
      const source = fs.readFileSync(file, "utf8");
      expect(rangeAttr.test(source), `${path.basename(file)} uses <input type="range">`).toBe(
        false
      );
    }
  });

  it("drives the art-page controls through the shared slider row", () => {
    for (const name of [
      "LabDitherEdge.tsx",
      "LabHalftoneFade.tsx",
      "LabRegistrationMarks.tsx",
    ]) {
      expect(labSource(name)).toContain('from "./LabSliderRow"');
    }
  });

  it("renders the shared row as a themed slider with a readout", () => {
    const html = renderToStaticMarkup(
      React.createElement(LabSliderRow, {
        label: "Opacity",
        ariaLabel: "Edge opacity",
        value: 0.85,
        min: 0.1,
        max: 1,
        step: 0.05,
        onChange: () => {},
      })
    );

    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuenow="0.85"');
    expect(html).toContain("art-slider-track");
    expect(html).toContain("Opacity:");
    expect(html).not.toContain("<input");
  });
});

describe("lab layout at phone width (T-129)", () => {
  const css = () => {
    const file = path.join(LAB_DIR, "lab.css");
    expect(fs.existsSync(file), "lab.css is missing").toBe(true);
    return fs.readFileSync(file, "utf8");
  };

  it("clamps card grid tracks to the container instead of a fixed minimum", () => {
    // min(280px, 100%) can never exceed the viewport; a bare 280px track does, and the page
    // then clips the second column rather than scrolling it.
    expect(css()).toMatch(/minmax\(\s*min\(/);
    for (const file of labSources()) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${path.basename(file)} sets its own grid track minimum`).not.toMatch(
        /minmax\(/
      );
    }
  });

  it("lets mono captions and right-aligned readouts wrap", () => {
    expect(css()).toMatch(/\.lab-wrap \.mono[\s\S]*?white-space:\s*normal/);
    expect(css()).toMatch(/\.lab-wrap \.art-meta[\s\S]*?overflow-wrap:\s*anywhere/);
    expect(css()).toMatch(/\.lab-wrap \.art-readout[\s\S]*?flex-wrap:\s*wrap/);
  });

  it("is loaded by the shared lab layout", () => {
    expect(labSource("LabLayout.tsx")).toContain('import "./lab.css"');
  });
});
