import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { LabSliderRow } from "./LabSliderRow";
import { DitherEdge, Toggle } from "@/components/art";

export default function LabDitherEdge() {
  const [direction, setDirection] = useState<"top" | "bottom" | "left" | "right">("bottom");
  const [opacity, setOpacity] = useState(0.85);
  const [colorToken, setColorToken] = useState<"var(--r-ink)" | "var(--r-rule)" | "var(--r-alert)">("var(--r-ink)");
  const [fineGrid, setFineGrid] = useState(3.5);
  const [coarseGrid, setCoarseGrid] = useState(7);
  const [withPaper, setWithPaper] = useState(false);

  return (
    <LabLayout title="DitherEdge Lab">
      <div style={{ display: "grid", gap: 24 }}>
        <p style={{ color: "var(--quiet)", margin: 0 }}>
          Adjacent graded bands of radial dots: one dot layer per band, each masked so the density
          rises smoothly from nothing. No two bands share a dot grid, so they cannot interfere into
          a cross-hatch.
        </p>

        {/* Interactive Controls */}
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 14 }}>Interactive Controls</h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--quiet)" }}>
                Direction
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {(["bottom", "top", "right", "left"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid var(--stroke)",
                      background: direction === d ? "var(--ink)" : "var(--card)",
                      color: direction === d ? "var(--paper)" : "var(--ink)",
                      cursor: "pointer",
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--quiet)" }}>
                Color Token
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {(["var(--r-ink)", "var(--r-rule)", "var(--r-alert)"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorToken(c)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid var(--stroke)",
                      background: colorToken === c ? "var(--ink)" : "var(--card)",
                      color: colorToken === c ? "var(--paper)" : "var(--ink)",
                      cursor: "pointer",
                    }}
                  >
                    {c.replace("var(--r-", "").replace(")", "")}
                  </button>
                ))}
              </div>
            </div>

            <LabSliderRow
              label="Opacity"
              ariaLabel="Edge opacity"
              value={opacity}
              min={0.1}
              max={1}
              step={0.05}
              decimals={2}
              onChange={setOpacity}
            />
            <LabSliderRow
              label="Fine grid"
              ariaLabel="Fine grid pitch"
              value={fineGrid}
              min={2}
              max={12}
              step={0.25}
              unit=" px"
              onChange={setFineGrid}
            />
            <LabSliderRow
              label="Coarse grid"
              ariaLabel="Coarse grid pitch"
              value={coarseGrid}
              min={4}
              max={20}
              step={0.5}
              unit=" px"
              onChange={setCoarseGrid}
            />
            <div style={{ minWidth: 150 }}>
              <span
                className="mono"
                style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--quiet)" }}
              >
                Paper area
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
                <Toggle
                  checked={withPaper}
                  onCheckedChange={setWithPaper}
                  label="Solid paper area at the dense end"
                />
                <span className="mono">{withPaper ? "on" : "off"}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Live Preview Stage */}
        <section className="card" style={{ padding: 24, minHeight: 220, position: "relative", overflow: "hidden" }}>
          <h3 style={{ font: "700 15px/1 var(--disp)", marginBottom: 12 }}>
            Interactive Preview ({direction}, opacity={opacity})
          </h3>
          <div
            style={{
              position: "relative",
              height: 140,
              background: "var(--panel)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <DitherEdge
              direction={direction}
              opacity={opacity}
              color={colorToken}
              fineGridSize={fineGrid}
              coarseGridSize={coarseGrid}
              paperColor={withPaper ? "var(--r-paper)" : undefined}
            />
          </div>
        </section>

        {/* All Four Directions Matrix */}
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ font: "700 15px/1 var(--disp)", marginBottom: 16 }}>All Four Directions</h3>
          <div className="lab-grid lab-grid-sm" style={{ gap: 16 }}>
            {(["bottom", "top", "right", "left"] as const).map((dir) => (
              <div key={dir}>
                <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 6, color: "var(--quiet)" }}>
                  Direction: {dir}
                </span>
                <div
                  style={{
                    position: "relative",
                    height: 100,
                    background: "var(--panel)",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  <DitherEdge direction={dir} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Graded bands dissolving into the solid paper area, on a card surface */}
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ font: "700 15px/1 var(--disp)", marginBottom: 16 }}>
            Dots And Paper Area, On A Card
          </h3>
          <p style={{ fontSize: 13, color: "var(--quiet)", marginBottom: 16 }}>
            <code>paperColor</code> fills the dense end with solid paper and overlays a faint
            texture on a wider grid. These boxes keep a card background whatever the page
            background is switched to, so the paper area stays legible in both.
          </p>
          <div className="lab-grid lab-grid-sm" style={{ gap: 16 }}>
            {(["bottom", "top", "right", "left"] as const).map((dir) => (
              <div key={`${dir}-paper`}>
                <span
                  className="mono"
                  style={{ fontSize: 11, display: "block", marginBottom: 6, color: "var(--quiet)" }}
                >
                  {dir} + paper
                </span>
                <div
                  style={{
                    position: "relative",
                    height: 100,
                    background: "var(--card)",
                    border: "1px solid var(--stroke)",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  <DitherEdge direction={dir} color="var(--r-paper)" paperColor="var(--r-paper)" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </LabLayout>
  );
}
