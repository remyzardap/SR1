import * as React from "react";
import { Link } from "wouter";
import { LabLayout } from "./LabLayout";

export default function LabIndex() {
  const sections = [
    { href: "/__lab/landing", title: "Landing", desc: "Public landing page with hero, features, and CTA band." },
    { href: "/__lab/login", title: "Login", desc: "Sign In, Sign Up, 2FA code step, and error states." },
    { href: "/__lab/verify-email", title: "Verify Email", desc: "Pending, success, and error states." },
    { href: "/__lab/reset-password", title: "Reset Password", desc: "Form, error, no-token, success, and loading states." },
    { href: "/__lab/onboarding", title: "Onboarding", desc: "Welcome, Identity, Skills, Connect AI, and Done steps." },
    { href: "/__lab/first-run", title: "First Run", desc: "First-run greeting card shown once per browser." },
    { href: "/__lab/offline", title: "Offline", desc: "Offline banner with halftone ramp." },
    { href: "/__lab/install", title: "Install", desc: "Install card and iOS Add to Home Screen guide." },
    { href: "/__lab/splash", title: "Splash", desc: "Brand intro animation (loop draws, gate settles, sun rises, seal presses)." },
  ];

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
      </div>

      <h2 style={{ font: "700 16px/1 var(--disp)", margin: "32px 0 14px", color: "var(--quiet)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Public and auth screens
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="card"
            style={{ padding: 18, textDecoration: "none", color: "inherit", borderRadius: 14, display: "block" }}
          >
            <b style={{ font: "700 15px/1.2 var(--disp)", display: "block", marginBottom: 4 }}>{section.title}</b>
            <p style={{ margin: 0, color: "var(--quiet)", fontSize: 12 }}>{section.desc}</p>
          </Link>
        ))}
      </div>
    </LabLayout>
  );
}