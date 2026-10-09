import * as React from "react";
import type { ReactNode } from "react";

import { SutaeruIcon } from "@/components/SutaeruIcon";
import { cn } from "@/lib/utils";

export interface GoBarProps {
  /** One bold line: what will happen. */
  summary: ReactNode;
  /** One mono line under it: the picks, time or cost. */
  detail?: ReactNode;
  /** The one primary button. */
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  /** Arrow after the label (default) or nothing. */
  icon?: "arrow" | "none";
  className?: string;
}

/**
 * The only docked bottom element: a pill card with the summary and one primary button.
 * It sticks to the bottom of the page column, clears the home indicator and fades into the page above.
 */
export function GoBar({ summary, detail, actionLabel, onAction, disabled, icon = "arrow", className }: GoBarProps) {
  return (
    <div className={cn("gobar", className)}>
      <div className="gobar-in">
        <span className="sum" aria-live="polite">
          <b>{summary}</b>
          {detail ? <span className="mono">{detail}</span> : null}
        </span>
        <button type="button" className="btn ink big" disabled={disabled} onClick={onAction}>
          {actionLabel}
          {icon === "arrow" && <SutaeruIcon name="arrow" signal={false} className="ico" />}
        </button>
      </div>
    </div>
  );
}
