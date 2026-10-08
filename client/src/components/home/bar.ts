/*
 * The prototype's canvas bars, ported verbatim from design/sutaeru-app/app.js
 * (rng / cv / fit / rr / drawBar). Sweep bars grow from the left; converge bars
 * grow from both ends toward the middle. The dither trail is seeded off the
 * animation frame, so it shuffles without moving the head.
 */

export interface BarOptions {
  /** Animation clock in ms; the trail re-seeds every 110ms. */
  t?: number;
  /** "converge" grows the fill from both ends; anything else sweeps from the left. */
  mode?: "converge";
  /** Overrides the ink token, e.g. a bar drawn on the hero background. */
  color?: string;
  /** Overrides the dot-track token. */
  track?: string;
  /** 8px instead of 6px. */
  thick?: boolean;
  /** False freezes the trail; the fill still draws. */
  live?: boolean;
}

/** The prototype's seeded generator: same seed, same dither every frame. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A theme token as the browser resolves it, so bars follow light/dark. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

/** Sizes the backing store to the element's box and returns CSS-pixel space. */
function fit(c: HTMLCanvasElement): { x: CanvasRenderingContext2D; w: number; h: number } {
  const r = c.getBoundingClientRect();
  const d = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * d));
  const h = Math.max(1, Math.round(r.height * d));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const x = c.getContext("2d");
  if (!x) throw new Error("Canvas 2d context unavailable");
  x.setTransform(d, 0, 0, d, 0, 0);
  return { x, w: r.width, h: r.height };
}

function rr(x: CanvasRenderingContext2D, a: number, y: number, w: number, h: number, r: number): void {
  if (x.roundRect) {
    x.beginPath();
    x.roundRect(a, y, w, h, r);
    x.fill();
  } else {
    x.fillRect(a, y, w, h);
  }
}

/** Sweep and converge bars: ink pills, a dither trail ahead of each head, dots for what is left. */
export function drawBar(c: HTMLCanvasElement | null | undefined, p: number, o: BarOptions = {}): void {
  if (!c || !c.isConnected) return;
  const { x, w, h } = fit(c);
  x.clearRect(0, 0, w, h);
  const ink = o.color || token("ink");
  const dot = o.track || token("rule");
  const cy = h / 2;
  const th = Math.min(o.thick ? 8 : 6, h * 0.6);
  const r = th / 2;
  const frame = Math.floor((o.t || 0) / 110);
  x.fillStyle = dot;
  for (let px = 2; px < w - 1; px += 6) {
    x.beginPath();
    x.arc(px, cy, 0.95, 0, 6.283);
    x.fill();
  }
  x.fillStyle = ink;
  const trail = (hx: number, dir: number) => {
    const R = rng(frame * 31 + (dir > 0 ? 7 : 13));
    const len = 24;
    for (let i = 0; i < len; i += 1.5) {
      for (let j = -r - 1.5; j <= r + 1.5; j += 1.5) {
        const k = 1 - i / len;
        if (R() < k * k * 0.9) x.fillRect(hx + dir * i, cy + j, 1.2, 1.2);
      }
    }
  };
  if (o.mode === "converge") {
    const half = w / 2;
    if (p >= 1) {
      rr(x, 0, cy - r, half - 4, th, r);
      rr(x, half + 4, cy - r, half - 4, th, r);
      x.beginPath();
      x.arc(half, cy, 1.8, 0, 6.283);
      x.fill();
      return;
    }
    const a = p * half;
    if (a > 0.5) {
      rr(x, 0, cy - r, a, th, r);
      rr(x, w - a, cy - r, a, th, r);
    }
    if (o.live !== false && p > 0) {
      trail(a, 1);
      trail(w - a, -1);
    }
  } else {
    const a = p * w;
    if (a > 0.5) rr(x, 0, cy - r, a, th, r);
    if (o.live !== false && p > 0 && p < 1) trail(a, 1);
  }
}
