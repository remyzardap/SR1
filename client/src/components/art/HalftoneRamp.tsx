import * as React from "react";
import { cn } from "@/lib/utils";
import { clampProgress, useReducedMotion } from "./useMotion";

/** 27-dot count specified for refined art primitives (F0b / T-112). */
export const HALFTONE_RAMP_DOT_COUNT = 27;

/**
 * Computes dot diameter and opacity according to the spec:
 * size = 1.6 + 11.4 * sin(pi*i/26)^1.7 px
 * opacity = 0.10 + 0.78 * sin(pi*i/26)^1.1
 * Ends fade to almost nothing (size 1.6px, opacity 0.10).
 * Peak shifts smoothly when peak in [0, 1] changes without popping.
 */
export function computeRampDot(i: number, total = HALFTONE_RAMP_DOT_COUNT, peak = 0.5) {
  const count = Math.max(2, total);
  const clampedPeak = Math.max(0.01, Math.min(0.99, peak));
  const t = i / (count - 1);

  // Smooth piece-wise mapping that pins t=0 -> 0, t=clampedPeak -> 0.5, t=1 -> 1
  let phase: number;
  if (t <= clampedPeak) {
    phase = (t / clampedPeak) * 0.5;
  } else {
    phase = 0.5 + ((t - clampedPeak) / (1 - clampedPeak)) * 0.5;
  }

  const s = Math.sin(Math.PI * phase);
  const sinVal = Math.max(0, s);
  const size = 1.6 + 11.4 * Math.pow(sinVal, 1.7);
  const opacity = 0.10 + 0.78 * Math.pow(sinVal, 1.1);

  return { size, opacity, phase, sinVal };
}

/** Pre-computed 27-dot diameters in px for backward-compatibility. */
export const PROTOTYPE_RAMP = Array.from({ length: HALFTONE_RAMP_DOT_COUNT }, (_, i) =>
  Number(computeRampDot(i, HALFTONE_RAMP_DOT_COUNT, 0.5).size.toFixed(2))
) as readonly number[];

export interface HalftoneRampProps {
  /** Number of dot columns across the block. Omit for 1D horizontal row mode. */
  columns?: number;
  /** Number of dot rows; the block height is rows * cell. Omit for 1D horizontal row mode. */
  rows?: number;
  /** Force 1D horizontal 27-dot row mode. */
  row?: boolean;
  /** Normalized peak position (0..1, default 0.5 centered at dot 13). */
  peak?: number;
  /** Text or numerical input that shifts the peak smoothly. */
  input?: string | number;
  /** Force reduced motion state (default auto-detected). */
  reducedMotion?: boolean;
  /** Grid pitch in px for 2D mode (design spec: 12). */
  cell?: number;
  /** Radius at the thin end and the thick end of the ramp (px) for 2D mode. */
  minRadius?: number;
  maxRadius?: number;
  /**
   * 0..1 clear amount for the pending-image panel: dots disappear from the left
   * edge toward the right as progress grows. Omit for a static corner accent.
   */
  progress?: number;
  /** Stretch to the container width (viewBox scales uniformly, may crop). */
  fluid?: boolean;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}

/**
 * HalftoneRamp:
 * - 1D row mode: 27 dots with refined sin^1.7 size and sin^1.1 opacity curve, gap 6px.
 *   Smoothly shifts peak in response to input; static under reduced motion.
 * - 2D matrix mode: columns and rows of dots for corner accents/pending panels.
 */
export function HalftoneRamp({
  columns,
  rows,
  row = false,
  peak,
  input,
  reducedMotion,
  cell = 12,
  minRadius = 0.8,
  maxRadius = 3.6,
  progress,
  fluid = false,
  className,
  id,
  style,
}: HalftoneRampProps) {
  const systemReduced = useReducedMotion();
  const isReduced = reducedMotion ?? systemReduced;

  // 1D row mode
  if (row || columns === undefined || rows === undefined) {
    // Under reduced motion, keep peak centered statically
    let effectivePeak = 0.5;

    if (!isReduced) {
      if (typeof peak === "number" && !Number.isNaN(peak)) {
        effectivePeak = Math.max(0.05, Math.min(0.95, peak));
      } else if (typeof input === "number" && !Number.isNaN(input)) {
        effectivePeak = Math.max(0.05, Math.min(0.95, input));
      } else if (typeof input === "string" && input.length > 0) {
        // Continuous smooth oscillation as user types
        effectivePeak = 0.5 + 0.35 * Math.sin(input.length * 0.42);
      }
    }

    const dots = Array.from({ length: HALFTONE_RAMP_DOT_COUNT }, (_, i) =>
      computeRampDot(i, HALFTONE_RAMP_DOT_COUNT, effectivePeak)
    );

    return (
      <div
        className={cn("ramp art-deco", className)}
        id={id}
        style={{ gap: 6, ...style }}
        aria-hidden="true"
        data-reduced-motion={isReduced ? "true" : undefined}
      >
        {dots.map((d, i) => (
          <i
            key={i}
            style={
              {
                width: `${d.size}px`,
                height: `${d.size}px`,
                opacity: d.opacity,
                "--d": `${d.size}px`,
                "--o": d.opacity,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    );
  }

  // 2D grid mode
  const width = columns * cell;
  const height = rows * cell + cell / 2;
  const clear = progress === undefined ? null : clampProgress(progress);
  const dots: React.ReactNode[] = [];

  for (let c = 0; c < columns; c++) {
    const t = columns > 1 ? c / (columns - 1) : 1;
    const r = minRadius + (maxRadius - minRadius) * t;
    let opacity = 1;
    if (clear !== null) {
      const threshold = clear * columns;
      opacity = Math.min(1, Math.max(0, (c - threshold + 1) / 1.5));
      if (opacity <= 0) continue;
    }
    // Odd columns sit half a row lower than even ones.
    const yShift = c % 2 === 1 ? cell / 2 : 0;
    for (let rIdx = 0; rIdx < rows; rIdx++) {
      dots.push(
        <circle
          key={`${c}-${rIdx}`}
          cx={c * cell + cell / 2}
          cy={rIdx * cell + cell / 2 + yShift}
          r={r}
          fill="currentColor"
          opacity={opacity}
        />
      );
    }
  }

  return (
    <svg
      className={cn("art-halftone", className)}
      id={id}
      style={style}
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "xMidYMid slice" : "xMidYMid meet"}
      aria-hidden="true"
    >
      {dots}
    </svg>
  );
}

export default HalftoneRamp;
