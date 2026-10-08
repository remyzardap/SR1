import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { Slider, Toggle } from "@/components/art";

export default function LabSlider() {
  const [val1, setVal1] = useState(45);
  const [val2, setVal2] = useState(70);
  const [disabled, setDisabled] = useState(false);
  const [toggleVal, setToggleVal] = useState(true);

  return (
    <LabLayout title="Slider & Toggle Lab">
      <div style={{ display: "grid", gap: 24, maxWidth: 640 }}>
        <p style={{ color: "var(--quiet)", margin: 0 }}>
          Themed range slider and switch components: clean track, solid ink fill, 28 px thumb with ink border,
          full ARIA semantics, keyboard navigation, and zero browser-default blue anywhere.
        </p>

        {/* Themed Slider Interactive Test */}
        <section className="card" style={{ padding: 24 }}>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 18 }}>Themed Range Slider</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <label className="mono" style={{ fontSize: 12, color: "var(--quiet)" }}>Primary slider (0 to 100)</label>
                <span className="mono tnum" style={{ fontSize: 13, fontWeight: 700 }}>{val1}%</span>
              </div>
              <Slider
                value={val1}
                min={0}
                max={100}
                step={1}
                onChange={setVal1}
                label="Primary volume"
                disabled={disabled}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <label className="mono" style={{ fontSize: 12, color: "var(--quiet)" }}>Stepped slider (step 5)</label>
                <span className="mono tnum" style={{ fontSize: 13, fontWeight: 700 }}>{val2}</span>
              </div>
              <Slider
                value={val2}
                min={0}
                max={100}
                step={5}
                onChange={setVal2}
                label="Stepped parameter"
                disabled={disabled}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--stroke)", paddingTop: 14 }}>
              <span style={{ fontSize: 13 }}>Disable sliders</span>
              <Toggle checked={disabled} onCheckedChange={setDisabled} label="Toggle slider disabled" />
            </div>
          </div>
        </section>

        {/* Themed Toggle Switch */}
        <section className="card" style={{ padding: 24 }}>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 18 }}>52x30 Switch (Toggle)</h2>
          <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Toggle checked={toggleVal} onCheckedChange={setToggleVal} label="Active switch" />
              <span className="mono" style={{ fontSize: 12 }}>State: {toggleVal ? "ON" : "OFF"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Toggle checked={false} disabled label="Disabled off switch" />
              <span className="mono" style={{ fontSize: 12, color: "var(--quiet)" }}>Disabled</span>
            </div>
          </div>
        </section>
      </div>
    </LabLayout>
  );
}
