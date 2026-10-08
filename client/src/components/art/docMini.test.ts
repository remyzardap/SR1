import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocMini } from "./DocMini";
import { DitherSphere, drawDitherSphere } from "./DitherSphere";

describe("DocMini component", () => {
  it("renders a report with fanned A4 pages, figures and table", () => {
    const html = renderToStaticMarkup(
      React.createElement(DocMini, {
        kind: "report",
        data: {
          title: "Off grid solar cost per kWh",
          kicker: "Research report",
          cover: "cov-solar",
          figs: [
            ["Low", "0.28"],
            ["High", "0.45"],
            ["Sources", "14"],
          ],
          bars: [0.9, 0.74, 0.62, 0.5],
        },
      })
    );

    expect(html).toContain("docbox");
    expect(html).toContain("doc-report");
    expect(html).toContain("Off grid solar cost per kWh");
    expect(html).toContain("Research report");
    expect(html).toContain("cov-solar.webp");
    expect(html).toContain("dp page back");
    expect(html).toContain("dp page front");
    expect(html).toContain("dp-table");
    expect(html).toContain("Jinko Tiger Neo");
    expect(html).toContain("Low");
    expect(html).toContain("0.28");
    expect(html).toContain("dp-bars");
  });

  it("renders a deck with 16:9 slides and cover", () => {
    const html = renderToStaticMarkup(
      React.createElement(DocMini, {
        kind: "deck",
        data: {
          title: "TGWI investor update Q3",
          kicker: "TGWI · October 2026",
          cover: "cov-jakarta-bw",
          meta: "01 / 18",
        },
      })
    );

    expect(html).toContain("doc-deck");
    expect(html).toContain("TGWI investor update Q3");
    expect(html).toContain("TGWI · October 2026");
    expect(html).toContain("cov-jakarta-bw.webp");
    expect(html).toContain("slide s3");
    expect(html).toContain("slide s2");
    expect(html).toContain("slide front cover");
    expect(html).toContain("Three risks, three owners");
    expect(html).toContain("+12%");
  });

  it("renders a sheet with spreadsheet window, tabs and polaroid", () => {
    const html = renderToStaticMarkup(
      React.createElement(DocMini, {
        kind: "sheet",
        data: {
          title: "Villa BOQ and budget",
          kicker: "Site · Seminyak",
          cover: "cov-villa",
        },
      })
    );

    expect(html).toContain("doc-sheet");
    expect(html).toContain("Villa BOQ and budget.xlsx");
    expect(html).toContain("Site · Seminyak");
    expect(html).toContain("cov-villa.webp");
    expect(html).toContain("dp window");
    expect(html).toContain("dp polaroid");
    expect(html).toContain("Foundations");
    expect(html).toContain("1,067.4m");
    expect(html).toContain("Structure");
    expect(html).toContain("Finishes");
  });

  it("renders a brief with decisions and seal", () => {
    const html = renderToStaticMarkup(
      React.createElement(DocMini, {
        kind: "brief",
        data: {
          title: "Off grid solar for remote villages",
          kicker: "Board brief",
          cover: "cov-village",
        },
      })
    );

    expect(html).toContain("doc-brief");
    expect(html).toContain("Off grid solar for remote villages");
    expect(html).toContain("Board brief · One page");
    expect(html).toContain("Decision 1");
    expect(html).toContain("Approve a pilot in one village");
    expect(html).toContain("Decision 2");
    expect(html).toContain("Prepared by Sutaeru");
    expect(html).toContain("seal dp-seal");
  });

  it("renders a monitor with chart card and watching dot", () => {
    const html = renderToStaticMarkup(
      React.createElement(DocMini, {
        kind: "monitor",
        data: {
          title: "PLN tariff watch",
          kicker: "Every 6 hours",
          cover: "cov-pylons",
        },
      })
    );

    expect(html).toContain("doc-monitor");
    expect(html).toContain("PLN tariff watch");
    expect(html).toContain("Every 6 hours");
    expect(html).toContain("cov-pylons.webp");
    expect(html).toContain("Watching");
    expect(html).toContain("dp-chart");
    expect(html).toContain("1,114.74");
  });

  it("gracefully falls back to report defaults for unknown kind", () => {
    const html = renderToStaticMarkup(
      React.createElement(DocMini, {
        kind: "unknown_kind",
      })
    );

    expect(html).toContain("docbox");
    expect(html).toContain("doc-report");
  });
});

describe("DitherSphere", () => {
  it("renders canvas element with proper dimensions and aria-hidden", () => {
    const html = renderToStaticMarkup(
      React.createElement(DitherSphere, { width: 150, height: 150 })
    );

    expect(html).toContain("<canvas");
    expect(html).toContain('class="empty-sphere"');
    expect(html).toContain('width="150"');
    expect(html).toContain('height="150"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("drawDitherSphere executes without error on a canvas context", () => {
    const fillRect = vi.fn();
    const clearRect = vi.fn();
    const setTransform = vi.fn();

    const fakeCanvas = {
      width: 150,
      height: 150,
      getBoundingClientRect: () => ({ width: 150, height: 150 }),
      getContext: () => ({
        fillRect,
        clearRect,
        setTransform,
        fillStyle: "",
      }),
    } as unknown as HTMLCanvasElement;

    expect(() => drawDitherSphere(fakeCanvas, { seed: 5, fill: 0.5, k: 0.8 })).not.toThrow();
    expect(clearRect).toHaveBeenCalled();
    expect(fillRect).toHaveBeenCalled();
  });
});
