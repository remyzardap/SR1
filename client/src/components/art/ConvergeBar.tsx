import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { clampProgress, etaLabel } from "./useMotion";

export interface ConvergeBarProps {
  /** 0..1 completion. Each pill grows to p/2 of the track width. */
  progress: number;
  /** Seconds remaining; renders `ABOUT N S LEFT`. Omit to hide the eta. */
  etaSeconds?: number | null;
  /** Running by default; done shows the met-in-the-middle notch, error the alert break. */
  state?: "running" | "done" | "error";
  /** Mono status word above the bar (e.g. QUEUED, DRAWING, SAVING, STOPPED). */
  label?: string;
  /** Overrides the right-side readout (e.g. `TOOK 12 S`). */
  etaOverride?: string;
  /** Hides the big percent readout when false. */
  showPercent?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** Primary progress bar: two ink pills converge from both edges toward the middle. */
export function ConvergeBar({
  progress,
  etaSeconds,
  state = "running",
  label,
  etaOverride,
  showPercent = true,
  ariaLabel,
  className,
}: ConvergeBarProps) {
  const p = state === "done" ? 1 : clampProgress(progress);
  const pct = Math.round(p * 100);
  const style = { "--pw": `${p * 100}%` } as CSSProperties;
  const right = etaOverride ?? (state === "error" ? "STOPPED" : state === "done" ? null : etaLabel(etaSeconds));

  return (
    <div className={cn("art-converge", `is-${state}`, className)} style={style}>
      {label ? <div className="art-mono art-converge-label">{label}</div> : null}
      <div
        className="art-converge-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label}
      >
        <span className="art-dotrow" aria-hidden="true" />
        <span className="art-pill art-pill-l" aria-hidden="true" />
        <span className="art-pill art-pill-r" aria-hidden="true" />
        <span className="art-trail art-trail-l" aria-hidden="true" />
        <span className="art-trail art-trail-r" aria-hidden="true" />
        <span className="art-dither art-dither-l" aria-hidden="true">
          <b /><b /><b /><b /><b />
        </span>
        <span className="art-dither art-dither-r" aria-hidden="true">
          <b /><b /><b /><b /><b />
        </span>
        {state === "done" || state === "error" ? (
          <span className={cn("art-junction", state === "error" && "is-error")} aria-hidden="true" />
        ) : null}
      </div>
      {(showPercent || right) && (
        <div className="art-readout">
          {showPercent ? <span className="art-pct">{pct}%</span> : <span />}
          {right ? <span className="art-meta art-mono">{right}</span> : <span />}
        </div>
      )}
    </div>
  );
}

export default ConvergeBar;
