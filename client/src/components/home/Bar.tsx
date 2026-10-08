import * as React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/components/art/useMotion";
import { drawBar } from "./bar";

export interface CanvasBarProps {
  /** 0..1 */
  progress: number;
  /** Grows from both ends toward the middle instead of sweeping from the left. */
  converge?: boolean;
  /** Overrides the ink token, for a bar drawn on the hero background. */
  color?: string;
  /** Overrides the dot-track token. */
  track?: string;
  /** 8px instead of 6px. */
  thick?: boolean;
  /**
   * The prototype's dither trail, which re-seeds ahead of each head. Off by default:
   * this screen asks for a clean progress bar, and a bar that shuffles every frame is
   * the one thing on Home that would move on its own.
   */
  live?: boolean;
  className?: string;
}

/**
 * A prototype canvas bar: a row of dots for what is left, an ink pill for what is done.
 * It repaints when the progress changes, when the box changes size, and when the theme
 * changes, because the canvas reads its colours out of the live tokens.
 */
export function CanvasBar({ progress, converge, color, track, thick, live = false, className }: CanvasBarProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const options = { mode: converge ? ("converge" as const) : undefined, color, track, thick, live: live && !reduce };
    let frame = 0;
    let alive = true;
    const paint = (t: number) => {
      drawBar(canvas, progress, { ...options, t });
      if (alive && options.live) frame = requestAnimationFrame(paint);
    };
    paint(typeof performance === "undefined" ? 0 : performance.now());

    const onResize = () => paint(0);
    // The ink and the rail are tokens, so a theme switch has to force a repaint.
    const observer = new MutationObserver(() => paint(0));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode"] });
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [progress, converge, color, track, thick, live, reduce]);

  return <canvas ref={ref} className={cn("bar", className)} aria-hidden="true" />;
}
