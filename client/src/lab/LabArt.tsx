import * as React from "react";
import { useState } from "react";
import { Link } from "wouter";
import { LabLayout } from "./LabLayout";
import {
  HalftoneRamp,
  ConvergeBar,
  LinearDitherBar,
  SteppedMeter,
  Toggle,
  Slider,
  Chip,
  Tag,
  FocusBrackets,
  DitherEdge,
  HalftoneFade,
  PaperGrain,
  RegistrationMarks,
  Sheet,
} from "@/components/art";

export default function LabArt() {
  // HalftoneRamp test state
  const [typingInput, setTypingInput] = useState("Sutaeru listening");
  const [manualPeak, setManualPeak] = useState(0.5);
  const [rampReducedMotion, setRampReducedMotion] = useState(false);

  // Progress bars test state
  const [progress, setProgress] = useState(0.65);
  const [barState, setBarState] = useState<"running" | "done" | "error">("running");
  const [barsReducedMotion, setBarsReducedMotion] = useState(false);

  // General controls state
  const [toggleState, setToggleState] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sliderVal, setSliderVal] = useState(55);
  const [grainActive, setGrainActive] = useState(true);
  const [grainIntensity, setGrainIntensity] = useState(70);

  return (
    <LabLayout title="Art Primitives">
      {/* Background grain component */}
      <PaperGrain enabled={grainActive} intensity={grainIntensity} />

      <div style={{ display: "grid", gap: 32 }}>
        {/* Quick Links to Dedicated Lab Pages */}
        <section className="card" style={{ padding: 18, borderRadius: 16 }}>
          <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 8, color: "var(--quiet)" }}>
            Dedicated Component Labs:
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/__lab/art/dither-edge" className="art-chip art-chip-sm" style={{ textDecoration: "none" }}>
              DitherEdge →
            </Link>
            <Link href="/__lab/art/halftone-fade" className="art-chip art-chip-sm" style={{ textDecoration: "none" }}>
              HalftoneFade →
            </Link>
            <Link href="/__lab/art/paper-grain" className="art-chip art-chip-sm" style={{ textDecoration: "none" }}>
              PaperGrain →
            </Link>
            <Link href="/__lab/art/registration-marks" className="art-chip art-chip-sm" style={{ textDecoration: "none" }}>
              RegistrationMarks →
            </Link>
            <Link href="/__lab/art/slider" className="art-chip art-chip-sm" style={{ textDecoration: "none" }}>
              Slider & Toggle →
            </Link>
          </div>
        </section>

        {/* 1. HalftoneRamp */}
        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <h2 style={{ font: "700 18px/1 var(--disp)", margin: 0 }}>1. HalftoneRamp</h2>
            <span className="mono" style={{ fontSize: 11, color: "var(--quiet)" }}>
              27 dots · size 1.6 + 11.4 * sin^1.7 · opacity 0.10 + 0.78 * sin^1.1 · gap 6px
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>
                A) Static 1D 27-Dot Row (peak at center dot 13)
              </span>
              <div style={{ padding: "12px 16px", background: "var(--panel)", borderRadius: 12, overflowX: "auto" }}>
                <HalftoneRamp row />
              </div>
            </div>

            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>
                B) Reacts to Typing Input (smooth peak shift, no popping)
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ padding: "12px 16px", background: "var(--panel)", borderRadius: 12, overflowX: "auto" }}>
                  <HalftoneRamp input={typingInput} reducedMotion={rampReducedMotion} />
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={typingInput}
                    onChange={(e) => setTypingInput(e.target.value)}
                    placeholder="Type to shift peak smoothly…"
                    style={{
                      flex: "1 1 240px",
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--stroke)",
                      background: "var(--card)",
                      color: "var(--ink)",
                      font: "inherit",
                    }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                    <Toggle checked={rampReducedMotion} onCheckedChange={setRampReducedMotion} label="Reduce motion for ramp" />
                    <span className="mono">Reduced Motion (locks peak at center)</span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>
                C) Direct Peak Slider: peak = {manualPeak.toFixed(2)}
              </span>
              <div style={{ padding: "12px 16px", background: "var(--panel)", borderRadius: 12, overflowX: "auto", marginBottom: 8 }}>
                <HalftoneRamp peak={manualPeak} reducedMotion={rampReducedMotion} />
              </div>
              <Slider
                value={Math.round(manualPeak * 100)}
                min={5}
                max={95}
                step={1}
                onChange={(v) => setManualPeak(v / 100)}
                label="Halftone peak slider"
                disabled={rampReducedMotion}
              />
            </div>

            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 6, color: "var(--quiet)" }}>
                D) 2D Grid Mode (columns=8, rows=2)
              </span>
              <HalftoneRamp columns={8} rows={2} />
            </div>
          </div>
        </section>

        {/* 2. ConvergeBar and LinearDitherBar */}
        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <h2 style={{ font: "700 18px/1 var(--disp)", margin: 0 }}>2. ConvergeBar & LinearDitherBar</h2>
            <span className="mono" style={{ fontSize: 11, color: "var(--quiet)" }}>
              Clean 6px track & solid fill · 22px graded leading edge · Tabular numerals · ARIA progressbar
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>
                ConvergeBar ({Math.round(progress * 100)}%, state={barState})
              </span>
              <ConvergeBar
                progress={progress}
                state={barState}
                label="RESEARCHING"
                etaSeconds={barState === "running" ? 8 : null}
                reducedMotion={barsReducedMotion}
              />
            </div>

            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>
                LinearDitherBar ({Math.round(progress * 100)}%, state={barState})
              </span>
              <LinearDitherBar
                progress={progress}
                state={barState}
                stepLabel="STEP 2 OF 4"
                showPercent
                etaSeconds={barState === "running" ? 14 : null}
                reducedMotion={barsReducedMotion}
              />
            </div>

            {/* Interactive State & Motion Bar Controls */}
            <div style={{ borderTop: "1px solid var(--stroke)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <span className="mono" style={{ fontSize: 11, display: "block", marginBottom: 6, color: "var(--quiet)" }}>
                  Progress: {Math.round(progress * 100)}%
                </span>
                <Slider
                  value={Math.round(progress * 100)}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(v) => setProgress(v / 100)}
                  label="Progress bar slider"
                />
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--quiet)" }}>State:</span>
                  {(["running", "done", "error"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setBarState(s)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        border: "1px solid var(--stroke)",
                        background: barState === s ? "var(--ink)" : "var(--card)",
                        color: barState === s ? "var(--paper)" : "var(--ink)",
                        cursor: "pointer",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <Toggle checked={barsReducedMotion} onCheckedChange={setBarsReducedMotion} label="Reduce motion for progress bars" />
                  <span className="mono">Reduced Motion (snaps instantly)</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* 3. DitherEdge & HalftoneFade */}
        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 16 }}>3. DitherEdge & HalftoneFade</h2>
          <div className="lab-grid" style={{ gap: 20 }}>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>
                DitherEdge (direction="bottom", 3 graded bands: fine dots growing coarse inward)
              </span>
              <div style={{ position: "relative", height: 110, background: "var(--panel)", borderRadius: 14, overflow: "hidden" }}>
                <DitherEdge direction="bottom" opacity={0.85} />
              </div>
            </div>

            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>
                HalftoneFade (soft-masked radial dot layer, e.g. hand-off card)
              </span>
              <div style={{ position: "relative", height: 110, background: "var(--card)", border: "1px solid var(--stroke)", borderRadius: 14, overflow: "hidden", padding: 18 }}>
                <HalftoneFade direction="radial" opacity={0.7} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <b style={{ fontSize: 14 }}>Hand off a project</b>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--quiet)" }}>Background execution accent</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. RegistrationMarks & FocusBrackets */}
        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 16 }}>4. RegistrationMarks & FocusBrackets</h2>
          <div className="lab-grid" style={{ gap: 20 }}>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>
                RegistrationMarks (two 11 px crosses, 1 px stroke, --rule at .45)
              </span>
              <div style={{ position: "relative", height: 120, background: "var(--panel)", borderRadius: 14, display: "grid", placeItems: "center" }}>
                <RegistrationMarks size={11} strokeWidth={1} opacity={0.45} />
                <span className="mono" style={{ fontSize: 11, color: "var(--quiet)" }}>Diagonally placed crosses</span>
              </div>
            </div>

            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>
                FocusBrackets (12px legs, 1.5px stroke, .55 opacity, r=5.5px, 8px outside)
              </span>
              <div style={{ display: "flex", gap: 24, alignItems: "center", height: 120, justifyContent: "center" }}>
                <div style={{ position: "relative", padding: "10px 18px", background: "var(--panel)", borderRadius: 12 }}>
                  <FocusBrackets tone="ink" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Selected Item</span>
                </div>
                <div style={{ position: "relative", padding: "10px 18px", background: "var(--panel)", borderRadius: 12 }}>
                  <FocusBrackets tone="alert" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--r-alert)" }}>Failed Item</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Slider & Toggle */}
        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 16 }}>5. Themed Slider & Toggle</h2>
          <div className="lab-grid" style={{ gap: 24 }}>
            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>
                Themed Slider (28px thumb with ink border, keyboard accessible, no blue)
              </span>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 11 }}>Value</span>
                <span className="mono tnum" style={{ fontSize: 12, fontWeight: 700 }}>{sliderVal}%</span>
              </div>
              <Slider
                value={sliderVal}
                min={0}
                max={100}
                step={1}
                onChange={setSliderVal}
                label="Themed volume slider"
              />
            </div>

            <div>
              <span className="mono" style={{ fontSize: 12, display: "block", marginBottom: 8, color: "var(--quiet)" }}>
                Toggle & Chips
              </span>
              <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Toggle checked={toggleState} onCheckedChange={setToggleState} label="Example switch" />
                  <span className="mono" style={{ fontSize: 12 }}>{toggleState ? "ON" : "OFF"}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Chip active>Active</Chip>
                  <Chip>Inactive</Chip>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Tag>Default</Tag>
                  <Tag variant="alert">Alert</Tag>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Cards: Hairline top highlight */}
        <section className="card" style={{ padding: 24, borderRadius: 20 }}>
          <h2 style={{ font: "700 18px/1 var(--disp)", marginBottom: 12 }}>6. Cards: Hairline Top Highlight</h2>
          <p style={{ fontSize: 13, color: "var(--quiet)", margin: "0 0 16px" }}>
            The shared <code>.card</code> class carries a hairline top highlight:{" "}
            <code>inset 0 1px 0 rgba(255,255,255,.7)</code> in light mode, and <code>.04</code> in dark mode.
          </p>
          <div className="lab-grid lab-grid-sm" style={{ gap: 16 }}>
            <div className="card" style={{ padding: 18, borderRadius: 14 }}>
              <b style={{ display: "block", fontSize: 14, marginBottom: 4 }}>Standard Card</b>
              <span style={{ fontSize: 12, color: "var(--quiet)" }}>Inspect top border for hairline light</span>
            </div>
            <div className="card" style={{ padding: 18, borderRadius: 14, background: "var(--panel)" }}>
              <b style={{ display: "block", fontSize: 14, marginBottom: 4 }}>Panel Variation</b>
              <span style={{ fontSize: 12, color: "var(--quiet)" }}>Layered depth elevation</span>
            </div>
          </div>
        </section>

        {/* Sheet Trigger */}
        <section className="card" style={{ padding: 20, borderRadius: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <b style={{ fontSize: 14, display: "block" }}>Bottom Sheet Primitive</b>
            <span style={{ fontSize: 12, color: "var(--quiet)" }}>Responsive sheet with grab handle</span>
          </div>
          <button type="button" className="btn ink" onClick={() => setSheetOpen(true)}>
            Open Sheet
          </button>
        </section>

        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Art Lab Sheet">
          <p style={{ margin: "0 0 16px", color: "var(--quiet)" }}>
            Sheet modal overlay with grab handle, responsive desktop dialog centering, and touch dismissal.
          </p>
          <button type="button" className="btn ink" onClick={() => setSheetOpen(false)} style={{ width: "100%" }}>
            Close
          </button>
        </Sheet>
      </div>
    </LabLayout>
  );
}
