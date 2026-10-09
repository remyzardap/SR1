import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { dotGrid, coverageFade, fieldValue, smooth, VARIANTS, type LivingVariant } from "@/lib/motion/field";
import { intensityScale, isLowEndDevice, livingMode, readDeviceHints, type LivingMode } from "@/lib/motion/gate";
import { useArtColors } from "@/lib/motion/useArtColors";
import { useCanvasLoop, type CanvasFrame } from "@/lib/motion/useCanvasLoop";
import { onAppearanceChange, readArtIntensity, readBackgroundArt } from "@/lib/theme";
import { useReducedMotion } from "./useMotion";

export interface LivingBackgroundProps {
  variant?: LivingVariant;
  /** Lab overrides; otherwise the Background art / Art intensity settings and device checks apply. */
  enabled?: boolean;
  intensity?: number;
  reducedMotion?: boolean;
  lowEnd?: boolean;
  className?: string;
}

/**
 * A fixed, click-through halftone field behind the content, in the spirit of Stitch's living
 * canvas: it drifts slowly and leans toward the pointer, scroll speed and device tilt.
 * Off for "Background art" off, low-end devices and hidden tabs; one still frame under reduced motion.
 */
export function LivingBackground({
  variant = "home",
  enabled,
  intensity: intensityProp,
  reducedMotion: reducedProp,
  lowEnd: lowEndProp,
  className,
}: LivingBackgroundProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const reducedSetting = useReducedMotion();
  const reduced = reducedProp ?? reducedSetting;
  const [setting, setSetting] = useState(() => ({ on: readBackgroundArt(), intensity: readArtIntensity() }));
  useEffect(() => onAppearanceChange(() => setSetting({ on: readBackgroundArt(), intensity: readArtIntensity() })), []);
  const [lowEndAuto] = useState(() => isLowEndDevice(readDeviceHints()));
  const intensity = intensityProp ?? setting.intensity;
  const mode: LivingMode = livingMode({
    backgroundArt: enabled ?? setting.on,
    intensity,
    reducedMotion: reduced,
    lowEnd: lowEndProp ?? lowEndAuto,
  });
  const { colors, version } = useArtColors(ref);

  const inputs = useRef({ px: -1, py: -1, active: false, scroll: 0, lastY: 0, lastT: 0, tiltX: 0, tiltY: 0 });
  const smoothed = useRef({ px: 0, py: 0, presence: 0, scroll: 0, tx: 0, ty: 0 });

  useEffect(() => {
    if (mode !== "live") return;
    const s = inputs.current;
    s.lastY = window.scrollY;
    s.lastT = performance.now();
    const move = (e: PointerEvent) => {
      s.px = e.clientX;
      s.py = e.clientY;
      s.active = true;
    };
    const leave = () => {
      s.active = false;
    };
    const scroll = () => {
      const now = performance.now();
      const dt = Math.max(16, now - s.lastT) / 1000;
      const v = (window.scrollY - s.lastY) / Math.max(1, window.innerHeight) / dt;
      s.scroll = Math.max(-4, Math.min(4, v));
      s.lastY = window.scrollY;
      s.lastT = now;
    };
    const tilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      s.tiltX = Math.max(-1, Math.min(1, e.gamma / 45));
      s.tiltY = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    window.addEventListener("scroll", scroll, { passive: true, capture: true });
    window.addEventListener("deviceorientation", tilt, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("deviceorientation", tilt);
    };
  }, [mode]);

  const spec = VARIANTS[variant];
  const scale = intensityScale(intensity);

  const draw = (f: CanvasFrame) => {
    const { ctx, width, height, dt, t } = f;
    const c = colors.current;
    const ink = c.dark ? c.paper : c.ink;
    const live = mode === "live";
    const sm = smoothed.current;
    const inp = inputs.current;
    if (live) {
      sm.presence = smooth(sm.presence, inp.active ? 1 : 0, dt, 0.35);
      if (inp.active) {
        sm.px = sm.presence < 0.05 ? inp.px : smooth(sm.px, inp.px, dt, 0.08);
        sm.py = sm.presence < 0.05 ? inp.py : smooth(sm.py, inp.py, dt, 0.08);
      }
      inp.scroll = smooth(inp.scroll, 0, dt, 0.5);
      sm.scroll = smooth(sm.scroll, inp.scroll, dt, 0.12);
      sm.tx = smooth(sm.tx, inp.tiltX, dt, 0.3);
      sm.ty = smooth(sm.ty, inp.tiltY, dt, 0.3);
    }
    const grid = dotGrid(width, height, spec.spacing);
    const baseAlpha = Math.min(0.6, spec.alpha * scale * (c.dark ? 1.15 : 1));
    // Four alpha buckets, one path each: far fewer state changes than a fill per dot.
    const BUCKETS = 4;
    const paths: Path2D[] = Array.from({ length: BUCKETS }, () => new Path2D());
    const pointer = live && sm.presence > 0.02 ? { x: sm.px, y: sm.py } : null;
    const x0 = (width - (grid.cols - 1) * grid.spacing) / 2;
    for (let r = 0; r < grid.rows; r++) {
      const y = r * grid.spacing;
      const fade = coverageFade(y, height, spec.coverage);
      if (fade <= 0.01) continue;
      const off = r % 2 ? grid.spacing / 2 : 0; // staggered, like a halftone screen
      for (let q = 0; q < grid.cols; q++) {
        const x = x0 + q * grid.spacing + off;
        const v =
          fieldValue({
            x,
            y,
            t: live ? t : 3.2,
            pointer,
            scroll: live ? sm.scroll : 0,
            tilt: { x: sm.tx, y: sm.ty },
            spec,
          }) * fade;
        const rad = spec.maxRadius * (0.18 + 0.82 * v);
        if (rad < 0.3) continue;
        const b = Math.min(BUCKETS - 1, Math.floor(v * BUCKETS));
        paths[b].moveTo(x + rad, y);
        paths[b].arc(x, y, rad, 0, Math.PI * 2);
      }
    }
    for (let b = 0; b < BUCKETS; b++) {
      const a = baseAlpha * (0.45 + (0.55 * (b + 1)) / BUCKETS);
      ctx.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${a.toFixed(3)})`;
      ctx.fill(paths[b]);
    }
  };

  useCanvasLoop(ref, draw, { animate: mode === "live", maxDpr: 1.5, fps: 40, redrawKey: `${mode}|${variant}|${scale}|${version}` });

  // Lets shell.css clear the paper layers above the canvas while it is on screen.
  useEffect(() => {
    if (mode === "off") return;
    const root = document.documentElement;
    root.setAttribute("data-living", mode);
    return () => root.removeAttribute("data-living");
  }, [mode]);

  if (mode === "off") return null;
  return <canvas ref={ref} className={cn("living-bg", className)} data-variant={variant} data-mode={mode} aria-hidden="true" />;
}

/** Which field a route gets. */
export function livingVariantFor(path: string): LivingVariant {
  if (path === "/" || path === "/home") return "home";
  if (path.startsWith("/chat") || path.startsWith("/sessions")) return "chat";
  if (path.startsWith("/images") || path.startsWith("/video") || path.startsWith("/atelier") || path.startsWith("/generate")) return "studio";
  return "quiet";
}

export default LivingBackground;
