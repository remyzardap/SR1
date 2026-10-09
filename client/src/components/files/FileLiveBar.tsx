import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/art/useMotion";

/* The live bar for a file Sutaeru is still writing: a dithered canvas that fills toward the
   right edge, with an honest countdown next to it. Static under reduced motion. */

export function drawLiveBar(
  canvas: HTMLCanvasElement,
  progress: number,
  options: { t?: number; color?: string; track?: string } = {}
): void {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round((rect.width || canvas.width || 200) * dpr));
  const h = Math.max(1, Math.round((rect.height || canvas.height || 14) * dpr));

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
  const styleRule =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--rule").trim()
      : "#CFCBC3";

  const ink = options.color || styleInk || "#242320";
  const dot = options.track || styleRule || "#CFCBC3";
  const cy = heightCss / 2;
  const th = Math.min(6, heightCss * 0.6);
  const r = th / 2;
  const frame = Math.floor((options.t || 0) / 110);

  ctx.fillStyle = dot;
  for (let px = 2; px < widthCss - 1; px += 6) {
    ctx.beginPath();
    ctx.arc(px, cy, 0.95, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = ink;
  const a = progress * widthCss;
  if (a > 0.5) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(0, cy - r, a, th, r);
      ctx.fill();
    } else {
      ctx.fillRect(0, cy - r, a, th);
    }
  }

  if (progress > 0 && progress < 1) {
    let seed = (frame * 31 + 7) >>> 0;
    const R = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const len = 24;
    for (let i = 0; i < len; i += 1.5) {
      for (let j = -r - 1.5; j <= r + 1.5; j += 1.5) {
        const k = 1 - i / len;
        if (R() < k * k * 0.9) {
          ctx.fillRect(a + i, cy + j, 1.2, 1.2);
        }
      }
    }
  }
}

export function FileLiveBar() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [etaText, setEtaText] = useState("About 40 sec left");
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (reducedMotion) {
      drawLiveBar(canvas, 0.75, { t: 0 });
      return;
    }

    let animId = 0;
    const t0 = performance.now();

    const loop = (now: number) => {
      const p = 0.55 + 0.4 * (((now - t0) / 40000) % 1);
      drawLiveBar(canvas, p, { t: now });
      const secLeft = Math.round((1 - p) * 90);
      setEtaText(secLeft > 60 ? `${Math.round(secLeft / 60)} min left` : `${secLeft} sec left`);
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [reducedMotion]);

  return (
    <span className="frow-live">
      <span className="bar-holder">
        <canvas ref={canvasRef} className="bar" width={200} height={14} aria-hidden="true" />
      </span>
      <span className="mono tnum">{etaText}</span>
    </span>
  );
}
