/**
 * Pure math for the living background: a halftone dot field that swells with a slow drifting wave
 * and leans toward the pointer, scroll velocity and device tilt. Deterministic, so it can be tested.
 */

export type LivingVariant = "home" | "chat" | "studio" | "quiet";

export interface VariantSpec {
  /** Distance between dots, CSS px. */
  spacing: number;
  /** Largest dot radius, CSS px. */
  maxRadius: number;
  /** Base alpha of the field (before the art-intensity scale). */
  alpha: number;
  /** Wave drift speed multiplier. */
  speed: number;
  /** How strongly the pointer pushes the field (0..1). */
  reach: number;
  /** Fraction of the viewport (from the top) that carries dots; the field fades out below it. */
  coverage: number;
}

export const VARIANTS: Record<LivingVariant, VariantSpec> = {
  home: { spacing: 22, maxRadius: 2.6, alpha: 0.16, speed: 1, reach: 1, coverage: 1 },
  chat: { spacing: 26, maxRadius: 2, alpha: 0.09, speed: 0.7, reach: 0.7, coverage: 0.5 },
  studio: { spacing: 24, maxRadius: 2.3, alpha: 0.12, speed: 0.85, reach: 0.9, coverage: 0.8 },
  quiet: { spacing: 30, maxRadius: 1.7, alpha: 0.06, speed: 0.45, reach: 0.4, coverage: 0.6 },
};

export interface FieldInput {
  x: number;
  y: number;
  /** Seconds. */
  t: number;
  /** Pointer in CSS px, or null when there is none. */
  pointer: { x: number; y: number } | null;
  /** Smoothed scroll velocity, viewport heights per second, signed. */
  scroll: number;
  /** Device tilt, each -1..1. */
  tilt: { x: number; y: number };
  spec: VariantSpec;
  /** Pointer influence radius, CSS px. */
  radius?: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0..1 swell for the dot at (x, y). */
export function fieldValue(i: FieldInput): number {
  const { x, y, t, spec } = i;
  const tt = t * spec.speed;
  // Two crossing waves give a slow, non-repeating drift; tilt shears the phase.
  const a = Math.sin(x * 0.011 + y * 0.007 + tt * 0.5 + i.tilt.x * 1.6);
  const b = Math.sin(x * -0.006 + y * 0.013 - tt * 0.37 + i.tilt.y * 1.6 + i.scroll * 2.4);
  let v = 0.5 + 0.25 * a + 0.25 * b;
  v = v * v * (3 - 2 * v);
  if (i.pointer) {
    const r = i.radius ?? 150;
    const dx = x - i.pointer.x;
    const dy = y - i.pointer.y;
    const d2 = (dx * dx + dy * dy) / (r * r);
    if (d2 < 9) v += spec.reach * 0.75 * Math.exp(-d2 * 1.4);
  }
  // Scrolling stirs the field: speed adds a ripple that fades when the page rests.
  v += Math.min(0.35, Math.abs(i.scroll) * 0.25) * (0.5 + 0.5 * Math.sin(y * 0.03 - tt * 3));
  return clamp01(v);
}

/** Vertical fade so the field melts away at its coverage line. */
export function coverageFade(y: number, height: number, coverage: number): number {
  if (coverage >= 1) return 1;
  const edge = height * coverage;
  if (y >= edge) return 0;
  const start = edge * 0.55;
  if (y <= start) return 1;
  const u = (y - start) / (edge - start);
  return 1 - u * u * (3 - 2 * u);
}

/** Dots that fit the viewport, capped so a frame stays under the budget. */
export function dotGrid(width: number, height: number, spacing: number, maxDots = 2600): { cols: number; rows: number; spacing: number } {
  let s = spacing;
  let cols = Math.ceil(width / s) + 1;
  let rows = Math.ceil(height / s) + 1;
  while (cols * rows > maxDots) {
    s *= 1.12;
    cols = Math.ceil(width / s) + 1;
    rows = Math.ceil(height / s) + 1;
  }
  return { cols, rows, spacing: s };
}

/** Exponential smoothing step; dt in seconds, tau the time constant. */
export function smooth(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(0.001, tau)));
}
