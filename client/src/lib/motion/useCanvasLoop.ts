import { useEffect, useRef, type RefObject } from "react";

export interface CanvasFrame {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. */
  width: number;
  height: number;
  dpr: number;
  /** Seconds since the loop started. */
  t: number;
  /** Seconds since the last frame (capped, so a tab coming back does not jump). */
  dt: number;
}

export interface CanvasLoopOptions {
  /** Animate. When false a single frame is drawn on mount, resize and redraw(). */
  animate: boolean;
  /** Cap the device pixel ratio (backgrounds do not need 3x). */
  maxDpr?: number;
  /** Target frames per second (frames in between are skipped). */
  fps?: number;
  /** Changing this value forces a redraw (theme, props). */
  redrawKey?: unknown;
}

/**
 * Drives a canvas: DPR-aware sizing from its CSS box, requestAnimationFrame while visible,
 * paused when the tab is hidden or the canvas is scrolled off screen.
 * `draw` is read through a ref, so it may close over fresh props without restarting the loop.
 */
export function useCanvasLoop(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  draw: (frame: CanvasFrame) => void,
  { animate, maxDpr = 3, fps = 60, redrawKey }: CanvasLoopOptions,
): void {
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let onScreen = true;
    let visible = typeof document === "undefined" || document.visibilityState !== "hidden";
    const start = performance.now();
    let last = start;
    let lastDrawn = 0;
    const minGap = 1000 / Math.max(1, fps) - 1;

    const size = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(maxDpr, Math.max(1, window.devicePixelRatio || 1));
      width = rect.width;
      height = rect.height;
      const pw = Math.max(1, Math.round(width * dpr));
      const ph = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
    };

    const paint = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawRef.current({ ctx, width, height, dpr, t: (now - start) / 1000, dt });
    };

    const tick = (now: number) => {
      raf = 0;
      if (!animate || !onScreen || !visible) return;
      if (now - lastDrawn >= minGap) {
        lastDrawn = now;
        paint(now);
      }
      raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (animate && onScreen && visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    size();
    paint(performance.now());
    kick();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { size(); paint(performance.now()); }) : null;
    ro?.observe(canvas);
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            onScreen = entries.some((e) => e.isIntersecting);
            kick();
          })
        : null;
    io?.observe(canvas);
    const onVis = () => {
      visible = document.visibilityState !== "hidden";
      kick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [canvasRef, animate, maxDpr, fps, redrawKey]);
}
