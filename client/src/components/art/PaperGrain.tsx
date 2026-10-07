import * as React from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  currentMode,
  onAppearanceChange,
  readBackgroundArt,
} from "@/lib/theme";

export const ART_INTENSITY_STORAGE_KEY = "sutaeru.intensity";

/** Read the current art intensity percentage (20..100, default 70). */
export function readArtIntensity(): number {
  if (typeof window === "undefined") return 70;
  try {
    const saved = localStorage.getItem(ART_INTENSITY_STORAGE_KEY);
    if (saved != null) {
      const parsed = parseInt(saved, 10);
      if (!Number.isNaN(parsed)) return Math.max(0, Math.min(100, parsed));
    }
  } catch {
    // storage unavailable
  }
  return 70;
}

/** Save art intensity and notify listeners. */
export function setArtIntensity(val: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ART_INTENSITY_STORAGE_KEY, String(Math.round(val)));
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new Event("sutaeru:appearance"));
}

export interface PaperGrainProps {
  /** Override art intensity percentage (0..100). Defaults to the saved setting. */
  intensity?: number;
  /** Explicit override for the background art toggle. Defaults to the saved setting. */
  enabled?: boolean;
  /** Whether the grain is pinned to the entire viewport (default true). */
  fixed?: boolean;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}

/**
 * PaperGrain:
 * The feTurbulence washi noise overlay from the design spec.
 * Honours the "Background art" setting (off hides the grain entirely)
 * and scales opacity according to "Art intensity" (default 70%).
 */
export function PaperGrain({
  intensity,
  enabled,
  fixed = true,
  className,
  id,
  style,
}: PaperGrainProps) {
  const [bgArtActive, setBgArtActive] = useState(() => readBackgroundArt());
  const [currentIntensity, setCurrentIntensity] = useState(() => readArtIntensity());
  const [mode, setMode] = useState<"light" | "dark">(() => currentMode());

  useEffect(() => {
    return onAppearanceChange(() => {
      setBgArtActive(readBackgroundArt());
      setCurrentIntensity(readArtIntensity());
      setMode(currentMode());
    });
  }, []);

  const isEnabled = enabled ?? bgArtActive;
  if (!isEnabled) {
    return null;
  }

  const effectiveIntensity = intensity ?? currentIntensity;
  // Base opacity: 0.045 in light mode, 0.030 in dark mode
  const baseOpacity = mode === "dark" ? 0.03 : 0.045;
  const computedOpacity = Number((baseOpacity * (effectiveIntensity / 100)).toFixed(4));

  const grainDataUri =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .48 0 0 0 0 .45 0 0 0 1.1 -.1'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

  const grainStyle: React.CSSProperties = {
    position: fixed ? "fixed" : "absolute",
    inset: 0,
    zIndex: fixed ? 90 : 0,
    pointerEvents: "none",
    opacity: computedOpacity,
    backgroundImage: `url("${grainDataUri}")`,
    mixBlendMode: "multiply",
    ...style,
  };

  return (
    <div
      id={id}
      className={cn("art-paper-grain", className)}
      style={grainStyle}
      aria-hidden="true"
      data-intensity={effectiveIntensity}
    />
  );
}

export default PaperGrain;
