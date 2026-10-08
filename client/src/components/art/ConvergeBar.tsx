import * as React from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { clampProgress, etaLabel, useReducedMotion } from "./useMotion";

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
  /** Preserved for backward compatibility. */
  dots?: number;
  /** Render pure canvas element directly */
  asCanvas?: boolean;
  width?: number;
  height?: number;
  ariaLabel?: string;
  reducedMotion?: boolean;
  className?: string;
}

/** 22px graded leading edge dots SVG fading into the fill */
function LeadingEdgeSvg({ flipped = false }: { flipped?: boolean }) {
  // Staggered fine dots fading over 22px
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
      className={cn("art-lead", flipped ? "art-lead-r" : "art-lead-l")}
      viewBox="0 0 22 6"
      width="22"
      height="6"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ transform: flipped ? "scaleX(-1)" : undefined }}
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

/** Primary progress bar: clean 4-6px rounded track, solid fill, 22px graded leading edge. */
export function ConvergeBar({
  progress,
  etaSeconds,
  state = "running",
  label,
  etaOverride,
  showPercent = true,
  dots = 5,
  asCanvas = false,
  width = 300,
  height = 6,
  ariaLabel,
  reducedMotion,
  className,
}: ConvergeBarProps) {
  const systemReduced = useReducedMotion();
  const isReduced = reducedMotion ?? systemReduced;

  const p = state === "done" ? 1 : clampProgress(progress);
  const pct = Math.round(p * 100);
  const style = { "--pw": `${p * 100}%` } as CSSProperties;
  const right =
    etaOverride ??
    (state === "error" ? "STOPPED" : state === "done" ? null : etaLabel(etaSeconds));

  if (asCanvas) {
    return (
      <canvas
        className={cn("bar art-converge-canvas", className)}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label}
        aria-busy={state === "running"}
        width={width}
        height={height}
      />
    );
  }

  return (
    <div
      className={cn("art-converge", `is-${state}`, className)}
      style={style}
      data-reduced-motion={isReduced ? "true" : undefined}
    >
      {label ? <div className="art-mono art-converge-label">{label}</div> : null}
      <div
        className="art-converge-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label}
        aria-busy={state === "running"}
      >
        <canvas className="bar art-bar-canvas" width={width} height={height} aria-hidden="true" />
        {/* Solid converging pills */}
        <span className="art-pill art-pill-l" aria-hidden="true" />
        <span className="art-pill art-pill-r" aria-hidden="true" />

        {/* 22px graded leading edges into the fill */}
        {state === "running" && p > 0 && p < 1 && (
          <>
            <span className="art-trail art-trail-l" aria-hidden="true">
              <LeadingEdgeSvg />
            </span>
            <span className="art-trail art-trail-r" aria-hidden="true">
              <LeadingEdgeSvg flipped />
            </span>
          </>
        )}

        {/* Met in the middle notch or error break */}
        {state === "done" || state === "error" ? (
          <span
            className={cn("art-junction", state === "error" && "is-error")}
            aria-hidden="true"
          />
        ) : null}
      </div>
      {(showPercent || right) && (
        <div className="art-readout">
          {showPercent ? <span className="art-pct tnum">{pct}%</span> : <span />}
          {right ? <span className="art-meta art-mono">{right}</span> : <span />}
        </div>
      )}
    </div>
  );
}

export default ConvergeBar;
