import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ChipProps {
  children: ReactNode;
  /** Active = ink fill with paper text; inactive = card fill with a 1px stroke. */
  active?: boolean;
  /** Renders a button when given; otherwise a static span. */
  onClick?: () => void;
  /** Mono 11px chip instead of the body-size one. */
  small?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Filter chip / selectable pill. */
export function Chip({ children, active = false, onClick, small = false, disabled, className }: ChipProps) {
  const cls = cn("art-chip", small && "art-chip-sm", className);
  if (onClick) {
    return (
      <button type="button" className={cls} data-active={active ? "true" : "false"} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    );
  }
  return (
    <span className={cls} data-active={active ? "true" : "false"}>
      {children}
    </span>
  );
}

export type StatusPillStatus = "running" | "idle" | "paused" | "live" | "away" | "failed";

const STATUS_TONE: Record<StatusPillStatus, "ink" | "panel" | "outline" | "alert"> = {
  running: "ink",
  live: "ink",
  idle: "panel",
  away: "panel",
  paused: "outline",
  failed: "alert",
};

/** Mono status pill: Running/Live = ink, Idle/Away = panel, Paused = outline, Failed = alert. */
export function StatusPill({ status, className }: { status: StatusPillStatus; className?: string }) {
  return (
    <span className={cn("art-status", className)} data-tone={STATUS_TONE[status]}>
      {status}
    </span>
  );
}

/** Alias kept for call sites that say "pill". */
export const Pill = Chip;

export default Chip;
