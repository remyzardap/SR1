import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { SutaeruIcon } from "@/components/SutaeruIcon";
import { ConvergeBar } from "@/components/art/ConvergeBar";
import { SutaeruStamp } from "@/components/brand/SutaeruSeal";
import { GROUP_TITLES, optionOf, shapeOf, type CameraGroup, type Shot } from "@/lib/studio";
import { ENGINE_META, type Engine, type EngineId, type Quality, type RunPhase } from "@/lib/studioRun";
import { cn } from "@/lib/utils";
import { StudioFrame } from "./StudioFrame";
import { StudioHead } from "./StudioScreen";
import { StudioIcon } from "./studioIcons";

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/* ── Dither reveal ───────────────────────────────────────────────────── */

/**
 * Dots cover the picture and clear from left to right as the engine draws.
 * Three dot layers of growing size, each masked so density rises smoothly, then paper with a faint
 * dot texture that fades in, a 1.5 px accent scan line with a soft vertical fade, and a warm glow
 * trailing it. Nothing in it ends on a hard edge.
 */
export function DitherReveal({ progress, live = true }: { progress: number; live?: boolean }) {
  const s = -0.12 + 1.24 * clamp(progress);
  const at = (v: number) => `${(v * 100).toFixed(2)}%`;
  const scanning = live && progress > 0 && progress < 1;
  return (
    <div className="dr" aria-hidden="true">
      <span className="dr-band dr-b1" style={{ left: at(s - 0.18), width: "20%" }} />
      <span className="dr-band dr-b2" style={{ left: at(s - 0.06), width: "16%" }} />
      <span className="dr-band dr-b3" style={{ left: at(s + 0.02), width: "12%" }} />
      <span className="dr-paper" style={{ left: at(s + 0.05) }} />
      <span className="dr-tex" style={{ left: at(s + 0.07) }} />
      {scanning && (
        <>
          <span className="dr-glow" style={{ left: `calc(${at(s)} - 22px)` }} />
          <span className="dr-scan" style={{ left: at(s) }} />
        </>
      )}
    </div>
  );
}

/* ── Phases ──────────────────────────────────────────────────────────── */

const PHASES = ["Queued", "Drawing", "Saving"] as const;

function PhaseRow({ phase, done, stopped }: { phase: RunPhase; done: boolean; stopped: boolean }) {
  return (
    <ol className="phase-row" aria-label="Phases">
      {PHASES.map((name, i) => {
        const passed = done || i < phase;
        const cur = !done && !stopped && i === phase;
        return (
          <li key={name} className={cn("mono", cur && "cur", passed && "past", stopped && i === phase && "stop")} aria-current={cur ? "step" : undefined}>
            <span className="pd" aria-hidden="true">
              {passed ? <SutaeruIcon name="check" signal={false} className="ico" /> : cur ? <i /> : null}
            </span>
            {name}
          </li>
        );
      })}
    </ol>
  );
}

/* ── The run ─────────────────────────────────────────────────────────── */

export interface RunPicture {
  id: string;
  /** The real picture, once the engine has made it. */
  src?: string;
  /** What the preview shows until then. */
  shot: Shot;
  alt: string;
}

export interface ImageRunProps {
  status: "running" | "done" | "stopped";
  engine: EngineId;
  quality: Quality;
  count: number;
  prompt: string;
  shot: Shot;
  /** 0..1 */
  progress: number;
  phase: RunPhase;
  /** Seconds left, while running. */
  etaSeconds: number | null;
  /** Seconds the run took, once done. */
  took?: number;
  creditsText?: string;
  pictures: RunPicture[];
  pick: number;
  onPick: (index: number) => void;
  /** Why it stopped, when the engine said. */
  stopReason?: string | null;
  engines: Engine[];
  onCancel: () => void;
  onRetry: () => void;
  onBackToStudio: () => void;
  onEngine: (id: EngineId) => void;
  onVariations: () => void;
  onEdit: () => void;
  downloadHref?: string;
  downloadName?: string;
}

export function ImageRunScreen(p: ImageRunProps) {
  const done = p.status === "done";
  const stopped = p.status === "stopped";
  const meta = ENGINE_META[p.engine];
  const stage = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const r = shapeOf(p.shot.ratio).r;

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const size = () => {
      const pad = window.innerWidth >= 760 ? 44 : 0;
      const W = Math.min(el.clientWidth - pad, 620);
      const H = window.innerWidth >= 1100 ? 560 : 460;
      const w = Math.round(Math.min(W, H * r));
      setDims({ w, h: Math.round(w / r) });
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => ro.disconnect();
  }, [r]);

  const shown = p.pictures[Math.min(p.pick, p.pictures.length - 1)] ?? { id: "preview", shot: p.shot, alt: p.prompt };
  const pct = done ? 100 : Math.round(clamp(p.progress) * 100);
  const title = done ? "Your picture is ready." : stopped ? "Stopped before it finished." : `${meta.name} is drawing your picture.`;
  const lede = done
    ? `Took ${p.took ?? 0} s. Saved to My Files.`
    : stopped
      ? p.stopReason || "Your prompt and every setting are saved. Try again or hand it to another engine."
      : "You can leave this screen. Sutaeru keeps drawing and saves it to Files.";
  const stateWord = done ? "Done" : stopped ? "Stopped" : p.progress <= 0 ? "Estimating" : p.phase === 2 ? "Saving" : "Drawing";
  const etaText = done ? `Took ${p.took ?? 0} s` : stopped ? `At ${pct}%` : p.etaSeconds != null && p.progress > 0 ? `About ${Math.max(1, Math.round(p.etaSeconds))} s left` : "";
  const others = p.engines.filter((e) => e.id !== p.engine);
  const chip = done ? `Done · took ${p.took ?? 0} s` : stopped ? "Stopped" : `${meta.name} · ${p.quality === "high" ? "High" : "Standard"}`;

  return (
    <section className="view wide view-enter" id="view-image">
      <StudioHead step={done ? 3 : 2} backLabel="Studio" onBack={p.onBackToStudio} title={title} lede={lede} />
      <div className="run-grid">
        <div>
          <div className="run-stage" ref={stage}>
            <div
              className="run-frame"
              style={{ width: dims?.w, height: dims?.h, viewTransitionName: "shot" } as CSSProperties}
              role="img"
              aria-label={shown.alt}
            >
              {shown.src ? <img className="rf-img" src={shown.src} alt="" /> : dims ? <StudioFrame shot={shown.shot} width={dims.w} /> : null}
              {!done && <DitherReveal progress={p.progress} live={!stopped} />}
              {done && <SutaeruStamp className="st-stamp" />}
              <span className={cn("tag chip-on", stopped && "alert")}>{chip}</span>
            </div>
          </div>
          {done && p.pictures.length > 1 && (
            <div className="variants" role="radiogroup" aria-label="Pictures" style={{ gridTemplateColumns: `repeat(${p.pictures.length}, minmax(0, 120px))` }}>
              {p.pictures.map((pic, i) => (
                <button key={pic.id} type="button" role="radio" aria-checked={p.pick === i} className="variant" aria-label={`Picture ${i + 1}`} onClick={() => p.onPick(i)}>
                  {pic.src ? <img src={pic.src} alt="" /> : <StudioFrame shot={pic.shot} width={120} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="stack">
          <div className={cn("card status-card", stopped && "is-stopped")}>
            <div className="between">
              <span className={cn("mono", !stopped && "ink")} style={stopped ? { color: "var(--alert)" } : undefined}>{stateWord}</span>
              <span className="mono tnum">{etaText}</span>
            </div>
            <div className="row status-pct">
              <span className="big-pct tnum">{pct}%</span>
              {done ? (
                <SutaeruStamp className="stamp mini-stamp" />
              ) : stopped ? null : (
                <span className="orb run" aria-hidden="true"><i /><i /><i /></span>
              )}
            </div>
            <ConvergeBar
              progress={done ? 1 : p.progress}
              state={done ? "done" : stopped ? "error" : "running"}
              showPercent={false}
              ariaLabel="Image progress"
            />
            <PhaseRow phase={p.phase} done={done} stopped={stopped} />
          </div>

          <div className="card prompt-recap">
            <span className="mono">Prompt</span>
            <p>{p.prompt}</p>
            <div className="row wrap">
              {(["shot", "angle", "lens", "light", "look"] as CameraGroup[]).map((g) => (
                <span key={g} className="tag quiet" title={GROUP_TITLES[g]}>{optionOf(g, p.shot[g]).label}</span>
              ))}
              <span className="tag quiet" title={GROUP_TITLES.ratio}>{p.shot.ratio}</span>
            </div>
          </div>

          {done ? (
            <div className="act-grid">
              <a className="btn ink big" href={p.downloadHref} download={p.downloadName}>
                <SutaeruIcon name="download" signal={false} className="ico" />
                Download
              </a>
              <button type="button" className="btn big" onClick={p.onVariations}>
                <StudioIcon name="refresh" />
                Variations
              </button>
              <button type="button" className="btn big" onClick={p.onEdit}>
                <SutaeruIcon name="edit" signal={false} className="ico" />
                Edit
              </button>
            </div>
          ) : stopped ? (
            <div className="row wrap">
              <button type="button" className="btn ink big" onClick={p.onRetry}>
                <StudioIcon name="refresh" />
                Try again
              </button>
              <button type="button" className="btn big" onClick={p.onBackToStudio}>
                <StudioIcon name="back" />
                Change settings
              </button>
            </div>
          ) : (
            <div className="row">
              <button type="button" className="btn alert cancel-inline" onClick={p.onCancel}>
                <StudioIcon name="stop" />
                Cancel
              </button>
              <button type="button" className="btn ghost" onClick={p.onBackToStudio}>
                Back to settings
              </button>
            </div>
          )}

          {(done || stopped) && others.length > 0 && (
            <div>
              <p className="mono try-label">{stopped ? "Or try with" : "Try another engine"}</p>
              <div className="row wrap">
                {others.map((o) => (
                  <button key={o.id} type="button" className="pill" onClick={() => p.onEngine(o.id)}>
                    {ENGINE_META[o.id].name} · {ENGINE_META[o.id].cost} cr
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {p.status === "running" && (
        <div className="go-bar run-go">
          <div className="sum">
            <span className="mono">{etaText || "Estimating"}</span>
            {p.creditsText && <b className="tnum">{p.creditsText}</b>}
          </div>
          <button type="button" className="btn big outline" onClick={p.onCancel}>
            <StudioIcon name="stop" />
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}

export default ImageRunScreen;
