import type { Variants, Transition } from "framer-motion";
import { tokenTransition } from "./tokens";

/**
 * M3 transition patterns as framer-motion variants, for screens that animate inside a page.
 * Under reduced motion pass `reduced = true`: offsets drop to zero and durations to 0, so content
 * simply appears.
 */

export type Axis = "x" | "y" | "z";

export interface SharedAxisOptions {
  axis?: Axis;
  /** 1 moves forward (new content arrives from the end), -1 back. */
  direction?: 1 | -1;
  /** Travel in px (M3: 30). */
  distance?: number;
  reduced?: boolean;
}

/** M3 shared axis: the leaving view slides and fades out fast, the new one slides in and settles. */
export function sharedAxis({ axis = "x", direction = 1, distance = 30, reduced = false }: SharedAxisOptions = {}): Variants {
  const d = reduced ? 0 : distance * direction;
  const prop = axis === "z" ? "scale" : axis;
  const off = (v: number) => (axis === "z" ? (v === 0 ? 1 : 1 + (v > 0 ? -0.08 : 0.08)) : v);
  const enter: Transition = { ...tokenTransition("medium4", "emphasizedDecelerate", reduced), delay: reduced ? 0 : 0.1 };
  const exit: Transition = tokenTransition("short4", "emphasizedAccelerate", reduced);
  const variants: Record<string, Record<string, unknown>> = {
    enter: { opacity: 0, [prop]: off(d) },
    center: { opacity: 1, [prop]: axis === "z" ? 1 : 0, transition: enter },
    exit: { opacity: 0, [prop]: off(-d), transition: exit },
  };
  return variants as Variants;
}

/** M3 fade through: out, then in with a slight scale. For unrelated destinations. */
export function fadeThrough(reduced = false): Variants {
  return {
    enter: { opacity: 0, scale: reduced ? 1 : 0.98 },
    center: { opacity: 1, scale: 1, transition: { ...tokenTransition("medium2", "emphasizedDecelerate", reduced), delay: reduced ? 0 : 0.1 } },
    exit: { opacity: 0, transition: tokenTransition("short3", "emphasizedAccelerate", reduced) },
  };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Container transform: a source card grows into its destination. Returns the transform that maps
 * the destination box onto the source box (the start state); animate it to identity.
 */
export function containerTransformFrom(source: Box, dest: Box): { x: number; y: number; scaleX: number; scaleY: number } {
  const sx = dest.width > 0 ? source.width / dest.width : 1;
  const sy = dest.height > 0 ? source.height / dest.height : 1;
  return {
    x: source.x + source.width / 2 - (dest.x + dest.width / 2),
    y: source.y + source.height / 2 - (dest.y + dest.height / 2),
    scaleX: sx,
    scaleY: sy,
  };
}

export function containerTransformVariants(from: ReturnType<typeof containerTransformFrom>, reduced = false): Variants {
  return {
    closed: reduced ? { opacity: 0 } : { ...from, opacity: 0.4 },
    open: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, transition: tokenTransition("long1", "emphasized", reduced) },
  };
}
