/**
 * The prototype's canvas dither (design/sutaeru-app/app.js: drawDither), ported to
 * TypeScript for the Settings screen's Art intensity sample.
 *
 * A cell grid, ink squares painted where a seeded random draw falls under the ramp's
 * darkness, scaled by `k` so the slider can be seen. Deterministic for a given seed,
 * so a redraw never shuffles the whole field.
 */

/** mulberry32: the prototype's seeded generator, so the same seed gives the same field. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The token colour the art draws in, so a theme swap repaints instead of leaving
 * light ink on a dark panel. Falls back to the light palette's --ink.
 */
export function artInk(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
  return value || "#242320";
}

/** Size the backing store to the element at the device ratio, capped at 2x. */
function fit(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const rect = canvas.getBoundingClientRect();
  const d = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(rect.width * d));
  const h = Math.max(1, Math.round(rect.height * d));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

export interface DitherRampOptions {
  /** 0 – 1. How much of the ramp gets inked. The Art intensity slider / 100. */
  intensity?: number;
  /** Cell size in CSS pixels. */
  cell?: number;
  /** Keeps the field stable between redraws. */
  seed?: number;
  /** Over the theme's ink. */
  color?: string;
}

/**
 * Left-to-right dither ramp: darkness grows as x does, so a slider's value reads as
 * a band of dots thickening towards the right edge.
 */
export function drawDitherRamp(canvas: HTMLCanvasElement, options: DitherRampOptions = {}): void {
  if (!canvas.isConnected) return;
  const fitted = fit(canvas);
  if (!fitted) return;
  const { ctx, w, h } = fitted;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = options.color || artInk();
  const random = seededRandom(options.seed ?? 6);
  const cell = options.cell ?? 2.4;
  const k = options.intensity ?? 0.7;
  for (let py = 0; py < h; py += cell) {
    for (let px = 0; px < w; px += cell) {
      const darkness = Math.pow(px / w, 1.2);
      if (random() < darkness * k) ctx.fillRect(px, py, cell * 0.78, cell * 0.78);
    }
  }
}
