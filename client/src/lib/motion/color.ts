/** Small colour helpers for canvas art: read CSS colours once, mix them per frame without strings. */

export type RGB = readonly [number, number, number];

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS colour string to RGB (via a canvas, so named colours and rgb() both work). */
export function parseColor(value: string, fallback: RGB = [26, 26, 26]): RGB {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (typeof document === "undefined" || !v) return fallback;
  try {
    probe ??= document.createElement("canvas").getContext("2d");
    if (!probe) return fallback;
    probe.fillStyle = "#000";
    probe.fillStyle = v;
    const out = String(probe.fillStyle);
    return out === "#000000" && !/^(#000|#000000|black|rgb\(0,\s*0,\s*0\))$/i.test(v) ? fallback : parseColor(out, fallback);
  } catch {
    return fallback;
  }
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function rgba(c: RGB, alpha: number): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/** Reads a custom property (or `color`) from an element, with a fallback. */
export function cssColor(el: Element, prop: string, fallback: RGB): RGB {
  if (typeof getComputedStyle === "undefined") return fallback;
  const cs = getComputedStyle(el);
  const raw = prop === "color" ? cs.color : cs.getPropertyValue(prop);
  return raw ? parseColor(raw, fallback) : fallback;
}
