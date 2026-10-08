import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import {
  PaperGrain,
  readArtIntensity,
  setArtIntensity,
  Toggle,
  Slider,
} from "@/components/art";
import { readBackgroundArt, setBackgroundArt } from "@/lib/theme";

export default function LabPaperGrain() {
  const [bgArt, setBgArt] = useState(() => readBackgroundArt());
  const [intensity, setIntensity] = useState(() => readArtIntensity());

  const handleToggleBgArt = (next: boolean) => {
    setBgArt(next);
    setBackgroundArt(next);
  };

  const handleIntensityChange = (next: number) => {
    setIntensity(next);
    setArtIntensity(next);
  };

  return (
    <LabLayout title="PaperGrain Lab">
      {/* Background grain component mounted */}
      <PaperGrain enabled={bgArt} intensity={intensity} />

      <div style={{ display: "grid", gap: 24, position: "relative", zIndex: 1 }}>
        <p style={{ color: "var(--quiet)", margin: 0 }}>
          The <code>feTurbulence</code> fractal noise washi paper grain overlay.
          Honours the <strong>"Background art"</strong> setting (off hides grain) and scales opacity by <strong>"Art intensity"</strong>.
        </p>

        {/* Setting Controls */}
        <section className="card" style={{ padding: 24 }}>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 16 }}>Grain Settings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 500 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <b style={{ display: "block", fontSize: 14 }}>Background art</b>
                <span style={{ fontSize: 12, color: "var(--quiet)" }}>Hides decorative grain and noise when off</span>
              </div>
              <Toggle checked={bgArt} onCheckedChange={handleToggleBgArt} label="Background art toggle" />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--quiet)" }}>Art intensity</span>
                <span className="mono tnum" style={{ fontSize: 13, fontWeight: 700 }}>{intensity}%</span>
              </div>
              <Slider
                value={intensity}
                min={20}
                max={100}
                step={1}
                onChange={handleIntensityChange}
                label="Art intensity slider"
                disabled={!bgArt}
              />
            </div>
          </div>
        </section>

        {/* Visual Inspection Area */}
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ font: "700 15px/1 var(--disp)", marginBottom: 12 }}>Visual Inspection Stage</h3>
          <p style={{ fontSize: 13, color: "var(--quiet)", marginBottom: 16 }}>
            Toggle 2x Zoom in the top bar to inspect individual grain stipples and ensure no harsh banding or tiling seams appear.
          </p>
          <div
            style={{
              height: 120,
              borderRadius: 14,
              border: "1px dashed var(--stroke)",
              display: "grid",
              placeItems: "center",
              background: "var(--panel)",
            }}
          >
            <span className="mono" style={{ fontSize: 12, color: "var(--quiet)" }}>
              {bgArt ? `Grain Active (${intensity}%)` : "Grain Switched Off"}
            </span>
          </div>
        </section>
      </div>
    </LabLayout>
  );
}
