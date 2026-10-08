import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { DitherEdge, Slider } from "@/components/art";

export default function LabDitherEdge() {
  const [direction, setDirection] = useState<"top" | "bottom" | "left" | "right">("bottom");
  const [opacity, setOpacity] = useState(0.85);
  const [colorToken, setColorToken] = useState<"var(--r-ink)" | "var(--r-rule)" | "var(--r-alert)">("var(--r-ink)");
  const [fineGrid, setFineGrid] = useState(4);
  const [coarseGrid, setCoarseGrid] = useState(8);

  return (
    <LabLayout title="DitherEdge Lab">
      <div style={{ display: "grid", gap: 24 }}>
        <p style={{ color: "var(--quiet)", margin: 0 }}>
          Stacked radial-dot layers with graded masks for organic stippled transitions.
        </p>

        {/* Interactive Controls */}
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 14 }}>Interactive Controls</h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ width: 150, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--quiet)" }}>
                Direction
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ width: 150, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--quiet)" }}>
                Color Token
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.replace("var(--r-", "").replace(")", "")}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ width: 150, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--quiet)" }}>
                Opacity: {opacity}
              </span>
              <Slider label="Opacity control" min={0.1} max={1} step={0.05} value={opacity} onChange={setOpacity} />
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
            />
          </div>
        </section>

        {/* All Four Directions Matrix */}
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ font: "700 15px/1 var(--disp)", marginBottom: 16 }}>All Four Directions</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
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
      </div>
    </LabLayout>
  );
}
