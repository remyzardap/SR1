import * as React from "react";
import { Link } from "wouter";
import { LabLayout } from "./LabLayout";

export default function LabIndex() {
  const sections = [
    { href: "/__lab/shell", title: "Shell", desc: "AppHeader in Chat, Agent, and Title modes with navigation logo trigger and sliding segmented switch." },
    { href: "/__lab/brand", title: "Brand", desc: "SutaeruGlyph (compact & full), SutaeruSeal, SutaeruStamp, and BrandIntro animation reveal." },
    { href: "/__lab/art", title: "Art Primitives", desc: "HalftoneRamp, ConvergeBar, LinearDitherBar, SteppedMeter, Toggle, Chip, FocusBrackets, Sheet." },
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="card"
            style={{ padding: 24, textDecoration: "none", color: "inherit", borderRadius: 20, display: "block" }}
          >
            <b style={{ font: "700 18px/1.2 var(--disp)", display: "block", marginBottom: 6 }}>{section.title}</b>
            <p style={{ margin: 0, color: "var(--quiet)", fontSize: 14 }}>{section.desc}</p>
          </Link>
        ))}
      </div>
    </LabLayout>
  );
}