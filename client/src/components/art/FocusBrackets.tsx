import * as React from "react";
import { cn } from "@/lib/utils";
import "./art.css";

export interface FocusBracketsProps {
  /** Corner stroke colour: ink for selected, alert for failed. */
  tone?: "ink" | "alert";
  /** Leg length in px (recipe: 10 to 13 px, default 12 px). */
  legLength?: number;
  /** Stroke width in px (recipe: 1.5 px, default 1.5 px). */
  strokeWidth?: number;
  /** Outer corner radius in px (recipe: 5 to 6 px, default 5.5 px). */
  radius?: number;
  /** Distance placed outside target element in px (recipe: 6 to 9 px, default 8 px). */
  offset?: number;
  /** Opacity (recipe: 0.55, default 0.55). */
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * FocusBrackets:
 * Four corner strokes marking a selected card or target matching design recipe:
 * - 10 to 13 px legs (12 px)
 * - 1.5 px stroke width
 * - 0.55 opacity
 * - outer-corner radius 5 to 6 (5.5 px)
 * - 6 to 9 px outside (-8 px inset)
 * - aria-hidden
 */
export function FocusBrackets({
  tone = "ink",
  legLength = 12,
  strokeWidth = 1.5,
  radius = 5.5,
  offset = 8,
  opacity = 0.55,
  className,
  style,
}: FocusBracketsProps) {
  const halfStroke = strokeWidth / 2;
  const innerR = Math.max(0.5, radius - halfStroke);
  // Top-left corner path: down vertical leg to arc, arc to horizontal leg
  const cornerPath = `M ${halfStroke} ${legLength} L ${halfStroke} ${radius} A ${innerR} ${innerR} 0 0 1 ${radius} ${halfStroke} L ${legLength} ${halfStroke}`;

  const svgStyle: React.CSSProperties = {
    display: "block",
    width: `${legLength}px`,
    height: `${legLength}px`,
  };

  const wrapStyle: React.CSSProperties = {
    inset: `-${offset}px`,
    opacity,
    ...style,
  };

  return (
    <span
      className={cn("art-brackets", className)}
      data-tone={tone}
      style={wrapStyle}
      aria-hidden="true"
    >
      <i className="art-bracket art-bracket-tl">
        <svg viewBox={`0 0 ${legLength} ${legLength}`} style={svgStyle} fill="none">
          <path
            d={cornerPath}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </i>
      <i className="art-bracket art-bracket-tr">
        <svg viewBox={`0 0 ${legLength} ${legLength}`} style={svgStyle} fill="none">
          <path
            d={cornerPath}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </i>
      <i className="art-bracket art-bracket-br">
        <svg viewBox={`0 0 ${legLength} ${legLength}`} style={svgStyle} fill="none">
          <path
            d={cornerPath}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </i>
      <i className="art-bracket art-bracket-bl">
        <svg viewBox={`0 0 ${legLength} ${legLength}`} style={svgStyle} fill="none">
          <path
            d={cornerPath}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </i>
    </span>
  );
}

export default FocusBrackets;
