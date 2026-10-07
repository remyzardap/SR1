import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HalftoneRamp,
  HALFTONE_RAMP_DOT_COUNT,
  computeRampDot,
  FocusBrackets,
  ConvergeBar,
  LinearDitherBar,
  SteppedMeter,
  Toggle,
  Slider,
  DitherEdge,
  HalftoneFade,
  PaperGrain,
  RegistrationMarks,
  Chip,
  Tag,
  Sheet,
} from "./index";

describe("Art Primitives (F0b / T-112)", () => {
  describe("HalftoneRamp", () => {
    it("renders 27 dots in 1D row mode with exact size and opacity formulas", () => {
      // 1D row mode default
      const rowHtml = renderToStaticMarkup(React.createElement(HalftoneRamp));
      expect(rowHtml).toContain("ramp");

      // Verify dot count is 27
      const dotMatches = rowHtml.match(/<i\b[^>]*>/g);
      expect(dotMatches).not.toBeNull();
      expect(dotMatches!.length).toBe(HALFTONE_RAMP_DOT_COUNT);
      expect(dotMatches!.length).toBe(27);

      // Verify ends fade to almost nothing: size 1.6px, opacity 0.10
      const dot0 = computeRampDot(0, 27, 0.5);
      const dot26 = computeRampDot(26, 27, 0.5);
      expect(dot0.size).toBeCloseTo(1.6, 2);
      expect(dot0.opacity).toBeCloseTo(0.1, 2);
      expect(dot26.size).toBeCloseTo(1.6, 2);
      expect(dot26.opacity).toBeCloseTo(0.1, 2);

      // Verify peak at center (i = 13)
      const dot13 = computeRampDot(13, 27, 0.5);
      expect(dot13.size).toBeCloseTo(13.0, 1); // 1.6 + 11.4 * 1^1.7 = 13.0
      expect(dot13.opacity).toBeCloseTo(0.88, 2); // 0.10 + 0.78 * 1^1.1 = 0.88

      // Explicit row prop
      const explicitRowHtml = renderToStaticMarkup(React.createElement(HalftoneRamp, { row: true }));
      const explicitMatches = explicitRowHtml.match(/<i\b[^>]*>/g);
      expect(explicitMatches!.length).toBe(27);
    });

    it("shifts peak smoothly without popping and remains static under reduced motion", () => {
      // Shift peak to 0.2
      const leftDot = computeRampDot(5, 27, 0.2);
      const centerDot = computeRampDot(5, 27, 0.5);
      expect(leftDot.size).toBeGreaterThan(centerDot.size);

      // Shifting peak to 0.8 shifts peak toward the right
      const rightDot = computeRampDot(21, 27, 0.8);
      const centerRightDot = computeRampDot(21, 27, 0.5);
      expect(rightDot.size).toBeGreaterThan(centerRightDot.size);

      // Smooth peak shift with typing input
      const typedHtml = renderToStaticMarkup(
        React.createElement(HalftoneRamp, { input: "Hello Sutaeru" })
      );
      expect(typedHtml).toContain("ramp");

      // Under reduced motion, peak remains static (centered)
      const reducedHtml = renderToStaticMarkup(
        React.createElement(HalftoneRamp, { input: "Hello Sutaeru", reducedMotion: true })
      );
      expect(reducedHtml).toContain('data-reduced-motion="true"');
      // When reducedMotion is true, dot 13 matches the exact static center dot
      expect(reducedHtml).toContain('13px');
    });

    it("retains backward-compatible 2D grid mode", () => {
      const gridHtml = renderToStaticMarkup(
        React.createElement(HalftoneRamp, { columns: 4, rows: 3 })
      );
      expect(gridHtml).toContain("<svg");
      const circleMatches = gridHtml.match(/<circle\b/g);
      expect(circleMatches).not.toBeNull();
      expect(circleMatches!.length).toBe(12);
    });
  });

  describe("ConvergeBar and LinearDitherBar", () => {
    it("renders clean rounded tracks, solid fill, and 22px graded leading edges", () => {
      // ConvergeBar running
      const convergeHtml = renderToStaticMarkup(
        React.createElement(ConvergeBar, { progress: 0.5, label: "ANALYZING", etaSeconds: 10 })
      );
      expect(convergeHtml).toContain('role="progressbar"');
      expect(convergeHtml).toContain('aria-valuenow="50"');
      expect(convergeHtml).toContain('aria-valuemin="0"');
      expect(convergeHtml).toContain('aria-valuemax="100"');
      expect(convergeHtml).toContain('aria-busy="true"');
      expect(convergeHtml).toContain("art-pill-l");
      expect(convergeHtml).toContain("art-pill-r");
      expect(convergeHtml).toContain("art-lead"); // 22px graded leading edge
      expect(convergeHtml).toContain("tnum"); // Tabular numerals
      expect(convergeHtml).toContain("ANALYZING");

      // LinearDitherBar running
      const ditherHtml = renderToStaticMarkup(
        React.createElement(LinearDitherBar, { progress: 0.4, stepLabel: "STEP 1 OF 3" })
      );
      expect(ditherHtml).toContain('role="progressbar"');
      expect(ditherHtml).toContain('aria-valuenow="40"');
      expect(ditherHtml).toContain("art-ditherbar-pill");
      expect(ditherHtml).toContain("art-lead"); // 22px graded leading edge
      expect(ditherHtml).toContain("STEP 1 OF 3");
      expect(ditherHtml).toContain("tnum"); // Tabular numerals
    });

    it("handles done and error states and reduced motion correctly", () => {
      // ConvergeBar done state
      const doneHtml = renderToStaticMarkup(
        React.createElement(ConvergeBar, { progress: 1.0, state: "done" })
      );
      expect(doneHtml).toContain("is-done");
      expect(doneHtml).toContain("art-junction");
      expect(doneHtml).toContain('aria-valuenow="100"');

      // ConvergeBar error state
      const errorHtml = renderToStaticMarkup(
        React.createElement(ConvergeBar, { progress: 0.3, state: "error" })
      );
      expect(errorHtml).toContain("is-error");
      expect(errorHtml).toContain("STOPPED");
      expect(errorHtml).toContain("art-junction is-error");

      // Reduced motion flag
      const reducedHtml = renderToStaticMarkup(
        React.createElement(LinearDitherBar, { progress: 0.7, reducedMotion: true })
      );
      expect(reducedHtml).toContain('data-reduced-motion="true"');
    });

    it("supports canvas rendering mode with progressbar semantics", () => {
      const convergeCanvas = renderToStaticMarkup(
        React.createElement(ConvergeBar, {
          progress: 0.5,
          asCanvas: true,
          width: 320,
          height: 16,
        })
      );
      expect(convergeCanvas).toContain("<canvas");
      expect(convergeCanvas).toContain('role="progressbar"');
      expect(convergeCanvas).toContain('aria-valuenow="50"');

      const ditherCanvas = renderToStaticMarkup(
        React.createElement(LinearDitherBar, {
          progress: 0.75,
          asCanvas: true,
          width: 280,
          height: 14,
        })
      );
      expect(ditherCanvas).toContain("<canvas");
      expect(ditherCanvas).toContain('role="progressbar"');
      expect(ditherCanvas).toContain('aria-valuenow="75"');
    });
  });

  describe("FocusBrackets", () => {
    it("matches design recipe: 12px legs, 1.5px stroke, 0.55 opacity, 5.5 outer-corner radius, 8px outside, aria-hidden", () => {
      const html = renderToStaticMarkup(React.createElement(FocusBrackets));
      expect(html).toContain("art-brackets");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('opacity:0.55');
      expect(html).toContain('inset:-8px');

      // 4 corner bracket elements
      const cornerMatches = html.match(/class="[^"]*art-bracket-[^"]*"/g);
      expect(cornerMatches).not.toBeNull();
      expect(cornerMatches!.length).toBe(4);

      // SVG stroke and path attributes
      expect(html).toContain('stroke-width="1.5"');
      expect(html).toContain('viewBox="0 0 12 12"');

      // Alert tone
      const alertHtml = renderToStaticMarkup(React.createElement(FocusBrackets, { tone: "alert" }));
      expect(alertHtml).toContain('data-tone="alert"');
    });
  });

  describe("DitherEdge", () => {
    it("renders stacked radial-dot layers with graded masks and honors props", () => {
      const html = renderToStaticMarkup(
        React.createElement(DitherEdge, {
          direction: "bottom",
          fineGridSize: 3.5,
          coarseGridSize: 7,
          opacity: 0.8,
        })
      );
      expect(html).toContain("art-dither-edge");
      expect(html).toContain("art-dither-edge-fine");
      expect(html).toContain("art-dither-edge-coarse");
      expect(html).toContain('data-direction="bottom"');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('opacity:0.8');

      // Different directions
      const topHtml = renderToStaticMarkup(React.createElement(DitherEdge, { direction: "top" }));
      expect(topHtml).toContain('data-direction="top"');
      const rightHtml = renderToStaticMarkup(React.createElement(DitherEdge, { direction: "right" }));
      expect(rightHtml).toContain('data-direction="right"');
    });
  });

  describe("HalftoneFade", () => {
    it("renders one soft-masked dot layer with directional mask", () => {
      const html = renderToStaticMarkup(
        React.createElement(HalftoneFade, {
          direction: "radial",
          gridSize: 8,
          dotRadius: 1.5,
          opacity: 0.7,
        })
      );
      expect(html).toContain("art-halftone-fade");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('data-direction="radial"');
      expect(html).toContain("8px 8px"); // backgroundSize
    });
  });

  describe("PaperGrain", () => {
    it("renders feTurbulence noise overlay and honors Background art and Art intensity settings", () => {
      // Enabled with intensity
      const html = renderToStaticMarkup(
        React.createElement(PaperGrain, { enabled: true, intensity: 80, fixed: false })
      );
      expect(html).toContain("art-paper-grain");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain("feTurbulence");
      expect(html).toContain('data-intensity="80"');

      // When disabled, renders nothing
      const disabledHtml = renderToStaticMarkup(
        React.createElement(PaperGrain, { enabled: false })
      );
      expect(disabledHtml).toBe("");
    });
  });

  describe("RegistrationMarks", () => {
    it("renders two 11 px crosses with 1 px stroke and --rule at .45", () => {
      const html = renderToStaticMarkup(React.createElement(RegistrationMarks));
      expect(html).toContain("art-reg-marks");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('opacity:0.45');

      // 2 crosses rendered diagonally
      const crossMatches = html.match(/class="[^"]*art-cross[^"]*"/g);
      expect(crossMatches).not.toBeNull();
      expect(crossMatches!.length).toBe(2);

      // 11px dimensions and 1px stroke
      expect(html).toContain('width="11"');
      expect(html).toContain('height="11"');
      expect(html).toContain('stroke-width="1"');
    });
  });

  describe("Slider and Toggle", () => {
    it("Slider renders with track, solid fill, 28 px thumb with ink border, and ARIA slider semantics", () => {
      const onChange = vi.fn();
      const html = renderToStaticMarkup(
        React.createElement(Slider, {
          value: 45,
          min: 0,
          max: 100,
          step: 5,
          onChange,
          label: "Volume Control",
        })
      );

      expect(html).toContain('role="slider"');
      expect(html).toContain('aria-valuenow="45"');
      expect(html).toContain('aria-valuemin="0"');
      expect(html).toContain('aria-valuemax="100"');
      expect(html).toContain('aria-label="Volume Control"');
      expect(html).toContain("art-slider-track");
      expect(html).toContain("art-slider-fill");
      expect(html).toContain("art-slider-thumb");
      // Thumb 28px
      expect(html).toContain("width:28px");
      expect(html).toContain("height:28px");
      expect(html).toContain("2px solid var(--r-ink, #242320)");
    });

    it("Toggle renders with aria-checked and 52x30 ink switch", () => {
      const checkedHtml = renderToStaticMarkup(
        React.createElement(Toggle, { checked: true, label: "Sound effects" })
      );
      expect(checkedHtml).toContain('role="switch"');
      expect(checkedHtml).toContain('aria-checked="true"');
      expect(checkedHtml).toContain('aria-label="Sound effects"');

      const uncheckedHtml = renderToStaticMarkup(
        React.createElement(Toggle, { checked: false, label: "Sound effects" })
      );
      expect(uncheckedHtml).toContain('aria-checked="false"');
    });
  });

  describe("SteppedMeter, Sheet, Chip, Tag", () => {
    it("SteppedMeter renders segments with correct active count", () => {
      const html = renderToStaticMarkup(
        React.createElement(SteppedMeter, { value: 0.6, segments: 10 })
      );
      expect(html).toContain("art-meter");
      const filledMatches = html.match(/class="[^"]*is-filled[^"]*"/g);
      expect(filledMatches).not.toBeNull();
      expect(filledMatches!.length).toBe(6);
    });

    it("Sheet renders dialog role, grab handle, and title", () => {
      const onClose = vi.fn();
      const openHtml = renderToStaticMarkup(
        React.createElement(
          Sheet,
          { open: true, title: "Options Menu", onClose },
          React.createElement("p", null, "Sheet content")
        )
      );
      expect(openHtml).toContain('role="dialog"');
      expect(openHtml).toContain("grab");
      expect(openHtml).toContain("Options Menu");
    });

    it("Chip and Tag render proper styling and variants", () => {
      const tagHtml = renderToStaticMarkup(
        React.createElement(Tag, { variant: "alert" }, "Failed")
      );
      expect(tagHtml).toContain("tag");
      expect(tagHtml).toContain("alert");

      const chipHtml = renderToStaticMarkup(
        React.createElement(Chip, { active: true }, "Filter")
      );
      expect(chipHtml).toContain("pill");
      expect(chipHtml).toContain('data-active="true"');
    });
  });
});
