/**
 * Motion tokens, after Material 3 motion (m3.material.io/styles/motion), tuned for Sutaeru.
 * The same values are published as CSS variables in styles/redo/motion.css; keep the two in step
 * (motion.test.ts checks that they match).
 */

/** Cubic-bezier control points. */
export type Bezier = readonly [number, number, number, number];

export const EASING = {
  /** M3 "emphasized" is a two-segment path; this single bezier is the standard CSS stand-in. */
  emphasized: [0.2, 0, 0, 1],
  /** Things entering the screen: fast out, long soft landing. */
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1],
  /** Things leaving the screen: gather, then go. */
  emphasizedAccelerate: [0.3, 0, 0.8, 0.15],
  standard: [0.2, 0, 0, 1],
  standardDecelerate: [0, 0, 0, 1],
  standardAccelerate: [0.3, 0, 1, 1],
} as const satisfies Record<string, Bezier>;

export type EasingName = keyof typeof EASING;

/** Milliseconds. */
export const DURATION = {
  short1: 50,
  short2: 100,
  short3: 150,
  short4: 200,
  medium1: 250,
  medium2: 300,
  medium3: 350,
  medium4: 400,
  long1: 450,
  long2: 500,
  long3: 550,
  long4: 600,
  extraLong1: 700,
  extraLong2: 800,
} as const;

export type DurationName = keyof typeof DURATION;

/** Shorthand groups for callers that do not care about the exact step. */
export const DURATION_GROUP = {
  short: DURATION.short4,
  medium: DURATION.medium2,
  long: DURATION.long2,
} as const;

/** `cubic-bezier(...)` string for inline styles. */
export function cssEasing(name: EasingName): string {
  return `cubic-bezier(${EASING[name].join(", ")})`;
}

/** Seconds, for motion/framer-motion `transition.duration`. */
export function seconds(name: DurationName): number {
  return DURATION[name] / 1000;
}

/** A motion/framer-motion transition from tokens; instant under reduced motion. */
export function tokenTransition(
  duration: DurationName = "medium2",
  ease: EasingName = "emphasized",
  reduced = false,
): { duration: number; ease: [number, number, number, number] } {
  return { duration: reduced ? 0 : seconds(duration), ease: [...EASING[ease]] as [number, number, number, number] };
}

/** Evaluates a cubic bezier easing at x in 0..1 (Newton steps plus a bisection fallback). */
export function bezierAt([x1, y1, x2, y2]: Bezier, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const err = sx(t) - x;
    const d = dx(t);
    if (Math.abs(err) < 1e-6) break;
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  if (t < 0 || t > 1 || Math.abs(sx(t) - x) > 1e-4) {
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      if (sx(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
  }
  return ((ay * t + by) * t + cy) * t;
}
