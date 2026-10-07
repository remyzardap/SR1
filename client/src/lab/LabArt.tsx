import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import {
  HalftoneRamp,
  ConvergeBar,
  LinearDitherBar,
  SteppedMeter,
  Toggle,
  Chip,
  Tag,
  FocusBrackets,
  Sheet,
} from "@/components/art";

export default function LabArt() {
  const [toggleState, setToggleState] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [progress, setProgress] = useState(0.65);

  return (
    <LabLayout title="Art Primitives">
      <div style={{ display: "grid", gap: 28 }}>
        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 14 }}>HalftoneRamp</h2>
          <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>1D 16-Dot Prototype Row</span>
          <HalftoneRamp row />
          <span className="mono" style={{ fontSize: 12, display: "block", marginTop: 18, marginBottom: 6, color: "var(--quiet)" }}>2D Grid (columns=8, rows=2)</span>
          <HalftoneRamp columns={8} rows={2} />
        </section>

        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 14 }}>Progress Bars</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>ConvergeBar ({Math.round(progress * 100)}%)</span>
              <ConvergeBar progress={progress} label="RESEARCHING" etaSeconds={8} />
            </div>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>LinearDitherBar</span>
              <LinearDitherBar progress={progress} stepLabel="STEP 2 OF 3" etaSeconds={12} />
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={progress}
              onChange={(e) => setProgress(parseFloat(e.target.value))}
              style={{ width: "100%", marginTop: 8 }}
            />
          </div>
        </section>

        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 14 }}>SteppedMeter</h2>
          <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>5 Segments (3/5)</span>
              <SteppedMeter value={0.6} segments={5} />
            </div>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>10 Segments (7/10)</span>
              <SteppedMeter value={0.7} segments={10} />
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 14 }}>Toggle & Chips</h2>
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>Toggle ({toggleState ? "ON" : "OFF"})</span>
              <Toggle checked={toggleState} onCheckedChange={setToggleState} label="Example switch" />
            </div>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>Chips</span>
              <div style={{ display: "flex", gap: 8 }}>
                <Chip active>Active</Chip>
                <Chip>Inactive</Chip>
              </div>
            </div>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>Tags</span>
              <div style={{ display: "flex", gap: 8 }}>
                <Tag>Default</Tag>
                <Tag variant="quiet">Quiet</Tag>
                <Tag variant="alert">Alert</Tag>
              </div>
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 14 }}>FocusBrackets & Sheet</h2>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <div style={{ position: "relative", padding: "12px 24px", background: "var(--panel)", borderRadius: 12 }}>
              <FocusBrackets />
              <span>Target with 9px Brackets</span>
            </div>
            <button type="button" className="btn ink" onClick={() => setSheetOpen(true)}>
              Open Bottom Sheet
            </button>
          </div>
        </section>

        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Lab Bottom Sheet">
          <p style={{ margin: "0 0 16px", color: "var(--quiet)" }}>
            Reusable bottom sheet with grab handle, responsive desktop dialog centering, and touch dismissal.
          </p>
          <button type="button" className="btn ink" onClick={() => setSheetOpen(false)} style={{ width: "100%" }}>
            Close
          </button>
        </Sheet>
      </div>
    </LabLayout>
  );
}
