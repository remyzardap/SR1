import * as React from "react";
import { useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SutaeruGlyph } from "./SutaeruGlyph";
import { SutaeruSeal } from "./SutaeruSeal";

export const INTRO_STORAGE_KEY = "sutaeru.intro-seen";

export function shouldPlayIntro(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      return false;
    }
    if (typeof document !== "undefined" && document.documentElement.getAttribute("data-reduce-motion") === "true") {
      return false;
    }
    const seen = window.localStorage?.getItem(INTRO_STORAGE_KEY);
    return !seen;
  } catch {
    // Private browsing or restricted access
    return false;
  }
}

export function markIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(INTRO_STORAGE_KEY, "1");
  } catch {
    // Safari private browsing mode or quota exceeded
  }
}

export function resetIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(INTRO_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export interface BrandIntroProps {
  className?: string;
  forceIntro?: boolean;
  children?: ReactNode;
}

/**
 * BrandIntro plays the brand reveal sequence on first visit:
 * the loop draws, the torii gate settles, the sun rises, and the rakkan seal presses.
 * Subsequent visits or users preferring reduced motion skip directly to the settled lockup.
 */
export function BrandIntro({ className, forceIntro, children }: BrandIntroProps) {
  const [isIntro, setIsIntro] = useState<boolean>(() => {
    if (forceIntro !== undefined) return forceIntro;
    return shouldPlayIntro();
  });

  useEffect(() => {
    if (forceIntro !== undefined) {
      setIsIntro(forceIntro);
      return;
    }
    const play = shouldPlayIntro();
    setIsIntro(play);
    if (play) {
      markIntroSeen();
    }
  }, [forceIntro]);

  return (
    <div className={cn("home-hero lockup", isIntro ? "intro" : "no-intro", className)}>
      {children ?? (
        <>
          <SutaeruGlyph className="mark glyph" detail="full" />
          <div className="word-row">
            <h1 className="word">Sutaeru</h1>
            <SutaeruSeal className="seal hero-seal" />
          </div>
          <p className="mono tagline">Ask once. We do the rest.</p>
        </>
      )}
    </div>
  );
}

export default BrandIntro;
