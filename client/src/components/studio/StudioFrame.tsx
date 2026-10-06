import { useEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { compose, photoSrc, photoTile, shapeOf, type Composition, type Shot } from "@/lib/studio";

/* Decoded photographs, shared by every frame on the page. */
const ready = new Set<string>();
const pending = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  const hit = pending.get(url);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      ready.add(url);
      resolve(im);
    };
    im.onerror = reject;
    im.src = url;
  });
  pending.set(url, p);
  return p;
}

export interface StudioFrameProps {
  shot: Shot;
  /** Rendered width in CSS px. Picks the photo size and scales blur and dots. */
  width: number;
  /** Width over height of the box, when it is not the shot's own shape (option tiles). */
  aspect?: number;
  className?: string;
  style?: CSSProperties;
}

/** Live preview of a set of camera choices, composed from a real photograph. */
export function StudioFrame({ shot, width, aspect, className, style }: StudioFrameProps) {
  const c = compose(shot);
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const hi = photoSrc(c.photo, width * dpr * c.zoom, aspect ?? shapeOf(shot.ratio).r);
  const lo = photoTile(c.photo);
  const name = c.photo;
  const [src, setSrc] = useState(() => (ready.has(hi) ? hi : lo));

  useEffect(() => {
    if (ready.has(hi)) {
      setSrc(hi);
      return;
    }
    let live = true;
    /* Same photograph at another size: keep the sharp one on screen until the new size is ready. */
    setSrc((cur) => (cur.endsWith(`/${name}.webp`) ? cur : lo));
    loadImage(hi).then(() => live && setSrc(hi), () => {});
    return () => {
      live = false;
    };
  }, [hi, lo, name]);

  const k = width / 520;
  const vars = {
    "--fx": `${c.focus[0]}%`,
    "--fy": `${c.focus[1]}%`,
    "--z": c.zoom.toFixed(3),
    "--r": `${c.rotate}deg`,
    "--b": `${(c.blur * k).toFixed(2)}px`,
    ...style,
  } as CSSProperties;

  return (
    <div
      className={cn("sf", `sf-look-${c.look}`, c.grade && `sf-grade-${c.grade}`, c.blur > 0 && c.look !== "ink" && "sf-dof", className)}
      style={vars}
      aria-hidden="true"
    >
      {c.look === "ink" ? (
        <Halftone comp={c} src={hi} />
      ) : (
        <>
          <img className={cn("sf-img", src === hi && "is-sharp")} src={src} alt="" decoding="async" draggable={false} />
          <i className="sf-blur" />
          <i className="sf-tone" />
          <i className="sf-grain" />
          <i className="sf-vig" />
        </>
      )}
    </div>
  );
}

/* Halftone print of the framed photograph: dot area follows darkness after auto levels. */
function Halftone({ comp, src }: { comp: Composition; src: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fx0, fy0] = comp.focus;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let live = true;
    const draw = (im: HTMLImageElement) => {
      if (!live || !canvas.isConnected) return;
      const box = canvas.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, box.width);
      const H = Math.max(1, box.height);
      canvas.width = Math.round(W * d);
      canvas.height = Math.round(H * d);
      const x = canvas.getContext("2d");
      if (!x) return;
      x.setTransform(d, 0, 0, d, 0, 0);
      const cs = getComputedStyle(canvas);
      const ink = cs.getPropertyValue("--r-ink").trim() || "#242320";
      const paper = cs.getPropertyValue("--r-paper").trim() || "#F7F6F2";
      const cell = Math.max(2.8, Math.min(4.8, W / 90));
      const cols = Math.ceil(W / cell) + 2;
      const rows = Math.ceil(H / (cell * 0.866)) + 2;
      const off = document.createElement("canvas");
      off.width = cols;
      off.height = rows;
      const ox = off.getContext("2d", { willReadFrequently: true });
      if (!ox) return;
      const fx = fx0 / 100;
      const fy = fy0 / 100;
      const s = Math.max(cols / im.width, rows / im.height) * comp.zoom;
      ox.translate(cols * fx, rows * fy);
      ox.rotate((comp.rotate * Math.PI) / 180);
      ox.scale(s, s);
      ox.drawImage(im, -im.width * fx, -im.height * fy);
      let px: Uint8ClampedArray;
      try {
        px = ox.getImageData(0, 0, cols, rows).data;
      } catch {
        return;
      }
      const L = new Float32Array(cols * rows);
      let lo = 1;
      let hi = 0;
      for (let i = 0; i < L.length; i++) {
        let v = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
        if (comp.grade === "night") v *= 0.6;
        else if (comp.grade === "studio") v = 0.2 + v * 0.85;
        L[i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const span = Math.max(0.2, hi - lo);
      x.fillStyle = paper;
      x.fillRect(0, 0, W, H);
      x.fillStyle = ink;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          let v = (L[j * cols + i] - lo) / span;
          v = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
          v = Math.min(1, Math.max(0, (v - 0.5) * 1.18 + 0.56));
          const rad = cell * 0.6 * Math.sqrt(Math.max(0, 1 - v - 0.08));
          if (rad < 0.3) continue;
          x.beginPath();
          x.arc(i * cell + (j % 2 ? cell / 2 : 0) - cell, j * cell * 0.866 - cell * 0.5, rad, 0, Math.PI * 2);
          x.fill();
        }
      }
    };
    loadImage(src).then(draw, () => {});
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => loadImage(src).then(draw, () => {}));
    ro?.observe(canvas);
    return () => {
      live = false;
      ro?.disconnect();
    };
  }, [fx0, fy0, comp.zoom, comp.rotate, comp.grade, src]);

  return <canvas ref={ref} className="sf-ht" />;
}

export default StudioFrame;
