import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { SutaeruIcon } from "@/components/SutaeruIcon";
import { SutaeruStamp } from "@/components/brand/SutaeruSeal";
import { shapeOf, type Shot } from "@/lib/studio";
import { ENGINE_META, ENGINE_STYLE, usualText, type Engine, type EngineId, type Quality, type RunPhase } from "@/lib/studioRun";
import { cn } from "@/lib/utils";
import { StudioFrame } from "./StudioFrame";
import { StudioIcon } from "./studioIcons";
import { RunReadout } from "./run/RunReadout";
import { RunStage } from "./run/RunStage";

const clamp = (n: number) => Math.min(1, Math.max(0, n));

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
  /** The calm mono word for the stage, from runStatus. */
  word?: string;
  /** Honest time left, from runStatus. */
  timeText?: string;
  /** Past the usual time: a calm note appears and the picture keeps breathing. */
  slow?: boolean;
  /** Seconds the run took, once done. */
  took?: number;
  creditsText?: string;
  pictures: RunPicture[];
  pick: number;
  onPick: (index: number) => void;
  /** Why it stopped, when the engine said. Empty means the person cancelled. */
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
  const cancelled = stopped && !p.stopReason;
  const slow = !!p.slow && p.status === "running";
  const host = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const r = shapeOf(p.shot.ratio).r;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const size = () => {
      const wide = window.innerWidth >= 1100;
      const W = Math.min(el.clientWidth, wide ? 680 : 560);
      const H = wide ? 600 : Math.min(480, Math.max(300, window.innerHeight - 380));
      const w = Math.round(Math.min(W, H * r));
      setDims({ w, h: Math.round(w / r) });
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => ro.disconnect();
  }, [r]);

  const shown = p.pictures[Math.min(p.pick, p.pictures.length - 1)] ?? { id: "preview", shot: p.shot, alt: p.prompt };
  const pct = Math.round(clamp(p.progress) * 100);
  const title = done ? "Your picture is ready." : cancelled ? "Cancelled." : stopped ? "That didn't finish." : "Drawing your picture.";
  const lede = done
    ? `Took ${p.took ?? 0} s. Saved to My Files.`
    : cancelled
      ? "Nothing was saved. Your prompt and settings are still here."
      : stopped
        ? p.stopReason
        : "You can leave this screen. It keeps drawing and saves to Files.";
  const others = p.engines.filter((e) => e.id !== p.engine);
  const word = p.word ?? (p.progress <= 0 ? "Preparing" : p.phase === 2 ? "Saving to Files" : "Drawing");
  const timeText = p.timeText ?? (p.etaSeconds != null && p.progress > 0 ? `About ${Math.max(1, Math.round(p.etaSeconds))} s left` : "Starting");
  const state = done ? "done" : stopped ? (cancelled ? "cancelled" : "error") : slow ? "slow" : "running";

  return (
    <section className="view wide view-enter run-screen" id="view-image" data-run={state}>
      <div className="run-head">
        <button type="button" className="btn ghost backlink" onClick={p.onBackToStudio}>
          <StudioIcon name="back" />
          Studio
        </button>
        <h1 className="title" key={state}>{title}</h1>
        {lede && <p className="lede" key={`l-${state}`}>{lede}</p>}
      </div>

      <div className="run-grid">
        <div ref={host} className="run-main">
          <div className="run-stage">
            <div className="run-frame" style={{ width: dims?.w, height: dims?.h, viewTransitionName: "shot" } as CSSProperties}>
              {dims && (
                <RunStage
                  shot={shown.shot}
                  width={dims.w}
                  height={dims.h}
                  progress={done ? 1 : p.progress}
                  status={p.status}
                  slow={slow}
                  src={shown.src}
                  alt={shown.alt}
                />
              )}
              {!dims && <StudioFrame shot={shown.shot} width={320} />}
              {done && <SutaeruStamp className="st-stamp" />}
              {stopped && <span className={cn("run-chip", !cancelled && "alert")}>{cancelled ? `Cancelled at ${pct}%` : `Stopped at ${pct}%`}</span>}
            </div>
          </div>
          {done && p.pictures.length > 1 && (
            <div className="variants" role="radiogroup" aria-label="Pictures" style={{ gridTemplateColumns: `repeat(${p.pictures.length}, minmax(0, 96px))` }}>
              {p.pictures.map((pic, i) => (
                <button key={pic.id} type="button" role="radio" aria-checked={p.pick === i} className="variant" aria-label={`Picture ${i + 1}`} onClick={() => p.onPick(i)}>
                  {pic.src ? <img src={pic.src} alt="" /> : <StudioFrame shot={pic.shot} width={96} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="run-side">
          {p.status === "running" && (
            <>
              <RunReadout progress={p.progress} word={word} timeText={timeText} slow={slow} note={usualText(p.engine)} />
              <div className="run-acts">
                <button type="button" className="btn big outline run-cancel" onClick={p.onCancel}>
                  <StudioIcon name="stop" />
                  Cancel
                </button>
                {p.creditsText && <span className="mono run-credits tnum">{p.creditsText}</span>}
              </div>
            </>
          )}

          {done && (
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
          )}

          {stopped && (
            <div className="run-acts wrap">
              <button type="button" className="btn ink big" onClick={p.onRetry}>
                <StudioIcon name="refresh" />
                Try again
              </button>
              <button type="button" className="btn big" onClick={p.onBackToStudio}>
                <StudioIcon name="back" />
                Change settings
              </button>
            </div>
          )}

          <p className="run-prompt">{p.prompt}</p>

          {(done || stopped) && others.length > 0 && (
            <div>
              <p className="mono try-label">{stopped ? "Or try" : "Try another look"}</p>
              <div className="row wrap">
                {others.map((o) => (
                  <button key={o.id} type="button" className="pill" onClick={() => p.onEngine(o.id)}>
                    {ENGINE_STYLE[o.id]} · {ENGINE_META[o.id].cost} cr
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default ImageRunScreen;
