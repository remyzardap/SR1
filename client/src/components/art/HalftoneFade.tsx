import * as React from "react";
import { cn } from "@/lib/utils";

export interface HalftoneFadeProps {
  /** Mask shape or direction: radial (soft oval fade) or linear direction (default "radial"). */
  direction?: "radial" | "top" | "bottom" | "left" | "right";
  /** Grid cell spacing in px (default 6). */
  gridSize?: number;
  /** Radius of each dot in px (default 1.2). */
  dotRadius?: number;
  /** Dot color (default "var(--r-ink)"). */
  color?: string;
  /** Overall opacity (default 0.65). */
  opacity?: number;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}

/**
 * HalftoneFade:
 * One soft-masked dot layer for subtle textured backgrounds (e.g. the hand-off card).
 */
export function HalftoneFade({
  direction = "radial",
  gridSize = 6,
  dotRadius = 1.2,
  color = "var(--r-ink)",
  opacity = 0.65,
  className,
  id,
  style,
}: HalftoneFadeProps) {
  let mask: string;
  if (direction === "radial") {
    mask = "radial-gradient(ellipse at 50% 50%, #000 0%, transparent 72%)";
  } else {
    const dir =
      direction === "bottom"
        ? "to bottom"
        : direction === "top"
        ? "to top"
        : direction === "right"
        ? "to right"
        : "to left";
    mask = `linear-gradient(${dir}, #000 0%, transparent 100%)`;
  }

  return (
    <div
      id={id}
      className={cn("art-halftone-fade", className)}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        opacity,
        ...style,
      }}
      data-direction={direction}
      aria-hidden="true"
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(circle at 50% 50%, ${color} ${dotRadius}px, transparent ${dotRadius + 0.15}px)`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
    </div>
  );
}

export default HalftoneFade;
