import * as React from "react";
import { cn } from "@/lib/utils";

export interface RegistrationMarksProps {
  /** Size of each cross in px (recipe: 11 px, default 11). */
  size?: number;
  /** Stroke thickness in px (recipe: 1 px, default 1). */
  strokeWidth?: number;
  /** Opacity (recipe: 0.45, default 0.45). */
  opacity?: number;
  /** Placement mode for the two crosses (default "diagonal-tl-br"). */
  placement?: "diagonal-tl-br" | "diagonal-tr-bl" | "all-four";
  /** Inset or offset from the edge in px (default 8). */
  offset?: number;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}

/** One single 11 px cross */
export function CrossMark({
  size = 11,
  strokeWidth = 1,
  className,
  style,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const half = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      className={cn("art-cross", className)}
      style={style}
      aria-hidden="true"
    >
      <line x1="0" y1={half} x2={size} y2={half} stroke="currentColor" strokeWidth={strokeWidth} />
      <line x1={half} y1="0" x2={half} y2={size} stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

/**
 * RegistrationMarks:
 * Two 11 px crosses, 1 px stroke, --rule at .45 opacity (per design specification).
 * Positioned diagonally across a container.
 */
export function RegistrationMarks({
  size = 11,
  strokeWidth = 1,
  opacity = 0.45,
  placement = "diagonal-tl-br",
  offset = 8,
  className,
  id,
  style,
}: RegistrationMarksProps) {
  const containerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    color: "var(--r-rule, var(--rule, #6B6964))",
    opacity,
    ...style,
  };

  const posStyle = (top?: boolean, left?: boolean): React.CSSProperties => ({
    position: "absolute",
    top: top ? `${offset}px` : undefined,
    bottom: !top ? `${offset}px` : undefined,
    left: left ? `${offset}px` : undefined,
    right: !left ? `${offset}px` : undefined,
  });

  return (
    <div id={id} className={cn("art-reg-marks", className)} style={containerStyle} aria-hidden="true">
      {(placement === "diagonal-tl-br" || placement === "all-four") && (
        <>
          <div style={posStyle(true, true)}>
            <CrossMark size={size} strokeWidth={strokeWidth} />
          </div>
          <div style={posStyle(false, false)}>
            <CrossMark size={size} strokeWidth={strokeWidth} />
          </div>
        </>
      )}
      {(placement === "diagonal-tr-bl" || placement === "all-four") && (
        <>
          <div style={posStyle(true, false)}>
            <CrossMark size={size} strokeWidth={strokeWidth} />
          </div>
          <div style={posStyle(false, true)}>
            <CrossMark size={size} strokeWidth={strokeWidth} />
          </div>
        </>
      )}
    </div>
  );
}

export default RegistrationMarks;
