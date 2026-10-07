import * as React from "react";
import { cn } from "@/lib/utils";
import "./art.css";

export interface FocusBracketsProps {
  /** Corner stroke colour: ink for selected, alert for failed. */
  tone?: "ink" | "alert";
  className?: string;
}

/**
 * Four 2px corner brackets placed 9px outside the element (.brk i with inset: -9px).
 * The parent must have position: relative.
 */
export function FocusBrackets({ tone = "ink", className }: FocusBracketsProps) {
  return (
    <span className={cn("brk art-brackets", className)} data-tone={tone} aria-hidden="true">
      <i className="art-bracket art-bracket-tl" />
      <i className="art-bracket art-bracket-tr" />
      <i className="art-bracket art-bracket-br" />
      <i className="art-bracket art-bracket-bl" />
    </span>
  );
}

export default FocusBrackets;
