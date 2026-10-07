import * as React from "react";
import { useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BrandIntro as BrandIntroComponent, type BrandIntroProps } from "@/components/redo/BrandIntro";

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
    return false;
  }
}

export function markIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(INTRO_STORAGE_KEY, "1");
  } catch {
  }
}

export function resetIntroSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(INTRO_STORAGE_KEY);
  } catch {
  }
}

export function BrandIntroWrapper({ className, forceIntro, children }: BrandIntroProps) {
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
    <BrandIntroComponent
      className={cn("home-hero lockup", isIntro ? "intro" : "no-intro", className)}
      forceIntro={forceIntro}
    >
      {children}
    </BrandIntroComponent>
  );
}

export default BrandIntroWrapper;