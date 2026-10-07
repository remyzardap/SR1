import * as React from "react";
import { Link } from "wouter";
import { LabLayout } from "./LabLayout";

export default function LabIndex() {
  return (
    <LabLayout title="Design Lab">
      <p style={{ color: "var(--quiet)", marginBottom: 24, fontSize: 16 }}>
        Component and foundation verification lab for Sutaeru frontend redesign.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <Link
          href="/__lab/shell"
          className="card"
          style={{ padding: 24, textDecoration: "none", color: "inherit", borderRadius: 20, display: "block" }}
        >
          <b style={{ font: "700 18px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Shell</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 14 }}>
            AppHeader in Chat, Agent, and Title modes with navigation logo trigger and sliding segmented switch.
          </p>
        </Link>
        <Link
          href="/__lab/brand"
          className="card"
          style={{ padding: 24, textDecoration: "none", color: "inherit", borderRadius: 20, display: "block" }}
        >
          <b style={{ font: "700 18px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Brand</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 14 }}>
            SutaeruGlyph (compact & full), SutaeruSeal, SutaeruStamp, and BrandIntro animation reveal.
          </p>
        </Link>
        <Link
          href="/__lab/art"
          className="card"
          style={{ padding: 24, textDecoration: "none", color: "inherit", borderRadius: 20, display: "block" }}
        >
          <b style={{ font: "700 18px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Art Primitives</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 14 }}>
            HalftoneRamp, ConvergeBar, LinearDitherBar, SteppedMeter, Toggle, Chip, FocusBrackets, Sheet.
          </p>
        </Link>
        <Link
          href="/__lab/agent"
          className="card"
          style={{ padding: 24, textDecoration: "none", color: "inherit", borderRadius: 20, display: "block" }}
        >
          <b style={{ font: "700 18px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Agent — task builder</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 14 }}>
            Every output card, the plan redrawing, validation, insufficient credits and the submitting draft.
          </p>
        </Link>
      </div>
    </LabLayout>
  );
}
