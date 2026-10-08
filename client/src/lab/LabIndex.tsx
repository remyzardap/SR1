import * as React from "react";
import { Link } from "wouter";
import { LabLayout } from "./LabLayout";

export default function LabIndex() {
  return (
    <LabLayout title="Design Lab">
      <p style={{ color: "var(--quiet)", marginBottom: 24, fontSize: 16 }}>
        Component and foundation verification lab for Sutaeru frontend redesign.
      </p>

      <h2 style={{ font: "700 16px/1 var(--disp)", margin: "0 0 14px", color: "var(--quiet)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Foundations & Shell
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 32 }}>
        <Link
          href="/__lab/shell"
          className="card"
          style={{ padding: 22, textDecoration: "none", color: "inherit", borderRadius: 18, display: "block" }}
        >
          <b style={{ font: "700 17px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Shell</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 13 }}>
            AppHeader in Chat, Agent, and Title modes with navigation logo trigger and sliding segmented switch.
          </p>
        </Link>
        <Link
          href="/__lab/brand"
          className="card"
          style={{ padding: 22, textDecoration: "none", color: "inherit", borderRadius: 18, display: "block" }}
        >
          <b style={{ font: "700 17px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Brand</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 13 }}>
            SutaeruGlyph (compact & full), SutaeruSeal, SutaeruStamp, and BrandIntro animation reveal.
          </p>
        </Link>
        <Link
          href="/__lab/art"
          className="card"
          style={{ padding: 22, textDecoration: "none", color: "inherit", borderRadius: 18, display: "block" }}
        >
          <b style={{ font: "700 17px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Art Primitives Overview</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 13 }}>
            All art components: HalftoneRamp, ConvergeBar, LinearDitherBar, DitherEdge, PaperGrain, FocusBrackets, Slider.
          </p>
        </Link>
      </div>

      <h2 style={{ font: "700 16px/1 var(--disp)", margin: "0 0 14px", color: "var(--quiet)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Refined Art Primitives (F0b)
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <Link
          href="/__lab/art/dither-edge"
          className="card"
          style={{ padding: 18, textDecoration: "none", color: "inherit", borderRadius: 14, display: "block" }}
        >
          <b style={{ font: "700 15px/1.2 var(--disp)", display: "block", marginBottom: 4 }}>DitherEdge</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 12 }}>
            Stacked radial-dot layers with graded masks (directions, grids, tokens).
          </p>
        </Link>
        <Link
          href="/__lab/art/halftone-fade"
          className="card"
          style={{ padding: 18, textDecoration: "none", color: "inherit", borderRadius: 14, display: "block" }}
        >
          <b style={{ font: "700 15px/1.2 var(--disp)", display: "block", marginBottom: 4 }}>HalftoneFade</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 12 }}>
            Soft-masked single dot layer for card hand-off background accents.
          </p>
        </Link>
        <Link
          href="/__lab/art/paper-grain"
          className="card"
          style={{ padding: 18, textDecoration: "none", color: "inherit", borderRadius: 14, display: "block" }}
        >
          <b style={{ font: "700 15px/1.2 var(--disp)", display: "block", marginBottom: 4 }}>PaperGrain</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 12 }}>
            feTurbulence washi noise honoring Background art & Art intensity settings.
          </p>
        </Link>
        <Link
          href="/__lab/art/registration-marks"
          className="card"
          style={{ padding: 18, textDecoration: "none", color: "inherit", borderRadius: 14, display: "block" }}
        >
          <b style={{ font: "700 15px/1.2 var(--disp)", display: "block", marginBottom: 4 }}>RegistrationMarks</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 12 }}>
            Two 11 px crosses, 1 px stroke, --rule at .45 opacity.
          </p>
        </Link>
        <Link
          href="/__lab/art/slider"
          className="card"
          style={{ padding: 18, textDecoration: "none", color: "inherit", borderRadius: 14, display: "block" }}
        >
          <b style={{ font: "700 15px/1.2 var(--disp)", display: "block", marginBottom: 4 }}>Slider & Toggle</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 12 }}>
            Themed slider with track, fill, 28 px thumb with ink border, keyboard support.
          </p>
        </Link>
        <Link
          href="/__lab/settings"
          className="card"
          style={{ padding: 24, textDecoration: "none", color: "inherit", borderRadius: 20, display: "block" }}
        >
          <b style={{ font: "700 18px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Settings</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 14 }}>
            The ported settings screen in every state — each theme, art and motion off, slider extremes, empty and loading data. Pick a state with the links, or scroll through all of them.
          </p>
        </Link>
        <Link
          href="/__lab/files"
          className="card"
          style={{ padding: 18, textDecoration: "none", color: "inherit", borderRadius: 14, display: "block" }}
        >
          <b style={{ font: "700 15px/1.2 var(--disp)", display: "block", marginBottom: 4 }}>Files</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 12 }}>
            Files screen with storage meter, pill search, filters, miniature documents, live writing bar, and empty states.
          </p>
        </Link>
        <Link
          href="/__lab/session"
          className="card"
          style={{ padding: 24, textDecoration: "none", color: "inherit", borderRadius: 20, display: "block" }}
        >
          <b style={{ font: "700 18px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Agent Session</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 14 }}>
            Stippled progress dial, step flow with sources/pages, draft resolving from dither, stop/resume.
          </p>
        </Link>
        <Link
          href="/__lab/done"
          className="card"
          style={{ padding: 24, textDecoration: "none", color: "inherit", borderRadius: 20, display: "block" }}
        >
          <b style={{ font: "700 18px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Result Card</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 14 }}>
            Dark result card with dither edge, 済 stamp, key figures, actions, comparison table, wide doc preview.
          </p>
        </Link>
        <Link
          href="/__lab/agent"
          className="card"
          style={{ padding: 22, textDecoration: "none", color: "inherit", borderRadius: 18, display: "block" }}
        >
          <b style={{ font: "700 17px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>Agent — task builder</b>
          <p style={{ margin: 0, color: "var(--quiet)", fontSize: 13 }}>
            Every output card, the plan redrawing, validation, insufficient credits and the submitting draft.
          </p>
        </Link>
      </div>
    </LabLayout>
  );
}
