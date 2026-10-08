import * as React from "react";
import { cn } from "@/lib/utils";

export interface DitherEdgeProps {
  /** Direction in which dots grade / fade out (default "bottom"). */
  direction?: "top" | "bottom" | "left" | "right";
  /** Fine dot grid pitch in px (default 3.5). */
  fineGridSize?: number;
  /** Coarse dot grid pitch in px (default 7). */
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
  fineGridSize = 3.5,
  coarseGridSize = 7,
  color = "var(--r-ink)",
  opacity = 1,
  className,
  id,
  style,
}: DitherEdgeProps) {
  const gradientDir =
    direction === "bottom"
      ? "to bottom"
      : direction === "top"
      ? "to top"
      : direction === "right"
      ? "to right"
      : "to left";

  const fineMask = `linear-gradient(${gradientDir}, #000 0%, transparent 85%)`;
  const coarseMask = `linear-gradient(${gradientDir}, #000 15%, transparent 100%)`;

  const fineLayerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: `radial-gradient(circle at 50% 50%, ${color} 0.65px, transparent 0.8px)`,
    backgroundSize: `${fineGridSize}px ${fineGridSize}px`,
    maskImage: fineMask,
    WebkitMaskImage: fineMask,
    opacity: 0.85,
  };

  const coarseLayerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: `radial-gradient(circle at 50% 50%, ${color} 1.25px, transparent 1.4px)`,
    backgroundSize: `${coarseGridSize}px ${coarseGridSize}px`,
    maskImage: coarseMask,
    WebkitMaskImage: coarseMask,
    opacity: 0.7,
  };

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
        ...style,
      }}
      data-direction={direction}
      aria-hidden="true"
    >
      <div className="art-dither-edge-fine" style={fineLayerStyle} />
      <div className="art-dither-edge-coarse" style={coarseLayerStyle} />
    </div>
  );
}

export default DitherEdge;
