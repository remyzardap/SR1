import * as React from "react";
import { cn } from "@/lib/utils";
import { clampProgress } from "./useMotion";

export interface SteppedMeterProps {
  /** 0..1 of the segments that are filled. */
  value: number;
  /** Segment count (design spec: 5, 10 or 20). */
  segments?: number;
  /** row: 9x8 blocks for horizontal meters; col: 10x22 bars for stat cards. */
  variant?: "row" | "col";
  ariaLabel?: string;
  className?: string;
}

/** Storage, admin stats and monitor activity: rounded segments filled up to the value. */
export function SteppedMeter({ value, segments = 10, variant = "row", ariaLabel, className }: SteppedMeterProps) {
  const filled = Math.round(clampProgress(value) * segments);
  return (
    <div
      className={cn("art-meter", variant === "row" ? "art-meter-row" : "art-meter-col", className)}
      role="img"
      aria-label={ariaLabel}
      aria-valuetext={`${filled} of ${segments}`}
    >
      {Array.from({ length: segments }, (_, i) => (
        <i key={i} className={cn(i < filled ? "is-filled on" : "off")} />
      ))}
    </div>
  );
}

export default SteppedMeter;
