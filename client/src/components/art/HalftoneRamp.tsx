import * as React from "react";
import { cn } from "@/lib/utils";
import { clampProgress } from "./useMotion";

/** 16-dot prototype halftone ramp diameters in px */
export const PROTOTYPE_RAMP = [1.2, 1.8, 2.4, 3, 3.6, 4.2, 4.8, 5.4, 5.4, 4.8, 4.2, 3.6, 3, 2.4, 1.8, 1.2] as const;

export interface HalftoneRampProps {
  /** Number of dot columns across the block. Omit for 1D horizontal row mode. */
  columns?: number;
  /** Number of dot rows; the block height is rows * cell. Omit for 1D horizontal row mode. */
  rows?: number;
  /** Force 1D horizontal 16-dot row mode. */
  row?: boolean;
  /** Grid pitch in px (design spec: 12). */
  cell?: number;
  /** Radius at the thin end and the thick end of the ramp (px). */
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
 * - 1D row mode: 16-dot horizontal line reacting to energy/typing (per design prototype).
 * - 2D matrix mode: columns and rows of dots for corner accents/pending panels.
 */
export function HalftoneRamp({
  columns,
  rows,
  row = false,
  cell = 12,
  minRadius = 0.8,
  maxRadius = 3.6,
  progress,
  fluid = false,
  className,
  id,
  style,
}: HalftoneRampProps) {
  // If row mode or columns/rows not specified, render prototype 16-dot 1D row
  if (row || columns === undefined || rows === undefined) {
    return (
      <div
        className={cn("ramp art-deco", className)}
        id={id}
        style={style}
        aria-hidden="true"
      >
        {PROTOTYPE_RAMP.map((d, i) => (
          <i key={i} style={{ "--d": `${d}px` } as React.CSSProperties} />
        ))}
      </div>
    );
  }

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
