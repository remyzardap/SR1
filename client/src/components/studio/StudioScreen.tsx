import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { FocusBrackets } from "@/components/art/FocusBrackets";
import { Toggle } from "@/components/art/Toggle";
import {
  FoldAllButton,
  FoldGroup,
  FoldSection,
  GoBar,
  LiveTag,
  Pic,
  PickTiles,
  PromptField,
  tileHeight,
  tileWidth,
  useFoldState,
  type PickItem,
} from "@/components/fold";
import {
  GROUP_TITLES,
  OPTIONS,
  PHOTOS,
  PHOTO_CREDITS,
  SHAPES,
  compose,
  optionOf,
  shapeOf,
  type CameraGroup,
  type Shot,
  type StudioGroup,
} from "@/lib/studio";
import { direction } from "@/lib/studio";
import { ENGINE_META, estimate, type Engine, type EngineId, type Quality } from "@/lib/studioRun";
import { cn } from "@/lib/utils";
import { SegSwitch } from "./SegSwitch";
import { StudioFrame } from "./StudioFrame";
import { StudioSketch } from "./StudioSketch";
import { EngineMark, StudioIcon } from "./studioIcons";

const CAMERA_GROUPS: CameraGroup[] = ["shot", "angle", "lens", "light", "look"];
const FOLD_IDS = [...CAMERA_GROUPS, "ratio", "engine", "quality"];

/* ── Header: back link, title ────────────────────────────────────────── */

export function StudioHead({
  backLabel,
  onBack,
  title,
  lede,
  action,
}: {
  /** Kept so the image-run screen compiles unchanged; the step bar is gone. */
  step?: 0 | 1 | 2 | 3;
  backLabel: string;
  onBack?: () => void;
  title: string;
  lede: ReactNode;
  /** Right of the back link: the page's "Fold all / Open all" pill. */
  action?: ReactNode;
}) {
  return (
    <div className="studio-head">
      <div className="head-row head-top">
        <button type="button" className="btn ghost backlink" onClick={onBack}>
          <StudioIcon name="back" />
          {backLabel}
        </button>
        {action}
      </div>
      <h1 className="title">{title}</h1>
      <p className="lede">{lede}</p>
    </div>
  );
}

/* ── Viewfinder ──────────────────────────────────────────────────────── */

/* On phones the viewfinder sticks under the header and gets shorter as the options scroll past it,
   like a camera app. Measured from a marker just above it, so it works whichever element scrolls. */
function useViewfinderHeight(dock: React.RefObject<HTMLDivElement | null>, marker: React.RefObject<HTMLDivElement | null>) {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const d = dock.current;
    const m = marker.current;
    if (!d || !m || window.innerWidth >= 1100) return;
    const H0 = window.innerWidth >= 760 ? 380 : 268;
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

export function Viewfinder({
  shot,
  label,
  mode,
  onMode,
  grid,
  onGrid,
}: {
  shot: Shot;
  label: string;
  mode: "photo" | "sketch";
  onMode: (m: "photo" | "sketch") => void;
  grid: boolean;
  onGrid: (g: boolean) => void;
}) {
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
  const W = Math.max(0, size.w - 48);
  const H = Math.max(0, size.h - 72);
  const fw = Math.round(Math.min(W, H * r));
  const fh = Math.round(fw / r);
  const c = compose(shot);
  const isRef = shot.look === "painted" || shot.look === "clay";
  const photo = PHOTOS[c.photo];
  const focus = mode === "sketch" ? [50, 54] : c.focus;
  const credit =
    mode === "sketch" ? (
      "Composition sketch"
    ) : (
      <a href={`https://unsplash.com/photos/${photo.id}`} target="_blank" rel="noreferrer" title="Sample photo on Unsplash">
        {isRef ? "Style reference" : "Photo"} · {photo.by} · Unsplash
      </a>
    );

  return (
    <div className="vf-col">
      <div ref={marker} className="vf-marker" aria-hidden="true" />
      <div ref={dock} className="vf-dock">
        <div ref={box} className="vf" style={vfH ? ({ height: vfH } as CSSProperties) : undefined}>
          <span className="vf-tag">
            <LiveTag />
          </span>
          <div className="vf-tools">
            <SegSwitch
              className="vf-mode"
              label="Preview style"
              value={mode}
              onChange={onMode}
              options={[{ id: "photo", label: "Photo" }, { id: "sketch", label: "Sketch" }]}
            />
            <button type="button" className="icon-btn" aria-pressed={grid} aria-label="Thirds grid" onClick={() => onGrid(!grid)}>
              <StudioIcon name="grid" />
            </button>
          </div>
          {fw > 0 ? (
            <div className="vf-frame" style={{ width: fw, height: fh, viewTransitionName: "shot" } as CSSProperties}>
              {mode === "sketch" ? <StudioSketch shot={shot} label={label} /> : <StudioFrame shot={shot} width={fw} />}
              <div className="thirds" style={{ opacity: grid ? 0.5 : 0 }} aria-hidden="true">
                <i /><i /><i /><i />
              </div>
              <div
                key={`${mode}${c.photo}${c.zoom}${c.rotate}${shot.ratio}`}
                className="af lock"
                style={{ left: `${focus[0]}%`, top: `${focus[1]}%` }}
                aria-hidden="true"
              >
                <i /><i /><i /><i />
              </div>
            </div>
          ) : null}
          <span className="mono ph-credit">{credit}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Option groups ───────────────────────────────────────────────────── */

interface PickerProps {
  shot: Shot;
  onPick: <G extends StudioGroup>(group: G, value: Shot[G]) => void;
}

/* Painted and clay show a style reference; the other rows keep the photo so framing and light stay readable. */
function previewShot(shot: Shot, group: StudioGroup, id: string): Shot {
  const preview = { ...shot, [group]: id } as Shot;
  if (group !== "look" && (shot.look === "painted" || shot.look === "clay")) preview.look = "photo";
  return preview;
}

/** The shot's picture at 42x32 for a folded row. */
const MiniShot = ({ shot }: { shot: Shot }) => <StudioFrame shot={shot} width={42} aspect={42 / 32} />;

function cameraItems(group: CameraGroup, shot: Shot): PickItem[] {
  const w = tileWidth();
  return OPTIONS[group].map((o) => ({
    id: o.id,
    label: o.label,
    sub: o.sub,
    art: <StudioFrame shot={previewShot(shot, group, o.id)} width={w} aspect={w / tileHeight(w)} />,
  }));
}

function shapeItems(shot: Shot): PickItem[] {
  const W = 92;
  const H = 66;
  return SHAPES.map((s) => {
    const w = s.r >= W / H ? W : H * s.r;
    const h = w / s.r;
    return {
      id: s.id,
      label: s.label,
      sub: s.sub,
      art: (
        <span className="sh" style={{ width: w, height: h }}>
          <StudioFrame shot={previewShot(shot, "ratio", s.id)} width={w} />
        </span>
      ),
    };
  });
}

/** Mini picture of a shape pick: the frame drawn at its ratio inside the 42x32 slot. */
function MiniShape({ shot }: { shot: Shot }) {
  const r = shapeOf(shot.ratio).r;
  const w = r >= 42 / 32 ? 42 : 32 * r;
  const h = w / r;
  const preview = previewShot(shot, "ratio", shot.ratio);
  return (
    <span className="mini-shape">
      <span className="sh" style={{ width: w, height: h }}>
        <StudioFrame shot={preview} width={Math.max(24, w)} />
      </span>
    </span>
  );
}

export function StudioDirection({ shot, on, onChange }: { shot: Shot; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="direction" data-on={on}>
      <p>
        <b className="mono ink">{on ? "Added to your prompt" : "Camera direction is off"}</b>
        {on ? direction(shot) : "Pick any tile below and its words join your prompt, so the engine draws that shot."}
      </p>
      <Toggle checked={on} onCheckedChange={onChange} label="Add camera direction to the prompt" />
    </div>
  );
}

/* ── Engines ─────────────────────────────────────────────────────────── */

function EngineCards({ engines, value, suggested, onChange }: { engines: Engine[]; value: EngineId; suggested: EngineId; onChange: (id: EngineId) => void }) {
  return (
    <div className="engines" role="radiogroup" aria-label="Engine">
      {engines.map((e) => {
        const m = ENGINE_META[e.id];
        const on = value === e.id;
        return (
          <button key={e.id} type="button" role="radio" aria-checked={on} className={cn("engine", on && "is-on")} onClick={() => onChange(e.id)}>
            {on && <FocusBrackets />}
            <span className="ep">
              {m.img ? <Pic art={m.img} /> : null}
              <span className="badge"><EngineMark id={e.id} /></span>
              {suggested === e.id && <span className="sugg">Suggested</span>}
            </span>
            <span className="en-body">
              <span className="en-name">
                <b>{m.name}</b>
                <span className="mono">{m.time}</span>
              </span>
              <p>{m.line}</p>
              <span className="meters">
                {Object.entries(m.meters).map(([k, v]) => (
                  <span key={k}>
                    <span className="meter" role="img" aria-label={`${k} ${v} of 5`}>
                      {[6, 8, 10, 12, 14].map((h, i) => (
                        <i key={h} className={i < v ? "on" : ""} style={{ height: h }} />
                      ))}
                    </span>
                    <span className="mono">{k}</span>
                  </span>
                ))}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── The studio ──────────────────────────────────────────────────────── */

export interface RefPhoto {
  name: string;
  src: string;
}

export interface StudioScreenProps {
  shot: Shot;
  onPick: PickerProps["onPick"];
  prompt: string;
  onPrompt: (v: string) => void;
  maxPrompt: number;
  label: string;
  vf: "photo" | "sketch";
  onVf: (m: "photo" | "sketch") => void;
  grid: boolean;
  onGrid: (g: boolean) => void;
  directionOn: boolean;
  onDirection: (on: boolean) => void;
  engines: Engine[];
  engine: EngineId;
  suggested: EngineId;
  why: string;
  onEngine: (id: EngineId) => void;
  quality: Quality;
  onQuality: (q: Quality) => void;
  count: number;
  onCount: (n: number) => void;
  refs: RefPhoto[];
  maxRefs: number;
  onAddRefs: (files: FileList | null) => void;
  onRemoveRef: (index: number) => void;
  onBegin: () => void;
  canBegin: boolean;
  onBack?: () => void;
  backLabel?: string;
}

export function StudioScreen(p: StudioScreenProps) {
  const meta = ENGINE_META[p.engine];
  const { secs } = estimate(p.engine, p.quality, p.count);
  const current = p.engines.find((e) => e.id === p.engine);
  const folds = useFoldState("studio", FOLD_IDS, { first: "shot" });
  const shape = shapeOf(p.shot.ratio);

  return (
    <section className="view wide view-enter" id="view-studio">
      <StudioHead
        backLabel={p.backLabel ?? "Agent"}
        onBack={p.onBack}
        title="Set up the shot."
        lede="Each tile is your picture with that one choice changed. Pick what you see, and Sutaeru draws it."
        action={<FoldAllButton state={folds} />}
      />
      <div className="studio-grid">
        <Viewfinder shot={p.shot} label={p.label} mode={p.vf} onMode={p.onVf} grid={p.grid} onGrid={p.onGrid} />
        <div className="opt-col">
          <PromptField
            id="image-prompt-field"
            value={p.prompt}
            onChange={p.onPrompt}
            placeholder="Describe your picture"
            maxLength={p.maxPrompt}
            onSubmit={() => p.canBegin && p.onBegin()}
            refs={p.refs}
            maxRefs={current?.supportsReference === false ? 0 : p.maxRefs}
            onAddRefs={current?.supportsReference === false ? undefined : p.onAddRefs}
            onRemoveRef={p.onRemoveRef}
          />
          <StudioDirection shot={p.shot} on={p.directionOn} onChange={p.onDirection} />
          <FoldGroup state={folds} className="studio-folds">
            {CAMERA_GROUPS.map((g, i) => {
              const sel = optionOf(g, p.shot[g]);
              return (
                <FoldSection key={g} id={g} index={i + 1} label={GROUP_TITLES[g]} pick={sel.label} mini={<MiniShot shot={previewShot(p.shot, g, p.shot[g])} />}>
                  <PickTiles label={GROUP_TITLES[g]} items={cameraItems(g, p.shot)} value={p.shot[g]} onChange={(id) => p.onPick(g, id as Shot[typeof g])} />
                </FoldSection>
              );
            })}
            <FoldSection id="ratio" index={6} label={GROUP_TITLES.ratio} pick={shape.label} mini={<MiniShape shot={p.shot} />}>
              <PickTiles variant="shape" label="Shape" items={shapeItems(p.shot)} value={p.shot.ratio} onChange={(id) => p.onPick("ratio", id as Shot["ratio"])} />
            </FoldSection>
            <FoldSection id="engine" index={7} label="Engine" pick={meta.name} mini={meta.img ? <Pic art={meta.img} fallback={<EngineMark id={p.engine} />} /> : <EngineMark id={p.engine} />}>
              <p className="why">{p.why}</p>
              <EngineCards engines={p.engines} value={p.engine} suggested={p.suggested} onChange={p.onEngine} />
            </FoldSection>
            <FoldSection id="quality" index={8} label="Quality and count" pick={`${p.quality === "high" ? "High" : "Standard"} · ${p.count} picture${p.count > 1 ? "s" : ""}`}>
              <div className="qty">
                <SegSwitch
                  label="Quality"
                  value={p.quality}
                  onChange={p.onQuality}
                  options={[{ id: "standard", label: "Standard" }, { id: "high", label: "High" }]}
                />
                <div className="row" role="radiogroup" aria-label="How many pictures">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={p.count === n} aria-label={`${n} picture${n > 1 ? "s" : ""}`} className="count-opt" onClick={() => p.onCount(n)}>
                      <span className="stackf">
                        {Array.from({ length: n }, (_, i) => (
                          <i key={i} style={{ left: i * 3, top: 6 - i * 3 }} />
                        ))}
                      </span>
                      <span>{n}</span>
                    </button>
                  ))}
                </div>
              </div>
            </FoldSection>
          </FoldGroup>
          <details className="credits-line">
            <summary className="mono">Sample photos · Unsplash</summary>
            <p>{PHOTO_CREDITS.join(", ")}. Free to use under the Unsplash License.</p>
          </details>
        </div>
      </div>
      <GoBar
        summary={`About ${p.engine === "forge" ? Math.round(secs / 60) + " min" : secs + " s"}`}
        detail={`${meta.name}${p.quality === "high" ? " · High" : ""} · ${p.count} picture${p.count > 1 ? "s" : ""}`}
        actionLabel="Begin"
        onAction={p.onBegin}
        disabled={!p.canBegin}
      />
    </section>
  );
}

export default StudioScreen;
