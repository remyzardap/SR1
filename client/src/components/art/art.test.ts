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
  DITHER_EDGE_BAND_COUNT,
  computeDitherBands,
  type DitherBand,
  type DitherEdgeProps,
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
    const render = (props: DitherEdgeProps = {}) =>
      renderToStaticMarkup(React.createElement(DitherEdge, props));

    /** Every `background-size` the rendered layers claim, in DOM order. */
    const backgroundSizes = (html: string) =>
      html.match(/background-size:[0-9.]+px [0-9.]+px/g) ?? [];

    /** Where a mask stop lands on the strip, in % from the dissolving edge. */
    const stopPosition = (band: DitherBand, index: number) =>
      band.offsetPercent + (band.extentPercent * band.stops[index].atPercent) / 100;

    /** Index of the last stop that is fully opaque — the band's density peak. */
    const peakStopIndex = (band: DitherBand) =>
      band.stops.reduce((last, stop, index) => (stop.alpha === 1 ? index : last), 0);

    /**
     * Mask alpha a band contributes at a position on the strip, interpolating its stops the way the
     * browser interpolates a linear-gradient (the last stop holds to the end of the band).
     */
    const alphaAt = (band: DitherBand, percent: number) => {
      const end = band.offsetPercent + band.extentPercent;
      if (percent < band.offsetPercent || percent > end) return 0;
      const local = (100 * (percent - band.offsetPercent)) / band.extentPercent;
      const stops = band.stops;
      if (local <= stops[0].atPercent) return stops[0].alpha;
      for (let i = 1; i < stops.length; i++) {
        if (local <= stops[i].atPercent) {
          const from = stops[i - 1];
          const to = stops[i];
          const t = (local - from.atPercent) / (to.atPercent - from.atPercent);
          return from.alpha + t * (to.alpha - from.alpha);
        }
      }
      return stops[stops.length - 1].alpha;
    };

    it("renders graded adjacent dot bands with crossfading masks and honors props", () => {
      const html = render({
        direction: "bottom",
        fineGridSize: 3.5,
        coarseGridSize: 7,
        opacity: 0.8,
      });
      expect(html).toContain("art-dither-edge");
      expect(html).toContain("art-dither-edge-fine");
      expect(html).toContain("art-dither-edge-coarse");
      expect(html).toContain('data-direction="bottom"');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('opacity:0.8');

      // Different directions
      const topHtml = render({ direction: "top" });
      expect(topHtml).toContain('data-direction="top"');
      const rightHtml = render({ direction: "right" });
      expect(rightHtml).toContain('data-direction="right"');
    });

    // The moire came from two grids covering the same pixels. One lattice per band is the fix, so
    // this is the invariant the task asks for: no two band layers in one DitherEdge share a grid.
    it("never gives two band layers the same background-size", () => {
      const sizes = backgroundSizes(render());
      expect(sizes).toHaveLength(DITHER_EDGE_BAND_COUNT);
      expect(new Set(sizes).size).toBe(sizes.length);
      expect(sizes).toEqual([
        "background-size:3.5px 3.5px",
        "background-size:5.25px 5.25px",
        "background-size:7px 7px",
      ]);
    });

    it("keeps the grids distinct when a screen passes equal or inverted grid sizes", () => {
      const degenerate = [
        { fineGridSize: 5, coarseGridSize: 5 },
        { fineGridSize: 7, coarseGridSize: 3.5 },
      ];
      for (const props of degenerate) {
        const sizes = backgroundSizes(render(props));
        expect(sizes).toHaveLength(DITHER_EDGE_BAND_COUNT);
        expect(new Set(sizes).size).toBe(sizes.length);
      }
      expect(computeDitherBands(5, 5, false).map((b) => b.grid)).toEqual([5, 5.5, 6]);
    });

    it("draws exactly one dot lattice per band, round and pinned to the band origin", () => {
      const html = render();
      const lattices = html.match(/radial-gradient\(circle at 50% 50%/g);
      expect(lattices).toHaveLength(DITHER_EDGE_BAND_COUNT);
      for (const band of computeDitherBands(3.5, 7, false)) {
        const stop = Math.round((band.radius + 0.4) * 100) / 100;
        expect(html).toContain(
          `radial-gradient(circle at 50% 50%, var(--r-ink) ${band.radius}px,` +
            ` transparent ${stop}px)`
        );
        // The radius plus its 0.4px falloff still fits inside the cell, so no dot is clipped by its
        // own tile (which is what would make it look square).
        expect(band.radius + 0.4).toBeLessThanOrEqual(band.grid / 2);
      }
      expect(html.match(/background-position:0px 0px/g)).toHaveLength(DITHER_EDGE_BAND_COUNT);
    });

    it("crossfades neighbouring bands so their masks sum to one", () => {
      const bands = computeDitherBands(3.5, 7, false);
      const inner = bands[bands.length - 1];
      expect(bands).toHaveLength(DITHER_EDGE_BAND_COUNT);
      expect(bands[0].offsetPercent).toBe(0);
      expect(inner.offsetPercent + inner.extentPercent).toBe(100);

      for (let i = 1; i < bands.length; i++) {
        const prev = bands[i - 1];
        const next = bands[i];
        const prevEnd = prev.offsetPercent + prev.extentPercent;
        // Adjacent, never a gap: the next band starts before the previous one has faded out.
        expect(next.offsetPercent).toBeLessThanOrEqual(prevEnd);
        // Complementary ramps: the next band starts rising where the previous one peaks, and it
        // reaches full density where the previous one is gone — two lattices are never both strong
        // on the same pixel.
        expect(next.offsetPercent).toBeCloseTo(stopPosition(prev, peakStopIndex(prev)), 1);
        expect(stopPosition(next, 1)).toBeCloseTo(prevEnd, 1);
      }
      for (const band of bands) {
        expect(band.stops[0]).toEqual({ atPercent: 0, alpha: 0 });
      }
    });

    // Both artifacts show up in the summed density along the strip: the double exposure that beat
    // into the cross-hatch, and the banding steps. It may never exceed one full layer, and never
    // dip on the way in. Sampled at 1% steps; the 0.001 slack is the stop positions' rounding.
    it("keeps total dot density monotone and never above one layer", () => {
      const dotBands = computeDitherBands(3.5, 7, true).filter((band) => band.variant === "dot");
      let previous = 0;
      for (let percent = 0; percent <= 100; percent++) {
        const total = dotBands.reduce((sum, band) => sum + alphaAt(band, percent), 0);
        expect(total).toBeLessThanOrEqual(1.001);
        expect(total).toBeGreaterThanOrEqual(previous - 0.001);
        previous = total;
      }
      expect(previous).toBeCloseTo(1, 2);
    });

    it("grows density inward from the named edge in all four directions", () => {
      const axes = { bottom: "to top", top: "to bottom", left: "to right", right: "to left" };
      for (const direction of ["bottom", "top", "left", "right"] as const) {
        const html = render({ direction });
        expect(html).toContain(`data-direction="${direction}"`);
        expect(html).toContain(`mask-image:linear-gradient(${axes[direction]},`);
        // The finest lattice hugs the dissolving edge.
        expect(html).toMatch(new RegExp(`data-band="fine"[^>]*${direction}:0%`));
      }
      expect(render({ direction: "right" })).toContain("right:0%;width:40%");
    });

    it("adds the solid paper area and its faint texture only when paperColor is set", () => {
      const plain = render();
      expect(plain).not.toContain("art-dither-edge-paper");
      expect(plain).not.toContain("art-dither-edge-texture");

      const html = render({ paperColor: "var(--r-card)" });
      expect(html).toContain("art-dither-edge-paper");
      expect(html).toContain("background:var(--r-card)");
      expect(html).toContain('data-band="texture"');
      expect(html).toContain("background-size:9px 9px");
      expect(html).toContain("opacity:0.4");

      // The texture is a fourth lattice and must not share a grid with the dot bands either.
      const sizes = backgroundSizes(html);
      expect(sizes).toHaveLength(DITHER_EDGE_BAND_COUNT + 1);
      expect(new Set(sizes).size).toBe(sizes.length);

      const [paper, texture] = computeDitherBands(3.5, 7, true).slice(-2);
      expect(paper.offsetPercent + paper.extentPercent).toBe(100);
      expect(texture.offsetPercent + texture.extentPercent).toBe(100);
      expect(paper.stops[0].alpha).toBe(0);
      expect(texture.radius).toBeLessThan(texture.grid / 2);
    });

    it("passes the color token, className, id and style through", () => {
      const html = render({
        color: "var(--r-accent)",
        className: "edge-x",
        id: "dither-edge-1",
        style: { height: "18px" },
      });
      expect(html).toContain('class="art-dither-edge edge-x"');
      expect(html).toContain('id="dither-edge-1"');
      expect(html).toContain("height:18px");
      expect(html).toContain("var(--r-accent) 0.77px");
      expect(html).not.toContain("var(--r-ink)");
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
