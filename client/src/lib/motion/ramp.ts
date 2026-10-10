/**
 * Pure math for the halftone dot ramp (Home hero and the chat bar mark).
 * Recipe (docs/spec/FRONTEND-REDO.md, "Art touches" 2): 27 dots,
 * size = 1.6 + 11.4 * sin(pi*i/26)^1.7 px, opacity = 0.10 + 0.78 * sin(pi*i/26)^1.1.
 * Everything here is deterministic so it can be unit tested and drawn by canvas or SVG.
 */

export const RAMP_DOTS = 27;
export const RAMP_MIN_SIZE = 1.6;
export const RAMP_SIZE_SPAN = 11.4;
export const RAMP_MIN_OPACITY = 0.1;
export const RAMP_OPACITY_SPAN = 0.78;

/** What the chat is doing, which is what the ramp shows. */
export type ChatPhase = "idle" | "listening" | "thinking" | "streaming" | "done" | "error";

export const CHAT_PHASES: readonly ChatPhase[] = ["idle", "listening", "thinking", "streaming", "done", "error"];

/** Base dot at index i: diameter in px (at scale 1) and opacity. */
export function rampDot(i: number, count = RAMP_DOTS): { size: number; opacity: number; s: number } {
  const n = Math.max(2, count);
  const s = Math.max(0, Math.sin((Math.PI * i) / (n - 1)));
  return {
    size: RAMP_MIN_SIZE + RAMP_SIZE_SPAN * Math.pow(s, 1.7),
    opacity: RAMP_MIN_OPACITY + RAMP_OPACITY_SPAN * Math.pow(s, 1.1),
    s,
  };
}

/** Live inputs for one frame of the ramp. All are smoothed by the caller. */
export interface RampDrive {
  phase: ChatPhase;
  /** Seconds since the page started animating. */
  t: number;
  /** Seconds since the phase began (drives the one-off settle). */
  phaseAge: number;
  /** 0..1 streaming energy, from the token rate. */
  energy: number;
  /** 0..1 microphone level while listening. */
  level: number;
}

/** Per-dot multipliers on top of the base dot: k scales size, o scales opacity, warm is 0..1 accent tint. */
export interface RampMod {
  k: number;
  o: number;
  warm: number;
}

/** Seconds the "done" settle lasts before the ramp is back to its idle breath. */
export const SETTLE_SECONDS = 1.1;

/** Seconds a thinking pulse takes to cross the ramp. */
export const PULSE_SECONDS = 1.6;

const gauss = (x: number, w: number) => Math.exp(-(x * x) / (2 * w * w));

/**
 * The modulation for dot i of n in a frame. Kept gentle: the dots swell and fade,
 * they never pop or jump. `idle` is a slow breath; the other phases add to it.
 */
export function rampMod(i: number, n: number, d: RampDrive): RampMod {
  const x = n > 1 ? i / (n - 1) : 0.5;
  // Slow breath: a long wave rolling across, about one cycle every 6 s.
  const breath = 0.06 * Math.sin(d.t * 1.05 - x * 4.2);
  switch (d.phase) {
    case "listening": {
      const lv = Math.max(0.25, Math.min(1, d.level));
      const wave = Math.sin(d.t * 6.2 + i * 0.55);
      return { k: 1 + breath + lv * 0.38 * wave, o: 1, warm: 0 };
    }
    case "thinking": {
      // A pulse travels left to right; the start sits just off the left end so it eases in.
      const p = ((d.t / PULSE_SECONDS) % 1) * 1.4 - 0.2;
      const bump = gauss(x - p, 0.075);
      return { k: 0.92 + breath + 0.55 * bump, o: 0.78 + 0.3 * bump, warm: bump * 0.85 };
    }
    case "streaming": {
      const e = Math.max(0, Math.min(1, d.energy));
      const wave = Math.sin(d.t * (4 + 6 * e) - i * 0.62);
      const lift = 0.05 + 0.4 * e;
      return { k: 1 + breath + lift * (0.5 + 0.5 * wave), o: 0.9 + 0.12 * e, warm: e * (0.35 + 0.35 * (0.5 + 0.5 * wave)) };
    }
    case "done": {
      // One damped swell from the centre outward, then still.
      const a = Math.max(0, d.phaseAge);
      if (a >= SETTLE_SECONDS) return { k: 1 + breath, o: 1, warm: 0 };
      const decay = Math.exp(-a * 3.6);
      const ripple = Math.cos(a * 9 - Math.abs(x - 0.5) * 6);
      const fade = 1 - a / SETTLE_SECONDS;
      return { k: 1 + breath * (1 - fade) + 0.22 * decay * ripple, o: 1, warm: 0.4 * decay };
    }
    case "error":
      // Quiet dim: smaller, fainter, no breath.
      return { k: 0.82, o: 0.42, warm: 0 };
    case "idle":
    default:
      return { k: 1 + breath, o: 1, warm: 0 };
  }
}

/** Whether a phase needs frames at all (the rest can be drawn once). */
export function rampIsAnimated(phase: ChatPhase, reduced: boolean): boolean {
  return !reduced && phase !== "error";
}

/**
 * Tokens per second to a 0..1 energy. Soft-saturating so a fast model does not peg the ramp:
 * about 0.5 at 20 tok/s and 0.86 at 60 tok/s.
 */
export function tokenRateToEnergy(tokensPerSecond: number): number {
  if (!Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0) return 0;
  return 1 - Math.exp(-tokensPerSecond / 29);
}

/** Frame-rate independent exponential approach of `current` toward `target` (tau in seconds). */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  const a = 1 - Math.exp(-Math.max(0, dt) / tau);
  return current + (target - current) * a;
}

/** A rough token count for a chunk of text (about four characters a token). */
export function estimateTokens(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return chars / 4;
}
