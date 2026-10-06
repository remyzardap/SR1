import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { SutaeruIcon } from "@/components/SutaeruIcon";
import { Toggle } from "@/components/art/Toggle";
import {
  GROUP_TITLES,
  OPTIONS,
  PHOTOS,
  PHOTO_CREDITS,
  SHAPES,
  compose,
  direction,
  optionOf,
  shapeOf,
  type CameraGroup,
  type Shot,
  type StudioGroup,
} from "@/lib/studio";
import { StudioFrame } from "./StudioFrame";
import "@/styles/studio.css";

const CAMERA_GROUPS: CameraGroup[] = ["shot", "angle", "lens", "light", "look"];

/* ── Viewfinder ──────────────────────────────────────────────────────── */

/* The viewfinder sticks under the app header and gets shorter as you scroll past it.
   Measured from a marker just above it, so it works whichever element scrolls (the window
   on phones, the content pane on wide screens). */
function useViewfinderHeight(dock: React.RefObject<HTMLDivElement | null>, marker: React.RefObject<HTMLDivElement | null>) {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const d = dock.current;
    const m = marker.current;
    if (!d || !m) return;
    const H0 = window.innerWidth >= 760 ? 360 : 280;
    const H1 = Math.round(H0 * 0.62);
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const stick = parseFloat(getComputedStyle(d).top) || 0;
        const y = Math.max(0, stick - m.getBoundingClientRect().top);
        const next = Math.round(Math.max(H1, H0 - y * 0.6));
        setH((cur) => (cur === next ? cur : next));
      });
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      if (raf) cancelAnimationFrame(raf);
    };
  }, [dock, marker]);
  return h;
}

export function StudioViewfinder({ shot }: { shot: Shot }) {
  const dock = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const vfH = useViewfinderHeight(dock, marker);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const r = shapeOf(shot.ratio).r;
  const W = Math.max(0, size.w - 40);
  const H = Math.max(0, size.h - 40);
  const fw = Math.round(Math.min(W, H * r));
  const fh = Math.round(fw / r);
  const c = compose(shot);
  const ref = shot.look === "painted" || shot.look === "clay";
  const photo = PHOTOS[c.photo];

  return (
    <>
    <div ref={marker} className="st-vf-marker" aria-hidden="true" />
    <div ref={dock} className="st-vf-dock">
      <div ref={box} className="st-vf" style={vfH ? ({ "--vf-h": `${vfH}px` } as React.CSSProperties) : undefined}>
        <span className="st-vf-tag">Live preview</span>
        {fw > 0 ? (
          <div className="st-vf-frame" style={{ width: fw, height: fh }}>
            <StudioFrame shot={shot} width={fw} />
            <div className="st-vf-thirds" aria-hidden="true"><i /><i /><i /><i /></div>
            <div
              key={`${c.photo}${c.zoom}${c.rotate}${shot.ratio}`}
              className="st-vf-af"
              style={{ left: `${c.focus[0]}%`, top: `${c.focus[1]}%` }}
              aria-hidden="true"
            >
              <i /><i /><i /><i />
            </div>
          </div>
        ) : null}
      </div>
      <div className="st-vf-meta">
        <a href={`https://unsplash.com/photos/${photo.id}`} target="_blank" rel="noreferrer" title="Sample photo on Unsplash">
          {ref ? "Style" : "Photo"} · {photo.by}
        </a>
        <span>
          <b>{ref ? optionOf("look", shot.look).label : optionOf("lens", shot.lens).label}</b> · {shot.ratio}
        </span>
      </div>
    </div>
    </>
  );
}

/* ── Option tiles ────────────────────────────────────────────────────── */

const Tick = () => (
  <span className="st-opt-tick" aria-hidden="true">
    <SutaeruIcon name="check" signal={false} />
  </span>
);

interface PickerProps {
  shot: Shot;
  onPick: <G extends StudioGroup>(group: G, value: Shot[G]) => void;
}

function CameraGroupRow({ group, shot, onPick }: PickerProps & { group: CameraGroup }) {
  const sel = optionOf(group, shot[group]);
  const tileWidth = typeof window !== "undefined" && window.innerWidth >= 760 ? 128 : 116;
  return (
    <section className="st-group" aria-label={GROUP_TITLES[group]}>
      <div className="st-group-head">
        <span className="img-section-label">{GROUP_TITLES[group]}</span>
        <span className="st-group-why">{sel.label} · {sel.sub}</span>
      </div>
      <div className="st-opts" role="radiogroup" aria-label={GROUP_TITLES[group]}>
        {OPTIONS[group].map((o) => {
          const on = shot[group] === o.id;
          /* Painted and clay show a style reference; the other rows keep the photo so framing and light stay readable. */
          const preview: Shot = { ...shot, [group]: o.id };
          if (group !== "look" && (shot.look === "painted" || shot.look === "clay")) preview.look = "photo";
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              className="st-opt"
              onClick={() => onPick(group, o.id as Shot[typeof group])}
            >
              <span className="st-opt-thumb">
                <StudioFrame shot={preview} width={tileWidth} aspect={tileWidth / (tileWidth >= 128 ? 96 : 86)} />
                <Tick />
              </span>
              <span className="st-opt-cap">
                <b>{o.label}</b>
                <small>{o.sub}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ShapeRow({ shot, onPick }: PickerProps) {
  const sel = shapeOf(shot.ratio);
  return (
    <section className="st-group" aria-label="Shape">
      <div className="st-group-head">
        <span className="img-section-label">{GROUP_TITLES.ratio}</span>
        <span className="st-group-why">{sel.label} · {sel.sub}</span>
      </div>
      <div className="st-opts" role="radiogroup" aria-label="Shape">
        {SHAPES.map((s) => {
          const on = shot.ratio === s.id;
          const W = 92;
          const H = 66;
          const w = s.r >= W / H ? W : H * s.r;
          const h = w / s.r;
          return (
            <button key={s.id} type="button" role="radio" aria-checked={on} className="st-opt is-shape" onClick={() => onPick("ratio", s.id)}>
              <span className="st-opt-thumb">
                <span className="st-opt-crop" style={{ width: w, height: h }}>
                  <StudioFrame shot={{ ...shot, ratio: s.id }} width={w} />
                </span>
                <Tick />
              </span>
              <span className="st-opt-cap">
                <b>{s.label}</b>
                <small>{s.sub}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function StudioOptions({ shot, onPick }: PickerProps) {
  return (
    <>
      {CAMERA_GROUPS.map((g) => (
        <CameraGroupRow key={g} group={g} shot={shot} onPick={onPick} />
      ))}
      <ShapeRow shot={shot} onPick={onPick} />
    </>
  );
}

/* ── Direction ───────────────────────────────────────────────────────── */

export function StudioDirection({ shot, on, onChange }: { shot: Shot; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="st-direction" data-on={on}>
      <p>
        <b>{on ? "Added to your prompt" : "Camera direction is off"}</b>
        {on ? direction(shot) : "Pick any tile below and its words join your prompt, so the engine draws that shot."}
      </p>
      <Toggle checked={on} onCheckedChange={onChange} label="Add camera direction to the prompt" />
    </div>
  );
}

export function StudioCredits() {
  return (
    <details className="st-credits">
      <summary>Sample photos · Unsplash</summary>
      <p>
        The previews show framing, light and look with real photographs. The engine draws your own picture.
        Photographs by {PHOTO_CREDITS.join(", ")}, free to use under the Unsplash License.
      </p>
    </details>
  );
}
