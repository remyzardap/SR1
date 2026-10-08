import * as React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface DitherSphereOptions {
  seed?: number;
  fill?: number;
  k?: number;
  color?: string;
  cell?: number;
}

/**
 * Draws an ink sphere lit from the top left using pure dither dot fields.
 * Copied directly from prototype design/sutaeru-app/app.js drawDither (kind: "sphere").
 */
export function drawDitherSphere(
  canvas: HTMLCanvasElement,
  options: DitherSphereOptions = {}
): void {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round((rect.width || canvas.width || 150) * dpr));
  const h = Math.max(1, Math.round((rect.height || canvas.height || 150) * dpr));

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const widthCss = w / dpr;
  const heightCss = h / dpr;
  ctx.clearRect(0, 0, widthCss, heightCss);

  const styleInk =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--ink").trim()
      : "#242320";
  ctx.fillStyle = options.color || styleInk || "#242320";

  const seed = options.seed ?? 2;
  const s = options.cell ?? 2;
  const k = options.k ?? 0.9;
  const fill = options.fill ?? 0.62;
  const cx = widthCss * 0.5;
  const cy = heightCss * 0.5;
  const rad = Math.min(widthCss, heightCss) * 0.42;

  // Linear congruential generator with Murmur-like bit mixer matching prototype rng()
  let a = seed >>> 0;
  const R = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let py = 0; py < heightCss; py += s) {
    for (let px = 0; px < widthCss; px += s) {
      const dx = (px - cx) / rad;
      const dy = (py - cy) / rad;
      const q = dx * dx + dy * dy;
      if (q > 1) {
        if (q < 1.04 && R() < 0.12) ctx.fillRect(px, py, 1, 1);
        continue;
      }
      const nz = Math.sqrt(Math.max(0, 1 - q));
      const lit = -0.55 * dx - 0.6 * dy + 0.58 * nz;
      let d = Math.pow(Math.max(0, 1 - lit), 1.45) * 0.95;
      if (py < cy + rad - fill * 2 * rad) d *= 0.05;
      if (R() < d * k) {
        ctx.fillRect(px, py, s * 0.78, s * 0.78);
      }
    }
  }
}

export interface DitherSphereProps {
  width?: number;
  height?: number;
  seed?: number;
  fill?: number;
  k?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function DitherSphere({
  width = 150,
  height = 150,
  seed = 2,
  fill = 0.62,
  k = 0.9,
  className,
  style,
}: DitherSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      drawDitherSphere(canvas, { seed, fill, k });
    };

    render();

    // Redraw on theme attribute changes
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === "data-theme" || m.attributeName === "data-mode" || m.attributeName === "class") {
          render();
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, [seed, fill, k]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("empty-sphere", className)}
      width={width}
      height={height}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export default DitherSphere;
