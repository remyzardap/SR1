import * as React from "react";
import { Link } from "wouter";
import { Chip, ConvergeBar, FocusBrackets, HalftoneRamp } from "@/components/art";
import { AttachMenu } from "@/components/AttachMenu";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { FoldAllButton, FoldGroup, FoldSection, GoBar, PickTiles, PromptField, Showcase, useFoldState } from "@/components/fold";
import { type Attachment } from "@/lib/attachments";
import { type VideoAspectRatio, type VideoEngineId, type VideoEngineInfo, type VideoQuality } from "@/lib/video";
import { type CSSProperties } from "react";

export type VideoPhase = "prompt" | "running" | "done" | "failed";

export interface VideoEngineMeta {
  blurb: string;
}

export interface VideoScreenProps {
  phase: VideoPhase;
  engines: VideoEngineInfo[];
  enginesLoading: boolean;
  enginesError: string;
  engineId: VideoEngineId | "";
  onEngineChange: (id: VideoEngineId) => void;
  quality: VideoQuality;
  onQualityChange: (q: VideoQuality) => void;
  ratio: VideoAspectRatio;
  onRatioChange: (r: VideoAspectRatio) => void;
  duration: number;
  onDurationChange: (d: number) => void;
  minDuration: number;
  maxDuration: number;
  prompt: string;
  onPromptChange: (p: string) => void;
  maxPrompt: number;
  refs: Attachment[];
  onRefsChange: (refs: Attachment[]) => void;
  maxRefs: number;
  supportsReference: boolean;
  canCreate: boolean;
  onCreate: () => void;
  runningLabel: string;
  runningProgress: number;
  runningEta: number | null;
  runningStage: string;
  onCancel: () => void;
  ranWith: { label: string; prompt: string; ratio: VideoAspectRatio; duration: number };
  videoUrl: string;
  filename: string;
  tookSec: number;
  onDownload: () => void;
  onOpenFiles: () => void;
  onTryAnotherEngine: (id: VideoEngineId) => void;
  onMakeAnother: () => void;
  errorText: string;
  onRetry: () => void;
  availableEngines: VideoEngineInfo[];
  activeEngineId: string;
  folds: ReturnType<typeof useFoldState>;
}

const MAX_PROMPT = 2000;
const MAX_REFERENCE = 1;
const SHAPES: Array<{ value: VideoAspectRatio; label: string; w: number; h: number }> = [
  { value: "16:9", label: "16:9", w: 34, h: 19 },
  { value: "9:16", label: "9:16", w: 19, h: 34 },
  { value: "1:1", label: "1:1", w: 26, h: 26 },
];
const STAGES: string[] = ["QUEUED", "DRAWING", "SAVING"];

const ENGINE_META: Record<string, VideoEngineMeta> = {
  gemini: { blurb: "Natural motion and clean detail. Our quickest option." },
  openai: { blurb: "Cinematic and precise. Follows long prompts closely." },
  qwen: { blurb: "Crisp and true to the scene, with steady camera moves." },
  forge: { blurb: "Open models on our own GPU, started on demand. The first clip can take a few minutes." },
};
const FALLBACK_META: VideoEngineMeta = { blurb: "Turns your description into a short clip." };

const ENGINE_NAMES: Record<string, string> = { gemini: "Fast", openai: "Cinematic", qwen: "Crisp", forge: "GPU" };
const engineName = (e: { id: string; label: string }) => ENGINE_NAMES[e.id] ?? "Engine";

function EngineMark({ id }: { id: string }) {
  const common = { viewBox: "0 0 96 96", fill: "none", stroke: "currentColor", strokeWidth: 6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "gemini") return <svg {...common}><circle cx="37" cy="48" r="21" /><circle cx="59" cy="48" r="21" /></svg>;
  if (id === "qwen") return <svg {...common}><path d="M16 64a32 32 0 0 1 64 0" /><path d="M29 64a19 19 0 0 1 38 0" /><path d="M42 64a6 6 0 0 1 12 0" /></svg>;
  if (id === "forge") return <svg {...common}><rect x="18" y="22" width="60" height="14" rx="7" /><rect x="18" y="41" width="60" height="14" rx="7" /><rect x="18" y="60" width="60" height="14" rx="7" /></svg>;
  if (id === "openai") return <svg {...common}><rect x="19" y="19" width="58" height="58" rx="17" /><circle cx="48" cy="48" r="12" /></svg>;
  return <svg {...common}><circle cx="48" cy="48" r="27" /></svg>;
}

function EnginePoster({ id }: { id: string }) {
  const variant = ["gemini", "qwen", "openai", "forge"].indexOf(id);
  const shift = Math.max(0, variant) * 6;
  return (
    <svg viewBox="0 0 240 135" aria-hidden="true" className="vd-poster-art">
      <rect x="44" y="20" width="152" height="95" rx="14" className="p-frame" />
      <path d="M44 38h152M44 97h152" className="p-line" />
      <circle cx={92 + shift} cy="68" r="9" className="p-dot p-dot-3" />
      <circle cx={110 + shift} cy="68" r="9" className="p-dot p-dot-2" />
      <circle cx={128 + shift} cy="68" r="9" className="p-dot p-dot-1" />
      <circle cx={150 + shift} cy="68" r="15" className="p-spot" />
      <path d="M146 61l12 7-12 7z" className="p-play" />
    </svg>
  );
}

function ShapeMark({ ratio }: { ratio: VideoAspectRatio }) {
  const s = SHAPES.find((x) => x.value === ratio) ?? SHAPES[0];
  return (
    <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x={20 - s.w / 2} y={20 - s.h / 2} width={s.w} height={s.h} rx="5" />
    </svg>
  );
}

function formatEstimate(e: VideoEngineInfo): string {
  const min = e.estimateMinSeconds;
  const max = e.estimateMaxSeconds;
  if (!min || !max) return "";
  if (max >= 120) return `${Math.round(min / 60)} to ${Math.round(max / 60)} min`;
  return `${min} to ${max} s`;
}

function panelColumns(ratio: VideoAspectRatio): number {
  const [w, h] = ratio.split(":").map(Number);
  return Math.max(10, Math.round((w / h) * 18.5));
}

function ratioStyle(ratio: VideoAspectRatio): CSSProperties {
  const [w, h] = ratio.split(":").map(Number);
  return { ["--vd-ratio" as string]: String(w / h) } as CSSProperties;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "video";
}

export function VideoScreen({
  phase,
  engines,
  enginesLoading,
  enginesError,
  engineId,
  onEngineChange,
  quality,
  onQualityChange,
  ratio,
  onRatioChange,
  duration,
  onDurationChange,
  minDuration,
  maxDuration,
  prompt,
  onPromptChange,
  maxPrompt,
  refs,
  onRefsChange,
  maxRefs,
  supportsReference,
  canCreate,
  onCreate,
  runningLabel,
  runningProgress,
  runningEta,
  runningStage,
  onCancel,
  ranWith,
  videoUrl,
  filename,
  tookSec,
  onDownload,
  onOpenFiles,
  onTryAnotherEngine,
  onMakeAnother,
  errorText,
  onRetry,
  availableEngines,
  activeEngineId,
  folds,
}: VideoScreenProps) {
  const current = engines.find((e) => e.id === engineId);
  const shapes = SHAPES.filter((s) => !current?.aspectRatios || current.aspectRatios.includes(s.value));
  const stageIndex = Math.max(0, STAGES.indexOf(runningStage));

  const subtitle =
    phase === "running"
      ? `${current ? engineName(current) : "The engine"} is filming your clip.`
      : phase === "done"
      ? "Ready, and saved to My Files."
      : phase === "failed"
      ? `${current ? engineName(current) : "The engine"} couldn't finish this one.`
      : "";

  const title = "Video";

  return (
    <div className="sk-page vd-page h-full overflow-y-auto">
      <header className="sk-header vd-header">
        <div>
          <h1 className="sk-h1 vd-title">{title}</h1>
          {subtitle ? <p className="sk-sub">{subtitle}</p> : null}
        </div>
        {phase === "prompt" && current ? <FoldAllButton state={folds} /> : null}
      </header>

      {phase === "prompt" && enginesLoading && (
        <div className="vd-note" role="status">Loading video engines...</div>
      )}
      {phase === "prompt" && enginesError && (
        <div className="vd-note">
          <p>{enginesError}</p>
          <button type="button" className="vd-btn vd-btn-ghost" onClick={onCreate}>Try again</button>
        </div>
      )}
      {phase === "prompt" && !enginesLoading && !enginesError && engines.length === 0 && (
        <div className="vd-note">No video engine is set up on this server yet. Ask the owner to add one.</div>
      )}

      {phase === "prompt" && current && (
        <div className="vd-stack vd-studio">
          <PromptField
            id="video-prompt"
            value={prompt}
            onChange={(v) => onPromptChange(v.slice(0, MAX_PROMPT))}
            onSubmit={() => canCreate && onCreate()}
            placeholder="Describe your clip"
            maxLength={MAX_PROMPT}
            minRows={3}
            extra={
              supportsReference ? (
                <AttachMenu attachments={refs} onChange={onRefsChange} max={MAX_REFERENCE} imagesOnly label="Reference photo" />
              ) : undefined
            }
          />

          <FoldGroup state={folds} className="vd-folds">
            {engines.length > 1 && (
              <FoldSection id="engine" index={1} label="Engine" pick={engineName(current)} mini={<EnginePoster id={current.id} />}>
                <Showcase
                  label="Video engine"
                  value={current.id}
                  onChange={(id) => onEngineChange(id as VideoEngineId)}
                  items={engines.map((e) => ({
                    id: e.id,
                    name: engineName(e),
                    description: (ENGINE_META[e.id] ?? FALLBACK_META).blurb,
                    art: <EnginePoster id={e.id} />,
                    badge: formatEstimate(e) || undefined,
                  }))}
                />
              </FoldSection>
            )}
            <FoldSection id="shape" index={engines.length > 1 ? 2 : 1} label="Shape" pick={ratio} mini={<ShapeMark ratio={ratio} />}>
              <PickTiles
                variant="shape"
                label="Aspect ratio"
                value={ratio}
                onChange={(id) => onRatioChange(id as VideoAspectRatio)}
                items={shapes.map((s) => ({ id: s.value, label: s.label, art: <ShapeMark ratio={s.value} /> }))}
              />
            </FoldSection>
            <FoldSection id="length" index={engines.length > 1 ? 3 : 2} label="Length" pick={`${duration} s`}>
              {maxDuration > minDuration ? (
                <div className="vd-step" role="group" aria-label="Length in seconds">
                  <button type="button" className="vd-step-btn" aria-label="Shorter" disabled={duration <= minDuration} onClick={() => onDurationChange(Math.max(minDuration, duration - 1))}>
                    <span aria-hidden="true">−</span>
                  </button>
                  <span className="vd-step-body">
                    <span className="vd-step-value" aria-live="polite">{duration} s</span>
                    <span className="vd-step-ticks" aria-hidden="true">
                      {Array.from({ length: maxDuration - minDuration + 1 }, (_, i) => (
                        <i key={i} className={minDuration + i <= duration ? "is-on" : ""} />
                      ))}
                    </span>
                  </span>
                  <button type="button" className="vd-step-btn" aria-label="Longer" disabled={duration >= maxDuration} onClick={() => onDurationChange(Math.min(maxDuration, duration + 1))}>
                    <span aria-hidden="true">+</span>
                  </button>
                </div>
              ) : (
                <div className="vd-step is-fixed">
                  <span className="vd-step-value">{minDuration} s</span>
                </div>
              )}
            </FoldSection>
            <FoldSection id="quality" index={engines.length > 1 ? 4 : 3} label="Quality" pick={quality === "high" ? "High" : "Standard"}>
              <div className="vd-seg" role="group" aria-label="Quality">
                {(["standard", "high"] as const).map((q) => (
                  <button key={q} type="button" aria-pressed={quality === q} className={`vd-seg-item${quality === q ? " is-on" : ""}`} onClick={() => onQualityChange(q)}>
                    {q === "standard" ? "Standard" : "High"}
                  </button>
                ))}
              </div>
            </FoldSection>
          </FoldGroup>

          <GoBar
            summary={`${engineName(current)} · ${duration} s`}
            detail={`${ratio} · ${quality === "high" ? "High" : "Standard"}${formatEstimate(current) ? ` · about ${formatEstimate(current)}` : ""}`}
            actionLabel="Create video"
            onAction={() => onCreate()}
            disabled={!canCreate}
          />
        </div>
      )}

      {phase === "running" && (
        <div className="vd-stack">
          <div className="vd-frame" style={ratioStyle(ranWith.ratio)}>
            <HalftoneRamp className="vd-ramp" columns={panelColumns(ranWith.ratio)} rows={18} fluid progress={runningProgress} />
            <span className="vd-chip-on"><span className="vd-mono">{runningLabel} · {ranWith.duration} s</span></span>
            <FocusBrackets />
          </div>

          <div className="vd-card" role="status" aria-live="polite">
            <ConvergeBar progress={runningProgress} etaSeconds={runningEta} label={runningStage === "FAILED" || runningStage === "CANCELLED" ? "DRAWING" : runningStage} ariaLabel="Video progress" />
            <div className="vd-stages" aria-hidden="true">
              {STAGES.map((s, i) => (
                <span key={s} className={`vd-mono${i === stageIndex ? " is-now" : ""}`}>{s}</span>
              ))}
            </div>
          </div>

          <div className="vd-recap">
            <div className="vd-recap-head">
              <span className="vd-label">Prompt</span>
              <button type="button" className="vd-btn vd-btn-ghost vd-btn-sm" onClick={onCancel}>Cancel</button>
            </div>
            <p className="vd-recap-text">{ranWith.prompt}</p>
          </div>
        </div>
      )}

      {phase === "done" && videoUrl && (
        <div className="vd-stack">
          <div className="vd-frame is-player" style={ratioStyle(ranWith.ratio)}>
            <video className="vd-video" src={`${videoUrl}#t=0.001`} controls playsInline preload="metadata" aria-label="Your video" />
            <FocusBrackets />
          </div>

          <div className="vd-card">
            <ConvergeBar progress={1} state="done" label="DONE" etaOverride={`TOOK ${tookSec} S`} showPercent={false} ariaLabel="Video finished" />
          </div>

          <div className="vd-actions">
            <a className="vd-btn vd-btn-ink" href={videoUrl} download={filename} onClick={onDownload}>
              <SutaeruIcon name="download" className="size-4" /> Download
            </a>
            <button type="button" className="vd-btn vd-btn-outline" onClick={onOpenFiles}>
              <SutaeruIcon name="files" className="size-4" /> Saved in Files
            </button>
          </div>

          <EngineRow title="Try another engine" engines={availableEngines} active={activeEngineId} onPick={onTryAnotherEngine} />
          <button type="button" className="vd-back" onClick={onMakeAnother}>Make another with the same prompt</button>
        </div>
      )}

      {phase === "failed" && (
        <div className="vd-stack">
          <div className="vd-frame is-failed" style={ratioStyle(ranWith.ratio)}>
            <HalftoneRamp className="vd-ramp is-grey" columns={panelColumns(ranWith.ratio)} rows={18} fluid />
            <span className="vd-x" aria-hidden="true"><SutaeruIcon name="close" className="size-5" /></span>
            <FocusBrackets tone="alert" />
          </div>

          <div className="vd-card">
            <ConvergeBar progress={runningProgress} state="error" label="STOPPED" etaOverride={`TOOK ${tookSec} S`} ariaLabel="Video stopped" />
          </div>

          <p className="vd-message" role="alert">{errorText} Your prompt is still saved.</p>
          <button type="button" className="vd-btn vd-btn-ink" onClick={onRetry}>Try again</button>
          <EngineRow title="Or try with" engines={availableEngines} active={activeEngineId} onPick={onTryAnotherEngine} />
        </div>
      )}
    </div>
  );
}

function EngineRow({ title, engines, active, onPick }: { title: string; engines: VideoEngineInfo[]; active: string; onPick: (id: VideoEngineId) => void }) {
  if (engines.length < 2) return null;
  return (
    <div className="vd-field">
      <span className="vd-label">{title}</span>
      <div className="vd-row" role="group" aria-label={title}>
        {engines.map((e) => (
          <Chip key={e.id} active={e.id === active} onClick={() => onPick(e.id)}>{engineName(e)}</Chip>
        ))}
      </div>
    </div>
  );
}