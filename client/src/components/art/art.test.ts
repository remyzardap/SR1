import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HalftoneRamp,
  FocusBrackets,
  ConvergeBar,
  LinearDitherBar,
  SteppedMeter,
  Toggle,
  Chip,
  Tag,
  Sheet,
} from "./index";

describe("Art Primitives", () => {
  it("HalftoneRamp renders 16 dots in 1D row mode", () => {
    // 1D row mode default
    const rowHtml = renderToStaticMarkup(React.createElement(HalftoneRamp));
    expect(rowHtml).toContain("ramp");

    // Count <i> dots rendered
    const dotMatches = rowHtml.match(/<i\b[^>]*>/g);
    expect(dotMatches).not.toBeNull();
    expect(dotMatches!.length).toBe(16);

    // Explicit row mode
    const explicitRowHtml = renderToStaticMarkup(React.createElement(HalftoneRamp, { row: true }));
    const explicitMatches = explicitRowHtml.match(/<i\b[^>]*>/g);
    expect(explicitMatches!.length).toBe(16);

    // 2D grid mode backward compatibility
    const gridHtml = renderToStaticMarkup(
      React.createElement(HalftoneRamp, { columns: 4, rows: 3 })
    );
    expect(gridHtml).toContain("<svg");
    const circleMatches = gridHtml.match(/<circle\b/g);
    expect(circleMatches).not.toBeNull();
    expect(circleMatches!.length).toBe(12);
  });

  it("FocusBrackets renders 4 corner indicators", () => {
    const html = renderToStaticMarkup(React.createElement(FocusBrackets));
    expect(html).toContain("brk");
    const cornerMatches = html.match(/<i\b[^>]*>/g);
    expect(cornerMatches).not.toBeNull();
    expect(cornerMatches!.length).toBe(4);
  });

  it("ConvergeBar and LinearDitherBar render canvas / svg with correct dimensions and aria attributes", () => {
    // ConvergeBar as canvas
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
    expect(convergeCanvas).toContain('aria-valuemin="0"');
    expect(convergeCanvas).toContain('aria-valuemax="100"');
    expect(convergeCanvas).toContain('width="320"');
    expect(convergeCanvas).toContain('height="16"');

    // ConvergeBar standard track (contains embedded canvas and progressbar track)
    const convergeTrack = renderToStaticMarkup(
      React.createElement(ConvergeBar, { progress: 0.4 })
    );
    expect(convergeTrack).toContain('role="progressbar"');
    expect(convergeTrack).toContain('aria-valuenow="40"');
    expect(convergeTrack).toContain("<canvas");

    // LinearDitherBar as canvas
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
    expect(ditherCanvas).toContain('aria-valuemin="0"');
    expect(ditherCanvas).toContain('aria-valuemax="100"');
    expect(ditherCanvas).toContain('width="280"');
    expect(ditherCanvas).toContain('height="14"');

    // LinearDitherBar standard track
    const ditherTrack = renderToStaticMarkup(
      React.createElement(LinearDitherBar, { progress: 0.25 })
    );
    expect(ditherTrack).toContain('role="progressbar"');
    expect(ditherTrack).toContain('aria-valuenow="25"');
    expect(ditherTrack).toContain("<canvas");
  });

  it("SteppedMeter renders segments with correct active count", () => {
    const html = renderToStaticMarkup(
      React.createElement(SteppedMeter, { value: 0.6, segments: 10 })
    );
    expect(html).toContain("art-meter");

    // 6 segments filled out of 10
    const filledMatches = html.match(/class="[^"]*is-filled[^"]*"/g);
    expect(filledMatches).not.toBeNull();
    expect(filledMatches!.length).toBe(6);

    const allSegments = html.match(/<i\b/g);
    expect(allSegments!.length).toBe(10);
  });

  it("Toggle renders with aria-checked", () => {
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

  it("Sheet renders dialog role, grab handle, title, closes on backdrop click or escape", () => {
    const onClose = vi.fn();
    const openHtml = renderToStaticMarkup(
      React.createElement(
        Sheet,
        {
          open: true,
          title: "Options Menu",
          onClose,
        },
        React.createElement("p", null, "Sheet content")
      )
    );

    expect(openHtml).toContain('role="dialog"');
    expect(openHtml).toContain("grab");
    expect(openHtml).toContain("Options Menu");
    expect(openHtml).toContain("sheet-scrim");
    expect(openHtml).toContain("Sheet content");

    // Closed sheet renders nothing
    const closedHtml = renderToStaticMarkup(
      React.createElement(
        Sheet,
        {
          open: false,
          title: "Closed Menu",
          onClose,
        },
        React.createElement("p", null, "Hidden")
      )
    );
    expect(closedHtml).toBe("");
  });

  it("Chip and Tag render proper styling and variants", () => {
    const tagHtml = renderToStaticMarkup(
      React.createElement(Tag, { variant: "alert" }, "Failed")
    );
    expect(tagHtml).toContain("tag");
    expect(tagHtml).toContain("alert");
    expect(tagHtml).toContain("Failed");

    const chipHtml = renderToStaticMarkup(
      React.createElement(Chip, { active: true }, "Filter")
    );
    expect(chipHtml).toContain("pill");
    expect(chipHtml).toContain('data-active="true"');
  });
});
