import * as React from "react";
import { cn } from "@/lib/utils";

export interface DitherEdgeProps {
  /** Direction in which dots grade / fade out (default "bottom"). */
  direction?: "top" | "bottom" | "left" | "right";
  /** Fine dot grid pitch in px (default 4). */
  fineGridSize?: number;
  /** Coarse dot grid pitch in px (default 8). */
  coarseGridSize?: number;
  /** Color token or CSS color (default "var(--r-ink)"). */
  color?: string;
  /** Overall opacity (default 1). */
  opacity?: number;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}

/**
 * DitherEdge:
 * Stacked radial-dot layers with graded masks for organic edge stippling.
 * Direction, fine/coarse grid sizes, color token, and opacity are customizable.
 */
export function DitherEdge({
  direction = "bottom",
  fineGridSize = 4,
  coarseGridSize = 8,
  color = "var(--r-ink)",
  opacity = 1,
  className,
  id,
  style,
}: DitherEdgeProps) {
  const gradientDir = `to ${direction}`;
  // One shared lattice: every layer sits on the coarse pitch, or on a half pitch
  // whose points coincide with it, so layers never beat against each other.
  const coarse = Math.max(6, Math.round(coarseGridSize / 2) * 2);
  const half = coarse / 2;
  const fine = Math.min(half, Math.max(3, Math.round(fineGridSize)));
  const lattice = fine === half ? half : coarse;
  const mid = coarse;

  const dots = (grid: number, dia: number) => {
    const r = dia / 2;
    return `radial-gradient(circle at 50% 50%, ${color} ${r}px, transparent ${r + 0.7}px)`;
  };
  const band = (a: number, b: number, c: number, d: number) =>
    `linear-gradient(${gradientDir}, transparent ${a}%, #000 ${b}%, #000 ${c}%, transparent ${d}%)`;

  const layer = (grid: number, dia: number, mask: string, alpha: number): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    backgroundImage: dots(grid, dia),
    backgroundSize: `${grid}px ${grid}px`,
    maskImage: mask,
    WebkitMaskImage: mask,
    opacity: alpha,
  });

  // Soft side fade so no rectangular boundary shows along the edge.
  const sideDir = direction === "top" || direction === "bottom" ? "to right" : "to bottom";
  const sideMask = `linear-gradient(${sideDir}, transparent, #000 12%, #000 88%, transparent)`;

  return (
    <div
      id={id}
      className={cn("art-dither-edge", className)}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
        opacity,
        maskImage: sideMask,
        WebkitMaskImage: sideMask,
        ...style,
      }}
      data-direction={direction}
      aria-hidden="true"
    >
      {/* origin: faint texture, then coarse dots shrinking through mid to a fine mist */}
      <div className="art-dither-edge-base" style={layer(mid, mid * 0.16, band(0, 0, 22, 50), 0.3)} />
      <div className="art-dither-edge-coarse" style={layer(coarse, coarse * 0.36, band(-10, 0, 14, 48), 0.6)} />
      <div className="art-dither-edge-mid" style={layer(coarse, coarse * 0.2, band(15, 38, 46, 74), 0.55)} />
      <div className="art-dither-edge-fine" style={layer(lattice, lattice * 0.3, band(40, 62, 66, 100), 0.45)} />
    </div>
  );
}

export default DitherEdge;
