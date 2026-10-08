import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { HalftoneFade, Slider } from "@/components/art";

export default function LabHalftoneFade() {
  const [direction, setDirection] = useState<"radial" | "bottom" | "top" | "right" | "left">("radial");
  const [opacity, setOpacity] = useState(0.7);
  const [gridSize, setGridSize] = useState(6);
  const [dotRadius, setDotRadius] = useState(1.2);

  return (
    <LabLayout title="HalftoneFade Lab">
      <div style={{ display: "grid", gap: 24 }}>
        <p style={{ color: "var(--quiet)", margin: 0 }}>
          One soft-masked dot layer designed for card accents (such as the "Hand off a project" card).
        </p>

        {/* Controls */}
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 14 }}>Props & Options</h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ width: 150, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--quiet)" }}>
                Direction / Mask Shape
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["radial", "bottom", "top", "right", "left"] as const).map((d) => (
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
                Grid Size: {gridSize}px
              </span>
              <Slider label="GridSize control" min={4} max={12} step={1} value={gridSize} onChange={setGridSize} />
            </div>

            <div style={{ width: 150, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--quiet)" }}>
                Dot Radius: {dotRadius}px
              </span>
              <Slider label="DotRadius control" min={0.6} max={2.5} step={0.1} value={dotRadius} onChange={setDotRadius} />
            </div>

            <div style={{ width: 150, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--quiet)" }}>
                Opacity: {opacity}
              </span>
              <Slider label="Opacity control" min={0.1} max={1} step={0.05} value={opacity} onChange={setOpacity} />
            </div>
          </div>
        </section>

        {/* Live Card Example (Hand-off card simulation) */}
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ font: "700 15px/1 var(--disp)", marginBottom: 12 }}>Hand-off Card Simulation</h3>
          <div
            style={{
              position: "relative",
              maxWidth: 420,
              padding: "24px 28px",
              borderRadius: 18,
              background: "var(--card)",
              border: "1px solid var(--stroke)",
              overflow: "hidden",
            }}
          >
            <HalftoneFade
              direction={direction}
              opacity={opacity}
              gridSize={gridSize}
              dotRadius={dotRadius}
            />
            <div style={{ position: "relative", zIndex: 1 }}>
              <b style={{ font: "700 17px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>
                Hand off a project
              </b>
              <p style={{ margin: 0, fontSize: 13, color: "var(--quiet)" }}>
                Works in background with deep research and code generation while you are away.
              </p>
            </div>
          </div>
        </section>
      </div>
    </LabLayout>
  );
}
