import * as React from "react";
import { SutaeruGlyph, SutaeruSeal } from "@/components/brand";
import { useState, useEffect, type ReactNode } from "react";

export interface BrandIntroProps {
  className?: string;
  forceIntro?: boolean;
  onComplete?: () => void;
  children?: ReactNode;
}

export function BrandIntro({ className, forceIntro, onComplete, children }: BrandIntroProps) {
  const [phase, setPhase] = useState<"intro" | "settled">(forceIntro ? "intro" : "settled");
  const [introStep, setIntroStep] = useState(0);

  useEffect(() => {
    if (forceIntro) {
      setPhase("intro");
      setIntroStep(0);
      const steps = [
        () => setIntroStep(1), // loop draws
        () => setIntroStep(2), // gate settles
        () => setIntroStep(3), // sun rises
        () => setIntroStep(4), // seal presses
        () => { setPhase("settled"); onComplete?.(); },
      ];
      let current = 0;
      const timer = setInterval(() => {
        if (current < steps.length) {
          steps[current]();
          current++;
        } else {
          clearInterval(timer);
        }
      }, 800);
      return () => clearInterval(timer);
    }
  }, [forceIntro, onComplete]);

  const isIntro = phase === "intro";
  const loopClass = isIntro && introStep >= 1 ? "drawn" : "";
  const gateClass = isIntro && introStep >= 2 ? "settled" : "";
  const sunClass = isIntro && introStep >= 3 ? "risen" : "";
  const sealClass = isIntro && introStep >= 4 ? "pressed" : "";

  return (
    <div className={`home-hero lockup ${isIntro ? "intro" : "no-intro"} ${className || ""}`}>
      {children ?? (
        <>
          <SutaeruGlyph detail="full" size={144} className={`mark glyph ${loopClass} ${gateClass} ${sunClass}`} />
          <div className="word-row">
            <h1 className={`word ${sealClass}`}>Sutaeru</h1>
            <SutaeruSeal className={`seal hero-seal ${sealClass}`} />
          </div>
          <p className="mono tagline">Ask once. We do the rest.</p>
        </>
      )}
    </div>
  );
}

export default BrandIntro;