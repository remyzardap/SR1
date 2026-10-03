import { cn } from "@/lib/utils";
import "./art.css";

export interface FocusBracketsProps {
  /** Corner stroke colour: ink for selected, alert for failed. */
  tone?: "ink" | "alert";
  className?: string;
}

const CORNER_PATH = "M2 10V2H10";

/** Four 9px corner strokes, placed 6px outside a card, marking the active item.
 *  The parent must be position:relative. */
export function FocusBrackets({ tone = "ink", className }: FocusBracketsProps) {
  return (
    <span className={cn("art-brackets", className)} data-tone={tone} aria-hidden="true">
      {(["tl", "tr", "br", "bl"] as const).map((pos) => (
        <span key={pos} className={`art-bracket art-bracket-${pos}`}>
          <svg viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d={CORNER_PATH} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
          </svg>
        </span>
      ))}
    </span>
  );
}

export default FocusBrackets;
