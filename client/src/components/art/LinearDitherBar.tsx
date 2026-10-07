import * as React from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { clampProgress, etaLabel, useReducedMotion } from "./useMotion";

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
  /** Render pure canvas element directly */
  asCanvas?: boolean;
  width?: number;
  height?: number;
  ariaLabel?: string;
  reducedMotion?: boolean;
  className?: string;
}

/** 22px graded leading edge dots SVG fading into the fill */
function LeadingEdgeSvg() {
  const dotColumns = [
    { x: 2, r: 1.3, o: 0.9 },
    { x: 5, r: 1.1, o: 0.75 },
    { x: 8, r: 0.95, o: 0.6 },
    { x: 11, r: 0.8, o: 0.45 },
    { x: 14, r: 0.65, o: 0.3 },
    { x: 17, r: 0.5, o: 0.18 },
    { x: 20, r: 0.35, o: 0.08 },
  ];

  return (
    <svg
      className="art-lead art-lead-l"
      viewBox="0 0 22 6"
      width="22"
      height="6"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {dotColumns.map((col, idx) => (
        <React.Fragment key={idx}>
          <circle cx={col.x} cy={1.6} r={col.r} fill="currentColor" opacity={col.o} />
          <circle cx={col.x + (idx % 2 === 0 ? 0.7 : -0.7)} cy={4.4} r={col.r * 0.9} fill="currentColor" opacity={col.o * 0.9} />
        </React.Fragment>
      ))}
    </svg>
  );
}

/** List/card progress: clean 4-6px rounded track, solid fill with 22px graded leading edge. */
export function LinearDitherBar({
  progress,
  etaSeconds,
  stepLabel,
  showPercent = false,
  state = "running",
  asCanvas = false,
  width = 300,
  height = 6,
  ariaLabel,
  reducedMotion,
  className,
}: LinearDitherBarProps) {
  const systemReduced = useReducedMotion();
  const isReduced = reducedMotion ?? systemReduced;

  const p = state === "done" ? 1 : clampProgress(progress);
  const pct = Math.round(p * 100);
  const style = { "--pw": `${p * 100}%` } as CSSProperties;
  const eta = state === "done" ? null : etaLabel(etaSeconds);
  const left = stepLabel ?? (showPercent ? `${pct}%` : null);

  if (asCanvas) {
    return (
      <canvas
        className={cn("bar art-ditherbar-canvas", className)}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? stepLabel}
        aria-busy={state === "running"}
        width={width}
        height={height}
      />
    );
  }

  return (
    <div
      className={cn("art-ditherbar", state !== "running" && `is-${state}`, className)}
      style={style}
      data-reduced-motion={isReduced ? "true" : undefined}
    >
      <div
        className="art-ditherbar-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? stepLabel}
        aria-busy={state === "running"}
      >
        <canvas className="bar art-bar-canvas" width={width} height={height} aria-hidden="true" />
        {/* Solid fill pill */}
        <span className="art-ditherbar-pill" aria-hidden="true" />

        {/* 22px graded leading edge dots */}
        {state === "running" && p > 0 && p < 1 && (
          <span className="art-ditherbar-trail" aria-hidden="true">
            <LeadingEdgeSvg />
          </span>
        )}
      </div>
      {left || eta ? (
        <div className="art-ditherbar-meta">
          {left && showPercent ? (
            <span className="art-pct tnum">{left}</span>
          ) : (
            <span className="art-mono tnum">{left}</span>
          )}
          {eta ? <span className="art-mono">{eta}</span> : <span />}
        </div>
      ) : null}
    </div>
  );
}

export default LinearDitherBar;
