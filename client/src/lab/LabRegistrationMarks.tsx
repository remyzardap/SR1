import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { LabSliderRow } from "./LabSliderRow";
import { RegistrationMarks } from "@/components/art";

export default function LabRegistrationMarks() {
  const [placement, setPlacement] = useState<"diagonal-tl-br" | "diagonal-tr-bl" | "all-four">("diagonal-tl-br");
  const [opacity, setOpacity] = useState(0.45);
  const [offset, setOffset] = useState(8);

  return (
    <LabLayout title="RegistrationMarks Lab">
      <div style={{ display: "grid", gap: 24 }}>
        <p style={{ color: "var(--quiet)", margin: 0 }}>
          Two 11 px crosses, 1 px stroke, <code>--rule</code> at .45 opacity for alignment and print registration.
        </p>

        {/* Controls */}
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 14 }}>Placement & Metrics</h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 4, color: "var(--quiet)" }}>
                Placement Mode
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {(["diagonal-tl-br", "diagonal-tr-bl", "all-four"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlacement(p)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      border: "1px solid var(--stroke)",
                      background: placement === p ? "var(--ink)" : "var(--card)",
                      color: placement === p ? "var(--paper)" : "var(--ink)",
                      cursor: "pointer",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <LabSliderRow
              label="Opacity"
              ariaLabel="Marks opacity"
              value={opacity}
              min={0.1}
              max={1}
              step={0.05}
              onChange={setOpacity}
            />

            <LabSliderRow
              label="Edge Inset"
              ariaLabel="Edge inset"
              value={offset}
              min={4}
              max={24}
              step={2}
              unit=" px"
              decimals={0}
              onChange={setOffset}
            />
          </div>
        </section>

        {/* Stage Card */}
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ font: "700 15px/1 var(--disp)", marginBottom: 14 }}>Target Stage with Registration Marks</h3>
          <div
            style={{
              position: "relative",
              height: 200,
              maxWidth: 480,
              background: "var(--panel)",
              borderRadius: 16,
              border: "1px solid var(--stroke)",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            <RegistrationMarks
              size={11}
              strokeWidth={1}
              opacity={opacity}
              placement={placement}
              offset={offset}
            />
            <div style={{ textAlign: "center" }}>
              <b style={{ font: "700 16px/1.2 var(--disp)", display: "block", marginBottom: 4 }}>
                11 px Crosses
              </b>
              <span className="mono" style={{ fontSize: 12, color: "var(--quiet)" }}>
                Stroke: 1px · Opacity: {opacity} · Inset: {offset}px
              </span>
            </div>
          </div>
        </section>
      </div>
    </LabLayout>
  );
}
