import * as React from "react";
import { useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { chatEnergy, useChatPhase, type ChatEnergyStore } from "@/lib/motion/chatEnergy";
import { mix, rgba } from "@/lib/motion/color";
import { approach, RAMP_DOTS, rampDot, rampIsAnimated, rampMod, type ChatPhase } from "@/lib/motion/ramp";
import { useArtColors } from "@/lib/motion/useArtColors";
import { useCanvasLoop, type CanvasFrame } from "@/lib/motion/useCanvasLoop";
import { useReducedMotion } from "./useMotion";

export interface DotRampProps {
  /** Force a phase (lab, static art). Omit to follow the chat energy store. */
  phase?: ChatPhase;
  /** Read phase, rate and level from this store (default: the app-wide one). */
  store?: ChatEnergyStore;
  /** Dot count (recipe: 27). */
  count?: number;
  /** Gap between dots at the recipe size, px (recipe: 6). */
  gap?: number;
  /** Force reduced motion (default: the user's setting). */
  reducedMotion?: boolean;
  /** Fixed energy for the lab (0..1); otherwise from the token rate. */
  energy?: number;
  /** Fixed mic level for the lab (0..1). */
  level?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The halftone dot ramp as a living canvas: the Home hero recipe (27 dots, sin^1.7 sizes,
 * sin^1.1 opacities) drawn crisp at the device pixel ratio and scaled to the box it is given.
 * It breathes when idle and follows the chat: listening, a travelling pulse while thinking,
 * token-rate energy while streaming, one settle when done, a quiet dim on error.
 * Width and height come from CSS; the ramp keeps its proportions and centres in the box.
 */
export function DotRamp({
  phase: phaseProp,
  store = chatEnergy,
  count = RAMP_DOTS,
  gap = 6,
  reducedMotion,
  energy: energyProp,
  level: levelProp,
  className,
  style,
}: DotRampProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const systemReduced = useReducedMotion();
  const reduced = reducedMotion ?? systemReduced;
  const storePhase = useChatPhase(store);
  const phase = phaseProp ?? storePhase;
  const { colors, version } = useArtColors(canvasRef);

  const base = useMemo(() => Array.from({ length: count }, (_, i) => rampDot(i, count)), [count]);
  const natural = useMemo(() => {
    const w = base.reduce((acc, d) => acc + d.size, 0) + gap * (count - 1);
    const h = Math.max(...base.map((d) => d.size));
    return { w, h };
  }, [base, gap, count]);

  // Smoothed per-dot state so phase changes glide instead of popping.
  const live = useRef<{ k: Float32Array; o: Float32Array; warm: Float32Array; energy: number; since: number; phase: ChatPhase } | null>(null);
  if (!live.current || live.current.k.length !== count) {
    live.current = { k: new Float32Array(count).fill(1), o: new Float32Array(count).fill(1), warm: new Float32Array(count), energy: 0, since: 0, phase };
  }

  const draw = useCallback(
    ({ ctx, width, height, t, dt }: CanvasFrame) => {
      const s = live.current!;
      const snap = store.getSnapshot();
      if (s.phase !== phase) {
        s.phase = phase;
        s.since = phaseProp ? t : Math.max(0, t - Math.max(0, (performance.now() - snap.since) / 1000));
      }
      const animated = rampIsAnimated(phase, reduced);
      const targetEnergy = energyProp ?? store.energy();
      s.energy = animated ? approach(s.energy, targetEnergy, dt, 0.35) : targetEnergy;
      const drive = {
        phase,
        t,
        phaseAge: t - s.since,
        energy: s.energy,
        level: levelProp ?? snap.level,
      };

      // Fit the natural ramp into the box, leaving room for the swell.
      const scale = Math.min(width / natural.w, height / (natural.h * 1.5));
      const totalW = natural.w * scale;
      let x = (width - totalW) / 2;
      const cy = height / 2;
      const { ink, accent } = colors.current!;

      for (let i = 0; i < count; i++) {
        const d = base[i];
        const m = reduced ? (phase === "error" ? rampMod(i, count, drive) : { k: 1, o: 1, warm: 0 }) : rampMod(i, count, drive);
        if (animated) {
          s.k[i] = approach(s.k[i], m.k, dt, 0.09);
          s.o[i] = approach(s.o[i], m.o, dt, 0.12);
          s.warm[i] = approach(s.warm[i], m.warm, dt, 0.12);
        } else {
          s.k[i] = m.k;
          s.o[i] = m.o;
          s.warm[i] = m.warm;
        }
        const slot = d.size * scale;
        const r = Math.max(0.35, (d.size * scale * s.k[i]) / 2);
        const alpha = Math.min(1, d.opacity * s.o[i]);
        ctx.fillStyle = rgba(mix(ink, accent, s.warm[i]), alpha);
        ctx.beginPath();
        ctx.arc(x + slot / 2, cy, r, 0, Math.PI * 2);
        ctx.fill();
        x += slot + gap * scale;
      }
    },
    [base, count, gap, natural, phase, phaseProp, reduced, energyProp, levelProp, store, colors],
  );

  const animate = rampIsAnimated(phase, reduced);
  useCanvasLoop(canvasRef, draw, {
    animate,
    fps: 60,
    // A running loop picks up a new phase by itself; a still ramp has to be repainted.
    redrawKey: animate ? `${version}` : `${version}:${phase}:${energyProp}:${levelProp}`,
  });

  return (
    <canvas
      ref={canvasRef}
      className={cn("art-dot-ramp", className)}
      style={style}
      aria-hidden="true"
      data-phase={phase}
      data-reduced-motion={reduced ? "true" : undefined}
    />
  );
}

export default DotRamp;
