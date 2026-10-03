import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { clampProgress, etaLabel } from "./useMotion";

export interface LinearDitherBarProps {
  /** 0..1 completion; the single ink pill grows left to right. Never right to left on mobile. */
  progress: number;
  /** Seconds remaining; renders `ABOUT N S LEFT`. Omit to hide the eta. */
  etaSeconds?: number | null;
  /** Mono step readout on the left, e.g. `STEP 2 OF 4`. */
  stepLabel?: string;
  /** Shows the big percent instead of the step label. */
  showPercent?: boolean;
  state?: "running" | "done" | "error";
  ariaLabel?: string;
  className?: string;
}

/** List/card progress: one ink pill from the left with a gradient trail and dither head. */
export function LinearDitherBar({
  progress,
  etaSeconds,
  stepLabel,
  showPercent = false,
  state = "running",
  ariaLabel,
  className,
}: LinearDitherBarProps) {
  const p = state === "done" ? 1 : clampProgress(progress);
  const pct = Math.round(p * 100);
  const style = { "--pw": `${p * 100}%` } as CSSProperties;
  const eta = state === "done" ? null : etaLabel(etaSeconds);
  const left = stepLabel ?? (showPercent ? `${pct}%` : null);

  return (
    <div className={cn("art-ditherbar", state !== "running" && `is-${state}`, className)} style={style}>
      <div
        className="art-ditherbar-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? stepLabel}
      >
        <span className="art-dotrow" aria-hidden="true" />
        <span className="art-ditherbar-pill" aria-hidden="true" />
        <span className="art-ditherbar-trail" aria-hidden="true" />
        <span className="art-ditherbar-head" aria-hidden="true">
          <b /><b /><b /><b /><b />
        </span>
      </div>
      {left || eta ? (
        <div className="art-ditherbar-meta">
          {left && showPercent ? <span className="art-pct">{left}</span> : <span className="art-mono">{left}</span>}
          {eta ? <span className="art-mono">{eta}</span> : <span />}
        </div>
      ) : null}
    </div>
  );
}

export default LinearDitherBar;
