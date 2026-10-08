import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { SutaeruIcon } from "@/components/SutaeruIcon";
import { FocusBrackets } from "@/components/art/FocusBrackets";
import { Toggle } from "@/components/art/Toggle";
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
const READOUT: Array<[StudioGroup, string]> = [["shot", "Shot"], ["angle", "Angle"], ["lens", "Lens"], ["light", "Light"], ["look", "Look"], ["ratio", ""]];

/* ── Header: back link, four steps, title ────────────────────────────── */

const STEP_NAMES = ["Brief", "Look", "Build", "Done"];

export function StudioSteps({ current }: { current: 0 | 1 | 2 | 3 }) {
  return (
    <div className="steps" aria-label={`Step ${current + 1} of 4`}>
      {STEP_NAMES.map((n, i) => (
        <Fragment key={n}>
          {i > 0 && <span className={cn("ln", i <= current && "done")} />}
          <span className={cn("st", i === current ? "cur" : i < current && "done")}>
            <span className="mono">
              <span className="num">{String(i + 1).padStart(2, "0")} </span>
              {n}
            </span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export function StudioHead({
  step,
  backLabel,
  onBack,
  title,
  lede,
}: {
  step: 0 | 1 | 2 | 3;
  backLabel: string;
  onBack?: () => void;
  title: string;
  lede: ReactNode;
}) {
  return (
    <div className="studio-head">
      <button type="button" className="btn ghost backlink" onClick={onBack}>
        <StudioIcon name="back" />
        {backLabel}
      </button>
      <StudioSteps current={step} />
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
          <span className="tag vf-tag">
            <span className="live-dot" />
            Live<span className="vf-long"> preview</span>
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
        <div className="readout" aria-label="Current shot">
          {READOUT.map(([g, name]) => {
            const value = g === "ratio" ? shot.ratio : optionOf(g as CameraGroup, shot[g as CameraGroup]).label;
            return (
              <span key={g} className="mono">
                {name ? `${name} ` : ""}
                <b>{value}</b>
              </span>
            );
          })}
        </div>
        <p className="vf-note">Sample photos show framing, light and look. The engine draws your final picture.</p>
      </div>
    </div>
  );
}

/* ── Option tiles ────────────────────────────────────────────────────── */

const Tick = () => (
  <span className="tick" aria-hidden="true">
    <SutaeruIcon name="check" signal={false} className="ico" />
  </span>
);

interface PickerProps {
  shot: Shot;
  onPick: <G extends StudioGroup>(group: G, value: Shot[G]) => void;
}

/* Tile art is sized to the tile, a touch bigger on wide screens. */
const tileW = () => (typeof window !== "undefined" && window.innerWidth >= 760 ? 128 : 116);

function CameraGroupRow({ group, shot, onPick }: PickerProps & { group: CameraGroup }) {
  const sel = optionOf(group, shot[group]);
  const w = tileW();
  return (
    <section className="opt-group" aria-label={GROUP_TITLES[group]}>
      <div className="between">
        <span className="mono ink">{GROUP_TITLES[group]}</span>
        <span className="why">{sel.label} · {sel.sub}</span>
      </div>
      <div className="opts" role="radiogroup" aria-label={GROUP_TITLES[group]}>
        {OPTIONS[group].map((o) => {
          const on = shot[group] === o.id;
          /* Painted and clay show a style reference; the other rows keep the photo so framing and light stay readable. */
          const preview: Shot = { ...shot, [group]: o.id };
          if (group !== "look" && (shot.look === "painted" || shot.look === "clay")) preview.look = "photo";
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} className="opt" onClick={() => onPick(group, o.id as Shot[typeof group])}>
              <span className="otw">
                <span className="ot">
                  <StudioFrame shot={preview} width={w} aspect={w / (w >= 128 ? 96 : 86)} />
                  <Tick />
                </span>
                {on && <FocusBrackets />}
              </span>
              <span className="cap">
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
    <section className="opt-group" aria-label="Shape">
      <div className="between">
        <span className="mono ink">{GROUP_TITLES.ratio}</span>
        <span className="why">{sel.label} · {sel.sub}</span>
      </div>
      <div className="opts" role="radiogroup" aria-label="Shape">
        {SHAPES.map((s) => {
          const on = shot.ratio === s.id;
          const W = 92;
          const H = 66;
          const w = s.r >= W / H ? W : H * s.r;
          const h = w / s.r;
          const preview: Shot = { ...shot, ratio: s.id };
          if (shot.look === "painted" || shot.look === "clay") preview.look = "photo";
          return (
            <button key={s.id} type="button" role="radio" aria-checked={on} className="opt shape" onClick={() => onPick("ratio", s.id)}>
              <span className="otw">
                <span className="ot">
                  <span className="sh" style={{ width: w, height: h }}>
                    <StudioFrame shot={preview} width={w} />
                  </span>
                  <Tick />
                </span>
                {on && <FocusBrackets />}
              </span>
              <span className="cap">
                <b>{s.label}</b>
                <small className="mono">{s.sub}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ── Prompt card ─────────────────────────────────────────────────────── */

export interface RefPhoto {
  name: string;
  src: string;
}

function PromptCard({
  prompt,
  onPrompt,
  onSubmit,
  maxLength,
  refs,
  canRef,
  maxRefs,
  onAddRefs,
  onRemoveRef,
}: {
  prompt: string;
  onPrompt: (v: string) => void;
  onSubmit: () => void;
  maxLength: number;
  refs: RefPhoto[];
  canRef: boolean;
  maxRefs: number;
  onAddRefs: (files: FileList | null) => void;
  onRemoveRef: (index: number) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="card prompt-card">
      <label className="mono" htmlFor="image-prompt-field">Your prompt</label>
      <textarea
        id="image-prompt-field"
        rows={2}
        value={prompt}
        maxLength={maxLength}
        onChange={(e) => onPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
      />
      <div className="row">
        {canRef && (
          <>
            <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { onAddRefs(e.target.files); e.target.value = ""; }} />
            {refs.map((r, i) => (
              <span key={`${r.name}${i}`} className="pill ref-pill" aria-label={`Reference photo ${r.name}`}>
                <span className="ref-thumb"><img src={r.src} alt="" /></span>
                <span className="ref-name">Reference added</span>
                <button type="button" className="ref-x" aria-label={`Remove ${r.name}`} onClick={() => onRemoveRef(i)}>
                  <SutaeruIcon name="close" signal={false} className="ico" />
                </button>
              </span>
            ))}
            {refs.length < maxRefs && (
              <button type="button" className="pill" onClick={() => file.current?.click()}>
                <SutaeruIcon name="plus" signal={false} className="ico" />
                Reference photo
              </button>
            )}
          </>
        )}
        <span className="mono prompt-hint">Put words in quotes to print them</span>
      </div>
    </div>
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
              {m.img ? <img src={m.img} alt="" loading="lazy" decoding="async" /> : null}
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
              <span className="mono">{m.cost} credits each</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── The studio ──────────────────────────────────────────────────────── */

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
  const { credits, secs } = estimate(p.engine, p.quality, p.count);
  const current = p.engines.find((e) => e.id === p.engine);

  return (
    <section className="view wide view-enter" id="view-studio">
      <StudioHead
        step={1}
        backLabel={p.backLabel ?? "Agent"}
        onBack={p.onBack}
        title="Set up the shot."
        lede="Each tile is your picture with that one choice changed. Pick what you see, and Sutaeru draws it."
      />
      <div className="studio-grid">
        <Viewfinder shot={p.shot} label={p.label} mode={p.vf} onMode={p.onVf} grid={p.grid} onGrid={p.onGrid} />
        <div className="opt-col">
          <PromptCard
            prompt={p.prompt}
            onPrompt={p.onPrompt}
            onSubmit={() => p.canBegin && p.onBegin()}
            maxLength={p.maxPrompt}
            refs={p.refs}
            canRef={current?.supportsReference ?? true}
            maxRefs={p.maxRefs}
            onAddRefs={p.onAddRefs}
            onRemoveRef={p.onRemoveRef}
          />
          <StudioDirection shot={p.shot} on={p.directionOn} onChange={p.onDirection} />
          {CAMERA_GROUPS.map((g) => (
            <CameraGroupRow key={g} group={g} shot={p.shot} onPick={p.onPick} />
          ))}
          <ShapeRow shot={p.shot} onPick={p.onPick} />
          <div className="opt-group">
            <div className="between">
              <span className="mono ink">Engine</span>
              <span className="why">{p.why}</span>
            </div>
            <EngineCards engines={p.engines} value={p.engine} suggested={p.suggested} onChange={p.onEngine} />
          </div>
          <div className="opt-group">
            <div className="between">
              <span className="mono ink">Quality and count</span>
              <span className="why">High is slower and costs double</span>
            </div>
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
          </div>
          <details className="credits-line">
            <summary className="mono">Sample photos · Unsplash</summary>
            <p>{PHOTO_CREDITS.join(", ")}. Free to use under the Unsplash License.</p>
          </details>
        </div>
      </div>
      <div className="go-bar">
        <div className="sum">
          <span className="mono">
            {meta.name}{p.quality === "high" ? " · High" : ""} · {p.count} picture{p.count > 1 ? "s" : ""}
          </span>
          <b className="tnum">{credits} credits · about {secs} s</b>
        </div>
        <button type="button" className="btn ink big" disabled={!p.canBegin} onClick={p.onBegin}>
          Begin
          <SutaeruIcon name="arrow" signal={false} className="ico" />
        </button>
      </div>
    </section>
  );
}

export default StudioScreen;
