import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useReducedMotion } from "@/components/art/useMotion";
import { compose, photoSrc, shapeOf, type Shot } from "@/lib/studio";
import { RESOLVE_HOLD_MS, RESOLVE_MS, approach, clarityOf, resolveClarity } from "@/lib/studioRun";
import { cn } from "@/lib/utils";
import { StudioFrame } from "../StudioFrame";
import { RevealGL, cssColor } from "./revealGL";

export interface RunStageProps {
  shot: Shot;
  /** Frame size in CSS px, already in the shot's aspect ratio. */
  width: number;
  height: number;
  /** 0..1 */
  progress: number;
  status: "running" | "done" | "stopped";
  /** Past the usual time: the picture keeps breathing so the page never looks frozen. */
  slow: boolean;
  /** The real picture, once it exists. */
  src?: string;
  alt: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = url;
  });
}

/** Fine grain as a tile, for the no-WebGL and reduced-motion veil. */
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 1.4 -.2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/**
 * The picture materialising. WebGL draws it from paper and grain, through soft colour masses and
 * a halftone screen, and the real picture then resolves to sharp. Without WebGL, or with reduced
 * motion, the same idea is a still grain veil that crossfades away.
 */
export function RunStage(p: RunStageProps) {
  const reduced = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(p);
  live.current = p;
  const [gl, setGl] = useState<boolean | null>(null);
  /** The canvas has handed over to the plain <img>. */
  const [settled, setSettled] = useState(p.status === "done");
  const wasRunning = useRef(p.status === "running");

  const r = shapeOf(p.shot.ratio).r;
  const comp = compose(p.shot);
  const previewUrl = photoSrc(comp.photo, Math.min(p.width * 2, 960) * comp.zoom, r);

  useEffect(() => {
    if (p.status === "running") {
      wasRunning.current = true;
      setSettled(false);
    }
  }, [p.status]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || reduced || (live.current.status === "done" && !wasRunning.current)) {
      setGl(false);
      return;
    }
    const g = RevealGL.create(el);
    if (!g) {
      setGl(false);
      return;
    }
    setGl(true);
    g.setPaper(cssColor("--paper", [0.97, 0.96, 0.95]));

    let raf = 0;
    let alive = true;
    let visible = true;
    let last = performance.now();
    let acc = 0;
    let clarity = clarityOf(live.current.status === "done" ? 0 : live.current.progress);
    let dim = live.current.status === "stopped" ? 1 : 0;
    let hasPreview = false;
    let resolveAt = -1;
    let resolveFrom = 0;
    let finished = false;
    let tiltX = 0;
    let tiltY = 0;
    let tx = 0;
    let ty = 0;
    let lastDrawn = -1;
    const slowDevice = (navigator.hardwareConcurrency || 8) <= 4;
    const t0 = performance.now();

    const crop = { focus: comp.focus as [number, number], zoom: comp.zoom };
    loadImage(previewUrl).then(
      (im) => {
        if (!alive) return;
        g.setPicture("a", im, r, crop);
        hasPreview = true;
        lastDrawn = -1;
      },
      () => {
        hasPreview = true;
      },
    );

    let finalLoaded = "";
    const wantFinal = (url: string) => {
      if (finalLoaded === url) return;
      finalLoaded = url;
      loadImage(url).then(
        (im) => {
          if (!alive) return;
          g.setPicture("b", im, r);
          resolveFrom = clarity;
          resolveAt = performance.now();
        },
        () => {
          if (alive) finish();
        },
      );
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      setSettled(true);
    };

    const sizeIt = () => {
      const h = host.current;
      if (!h) return;
      g.resize(h.clientWidth, h.clientHeight, window.devicePixelRatio || 1);
      lastDrawn = -1;
    };
    sizeIt();
    const ro = new ResizeObserver(sizeIt);
    if (host.current) ro.observe(host.current);

    const io = new IntersectionObserver((e) => {
      visible = e[e.length - 1]?.isIntersecting ?? true;
    });
    if (host.current) io.observe(host.current);

    const onMove = (e: PointerEvent) => {
      const h = host.current;
      if (!h) return;
      const b = h.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, ((e.clientX - b.left) / b.width - 0.5) * 2));
      ty = Math.max(-1, Math.min(1, ((e.clientY - b.top) / b.height - 0.5) * 2));
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const onLost = (e: Event) => {
      e.preventDefault();
      setGl(false);
    };
    el.addEventListener("webglcontextlost", onLost);

    const paperTimer = window.setInterval(() => g.setPaper(cssColor("--paper", [0.97, 0.96, 0.95])), 1500);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || !visible) {
        last = now;
        return;
      }
      acc += now - last;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (slowDevice && acc < 32) return;
      acc = 0;

      const s = live.current;
      const t = (now - t0) / 1000;

      if (s.status === "done" && s.src) wantFinal(s.src);
      if (s.status === "running") {
        resolveAt = -1;
        finalLoaded = "";
        finished = false;
      }

      let scan = -1;
      let swap = 0;
      if (s.status === "done") {
        if (resolveAt >= 0) {
          const ms = now - resolveAt;
          clarity = resolveClarity(resolveFrom, ms);
          swap = Math.min(1, ms / 380);
          swap = swap * swap * (3 - 2 * swap);
          const u = Math.max(0, Math.min(1, (ms - RESOLVE_HOLD_MS) / (RESOLVE_MS * 0.9)));
          scan = -0.25 + u * 1.5;
          if (ms > RESOLVE_HOLD_MS + RESOLVE_MS + 120) finish();
        } else {
          clarity = approach(clarity, clarityOf(s.progress), dt);
          scan = -0.25 + ((t / 4.4) % 1) * 1.5;
        }
      } else if (s.status === "stopped") {
        dim = approach(dim, 1, dt, 3);
        clarity = approach(clarity, clarityOf(s.progress), dt, 4);
      } else {
        dim = approach(dim, 0, dt, 6);
        clarity = approach(clarity, clarityOf(s.progress), dt);
        /* Slow runs keep a gentle pulse so nothing looks stuck. */
        if (s.slow) clarity += 0.018 * Math.sin(t * 1.3);
        scan = -0.25 + ((t / 4.4) % 1) * 1.5;
      }
      if (!hasPreview) clarity = 0;

      tiltX = approach(tiltX, tx, dt, 3);
      tiltY = approach(tiltY, ty, dt, 3);
      const idle = s.status === "running" ? 0.25 : 0.1;
      const stopped = s.status === "stopped" && dim > 0.995;
      /* A stopped picture is still: draw once it has settled, then rest. */
      const key = stopped ? Math.round(clarity * 1000) : -2;
      if (stopped && key === lastDrawn) return;
      lastDrawn = key;

      g.draw({
        clarity: Math.max(0, Math.min(1, clarity)),
        swap,
        cover: 1,
        scan: stopped ? -1 : scan,
        tiltX: tiltX + idle * Math.sin(t * 0.45),
        tiltY: tiltY + idle * Math.cos(t * 0.37),
        time: t,
        dim,
      });
    };
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearInterval(paperTimer);
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("webglcontextlost", onLost);
      ro.disconnect();
      io.disconnect();
      g.dispose();
    };
    // The driver reads live props through a ref; only the picture it is built for restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl, reduced, r, comp.focus[0], comp.focus[1], comp.zoom]);

  const done = p.status === "done";
  const stopped = p.status === "stopped";
  const canvasOn = gl === true && !settled;
  /* Fallback veil: grain over the stand-in, thinning as progress rises. */
  const veil = done ? 0 : 1 - clarityOf(p.progress) * 1.15;
  const blur = done ? 0 : Math.max(0, (1 - clarityOf(p.progress) / 0.72) * 14);

  return (
    <div
      ref={host}
      className={cn("rs", canvasOn && "rs-gl", settled && "rs-settled", stopped && "rs-stopped", done && "rs-done")}
      style={{ width: p.width, height: p.height } as CSSProperties}
      role="img"
      aria-label={p.alt}
    >
      {/* Plain layers: the stand-in without WebGL, and the real picture once it may show. */}
      {gl === false && <StudioFrame shot={p.shot} width={p.width} />}
      {p.src && done && (settled || gl === false) && (
        <img key={p.src} className={cn("rs-img", gl === false && "rs-fade")} src={p.src} alt="" draggable={false} />
      )}
      {gl === false && !done && (
        <>
          <span className="rs-blur" style={{ backdropFilter: `blur(${blur.toFixed(1)}px)`, WebkitBackdropFilter: `blur(${blur.toFixed(1)}px)` }} />
          <span className="rs-veil" style={{ opacity: Math.max(0, Math.min(1, veil)), backgroundImage: GRAIN }} />
        </>
      )}
      <canvas ref={canvas} className="rs-canvas" aria-hidden="true" />
      <span className="rs-sheen" aria-hidden="true" />
    </div>
  );
}
