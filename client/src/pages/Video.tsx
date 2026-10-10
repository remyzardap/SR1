import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { AttachMenu } from "@/components/AttachMenu";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { ConvergeBar, Chip, FocusBrackets, HalftoneRamp } from "@/components/art";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { type Attachment } from "@/lib/attachments";
import { getAuthToken } from "@/lib/authSession";
import {
  cancelVideo,
  listVideoEngines,
  pollVideo,
  startVideo,
  type VideoAspectRatio,
  type VideoEngineId,
  type VideoEngineInfo,
  type VideoJobState,
  type VideoQuality,
} from "@/lib/video";
import { FoldAllButton, FoldGroup, FoldSection, GoBar, PickTiles, PromptField, Showcase, useFoldState } from "@/components/fold";
import { pickArt } from "@/lib/pickArt";
import "@/styles/video.css";

type Phase = "engine" | "prompt" | "running" | "done" | "failed";

const MAX_PROMPT = 2000;
const MAX_REFERENCE = 1;
const SHAPES: Array<{ value: VideoAspectRatio; label: string; w: number; h: number }> = [
  { value: "16:9", label: "16:9", w: 34, h: 19 },
  { value: "9:16", label: "9:16", w: 19, h: 34 },
  { value: "1:1", label: "1:1", w: 26, h: 26 },
];
const STAGES: VideoJobState[] = ["QUEUED", "DRAWING", "SAVING"];

interface EngineMeta { blurb: string }

/** One line per engine. Unknown engines fall back to a plain line. Never a model id. */
const ENGINE_META: Record<string, EngineMeta> = {
  gemini: { blurb: "Natural motion and clean detail. Our quickest option." },
  openai: { blurb: "Cinematic and precise. Follows long prompts closely." },
  qwen: { blurb: "Crisp and true to the scene, with steady camera moves." },
  forge: { blurb: "Open models on our own GPU, started on demand. The first clip can take a few minutes." },
};
const FALLBACK_META: EngineMeta = { blurb: "Turns your description into a short clip." };

/** Abstract marks in the app's own icon style. Not vendor logos. */
function EngineMark({ id }: { id: string }) {
  const common = { viewBox: "0 0 96 96", fill: "none", stroke: "currentColor", strokeWidth: 6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "gemini") return <svg {...common}><circle cx="37" cy="48" r="21" /><circle cx="59" cy="48" r="21" /></svg>;
  if (id === "qwen") return <svg {...common}><path d="M16 64a32 32 0 0 1 64 0" /><path d="M29 64a19 19 0 0 1 38 0" /><path d="M42 64a6 6 0 0 1 12 0" /></svg>;
  if (id === "forge") return <svg {...common}><rect x="18" y="22" width="60" height="14" rx="7" /><rect x="18" y="41" width="60" height="14" rx="7" /><rect x="18" y="60" width="60" height="14" rx="7" /></svg>;
  if (id === "openai") return <svg {...common}><rect x="19" y="19" width="58" height="58" rx="17" /><circle cx="48" cy="48" r="12" /></svg>;
  return <svg {...common}><circle cx="48" cy="48" r="27" /></svg>;
}

/** Poster for an engine card: a film frame with a motion trail, drawn with the page tokens (no photos). */
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

/** The frame shape drawn at its ratio, for a tile or a folded row. */
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

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "video";
}

/** The saved video lives behind the session gate, so fetch it with the same credentials as the API calls. */
async function loadVideoBlob(videoUrl: string): Promise<Blob> {
  const origin = import.meta.env.VITE_SR1_API_ORIGIN || "";
  const token = getAuthToken();
  const res = await fetch(videoUrl.startsWith("http") ? videoUrl : `${origin}${videoUrl}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error("The video was created but could not be loaded. Find it in My Files.");
  return res.blob();
}

/** Dot columns that match the panel shape, so the halftone is not cropped to a sliver on tall shapes. */
function panelColumns(ratio: VideoAspectRatio): number {
  const [w, h] = ratio.split(":").map(Number);
  return Math.max(10, Math.round((w / h) * 18.5));
}

function ratioStyle(ratio: VideoAspectRatio): CSSProperties {
  const [w, h] = ratio.split(":").map(Number);
  return { ["--vd-ratio" as string]: String(w / h) } as CSSProperties;
}

export default function Video() {
  useSeoMeta({ title: "Video", path: "/video" });

  const [engines, setEngines] = useState<VideoEngineInfo[]>([]);
  const [enginesLoading, setEnginesLoading] = useState(true);
  const [enginesError, setEnginesError] = useState("");
  const [engineId, setEngineId] = useState<VideoEngineId | "">("");
  const [quality, setQuality] = useState<VideoQuality>("standard");
  const [ratio, setRatio] = useState<VideoAspectRatio>("16:9");
  const [duration, setDuration] = useState(5);
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<Attachment[]>([]);

  const [phase, setPhase] = useState<Phase>("prompt");
  const folds = useFoldState("video", ["engine", "shape", "length", "quality"], { first: "engine" });
  const [stage, setStage] = useState<VideoJobState>("QUEUED");
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const [tookSec, setTookSec] = useState(0);
  const [errorText, setErrorText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [filename, setFilename] = useState("video.mp4");
  const [ranWith, setRanWith] = useState<{ label: string; prompt: string; ratio: VideoAspectRatio; duration: number }>({ label: "", prompt: "", ratio: "16:9", duration: 5 });

  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef("");
  const urlRef = useRef("");

  const loadEngines = useCallback(async () => {
    setEnginesLoading(true);
    setEnginesError("");
    try {
      const all = await listVideoEngines();
      const usable = all.filter((e) => e.available);
      setEngines(usable);
      setEngineId((cur) => (cur && usable.some((e) => e.id === cur) ? cur : usable.find((e) => e.defaultEngine)?.id || usable[0]?.id || ""));
    } catch (err) {
      setEnginesError(err instanceof Error ? err.message : "Could not load the video engines.");
    } finally {
      setEnginesLoading(false);
    }
  }, []);

  useEffect(() => { void loadEngines(); }, [loadEngines]);

  // Stop polling and free the object URL when the page closes. The job itself keeps running on the server.
  useEffect(() => () => {
    abortRef.current?.abort();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const current = engines.find((e) => e.id === engineId);
  const minDur = current?.minDurationSec ?? 5;
  const maxDur = current?.maxDurationSec ?? 5;
  const shapes = SHAPES.filter((s) => !current?.aspectRatios || current.aspectRatios.includes(s.value));

  // Keep the choices inside what the picked engine supports.
  useEffect(() => {
    if (!current) return;
    setDuration((d) => Math.min(maxDur, Math.max(minDur, d)));
    if (current.aspectRatios && !current.aspectRatios.includes(ratio)) setRatio(current.aspectRatios[0] ?? "16:9");
    if (!current.supportsReference) setRefs([]);
  }, [current, minDur, maxDur, ratio]);

  const canCreate = !!current && prompt.trim().length > 0 && phase === "prompt";

  const clearVideo = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
    setVideoUrl("");
  };

  async function generate() {
    if (!current || prompt.trim().length === 0) return;
    const text = prompt.trim();
    const startedAt = Date.now();
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    clearVideo();
    setRanWith({ label: `${current.label} · ${quality === "high" ? "High" : "Standard"}`, prompt: text, ratio, duration });
    setStage("QUEUED");
    setProgress(0);
    setEta(null);
    setErrorText("");
    setPhase("running");
    try {
      const started = await startVideo({
        prompt: text,
        engine: current.id,
        quality,
        aspectRatio: ratio,
        durationSec: duration,
        ...(current.supportsReference && refs.length > 0 ? { referenceImages: refs } : {}),
      });
      jobIdRef.current = started.jobId;
      setStage(started.state);
      setEta(started.etaSeconds);
      const done = await pollVideo(started.jobId, {
        signal: controller.signal,
        onUpdate: (s) => {
          setStage(s.state);
          setProgress(s.progress);
          setEta(s.etaSeconds);
        },
      });
      if (!done.videoUrl) throw new Error("The video finished but no file came back. Find it in My Files.");
      const blob = await loadVideoBlob(done.videoUrl);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setVideoUrl(url);
      setFilename(`${slug(text)}.mp4`);
      setTookSec(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
      setPhase("done");
      toast.success("Video ready. It is also saved in My Files.");
    } catch (err) {
      if (controller.signal.aborted) return;
      setTookSec(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
      setErrorText(err instanceof Error && err.message ? err.message : "The video could not be created.");
      setPhase("failed");
    }
  }

  function cancel() {
    abortRef.current?.abort();
    const id = jobIdRef.current;
    if (id) void cancelVideo(id).catch(() => undefined);
    jobIdRef.current = "";
    setPhase("prompt");
    toast("Stopped. Your prompt is still here.");
  }

  function pickAnother(id: VideoEngineId) {
    setEngineId(id);
    setPhase("prompt");
  }

  const stageIndex = Math.max(0, STAGES.indexOf(stage));
  const subtitle =
    phase === "running" ? `${current?.label ?? "The engine"} is filming your clip.`
    : phase === "done" ? "Ready, and saved to My Files."
    : phase === "failed" ? `${current?.label ?? "The engine"} couldn't finish this one.`
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
          <button type="button" className="vd-btn vd-btn-ghost" onClick={() => void loadEngines()}>Try again</button>
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
            onChange={(v) => setPrompt(v.slice(0, MAX_PROMPT))}
            onSubmit={() => canCreate && void generate()}
            placeholder="Describe your clip"
            maxLength={MAX_PROMPT}
            minRows={3}
            extra={
              current.supportsReference ? (
                <AttachMenu attachments={refs} onChange={setRefs} max={MAX_REFERENCE} imagesOnly label="Reference photo" />
              ) : undefined
            }
          />

          <FoldGroup state={folds} className="vd-folds">
            {engines.length > 1 && (
              <FoldSection id="engine" index={1} label="Engine" pick={current.label} mini={<EnginePoster id={current.id} />}>
                <Showcase
                  label="Video engine"
                  value={current.id}
                  onChange={(id) => setEngineId(id as VideoEngineId)}
                  items={engines.map((e) => ({
                    id: e.id,
                    name: e.label,
                    description: (ENGINE_META[e.id] ?? FALLBACK_META).blurb,
                    art: e.id === "forge" ? pickArt("eng-forge") : <EnginePoster id={e.id} />,
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
                onChange={(id) => setRatio(id as VideoAspectRatio)}
                items={shapes.map((s) => ({ id: s.value, label: s.label, art: <ShapeMark ratio={s.value} /> }))}
              />
            </FoldSection>
            <FoldSection id="length" index={engines.length > 1 ? 3 : 2} label="Length" pick={`${duration} s`}>
              {maxDur > minDur ? (
                <div className="vd-step" role="group" aria-label="Length in seconds">
                  <button type="button" className="vd-step-btn" aria-label="Shorter" disabled={duration <= minDur} onClick={() => setDuration((d) => Math.max(minDur, d - 1))}>
                    <span aria-hidden="true">−</span>
                  </button>
                  <span className="vd-step-body">
                    <span className="vd-step-value" aria-live="polite">{duration} s</span>
                    <span className="vd-step-ticks" aria-hidden="true">
                      {Array.from({ length: maxDur - minDur + 1 }, (_, i) => (
                        <i key={i} className={minDur + i <= duration ? "is-on" : ""} />
                      ))}
                    </span>
                  </span>
                  <button type="button" className="vd-step-btn" aria-label="Longer" disabled={duration >= maxDur} onClick={() => setDuration((d) => Math.min(maxDur, d + 1))}>
                    <span aria-hidden="true">+</span>
                  </button>
                </div>
              ) : (
                <div className="vd-step is-fixed">
                  <span className="vd-step-value">{minDur} s</span>
                </div>
              )}
            </FoldSection>
            <FoldSection id="quality" index={engines.length > 1 ? 4 : 3} label="Quality" pick={quality === "high" ? "High" : "Standard"}>
              <div className="vd-seg" role="group" aria-label="Quality">
                {(["standard", "high"] as const).map((q) => (
                  <button key={q} type="button" aria-pressed={quality === q} className={`vd-seg-item${quality === q ? " is-on" : ""}`} onClick={() => setQuality(q)}>
                    {q === "standard" ? "Standard" : "High"}
                  </button>
                ))}
              </div>
            </FoldSection>
          </FoldGroup>

          <GoBar
            summary={`${current.label} · ${duration} s`}
            detail={`${ratio} · ${quality === "high" ? "High" : "Standard"}${formatEstimate(current) ? ` · about ${formatEstimate(current)}` : ""}`}
            actionLabel="Create video"
            onAction={() => void generate()}
            disabled={!canCreate}
          />
        </div>
      )}

      {phase === "running" && (
        <div className="vd-stack">
          <div className="vd-frame" style={ratioStyle(ranWith.ratio)}>
            <HalftoneRamp className="vd-ramp" columns={panelColumns(ranWith.ratio)} rows={18} fluid progress={progress} />
            <span className="vd-chip-on"><span className="vd-mono">{ranWith.label} · {ranWith.duration} s</span></span>
            <FocusBrackets />
          </div>

          <div className="vd-card" role="status" aria-live="polite">
            <ConvergeBar progress={progress} etaSeconds={eta} label={stage === "FAILED" || stage === "CANCELLED" ? "DRAWING" : stage} ariaLabel="Video progress" />
            <div className="vd-stages" aria-hidden="true">
              {STAGES.map((s, i) => (
                <span key={s} className={`vd-mono${i === stageIndex ? " is-now" : ""}`}>{s}</span>
              ))}
            </div>
          </div>

          <div className="vd-recap">
            <div className="vd-recap-head">
              <span className="vd-label">Prompt</span>
              <button type="button" className="vd-btn vd-btn-ghost vd-btn-sm" onClick={cancel}>Cancel</button>
            </div>
            <p className="vd-recap-text">{ranWith.prompt}</p>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="vd-stack">
          <div className="vd-frame is-player" style={ratioStyle(ranWith.ratio)}>
            <video className="vd-video" src={videoUrl ? `${videoUrl}#t=0.001` : undefined} controls playsInline preload="metadata" aria-label="Your video" />
            <FocusBrackets />
          </div>

          <div className="vd-card">
            <ConvergeBar progress={1} state="done" label="DONE" etaOverride={`TOOK ${tookSec} S`} showPercent={false} ariaLabel="Video finished" />
          </div>

          <div className="vd-actions">
            <a className="vd-btn vd-btn-ink" href={videoUrl} download={filename}>
              <SutaeruIcon name="download" className="size-4" /> Download
            </a>
            <Link href="/files" className="vd-btn vd-btn-outline">
              <SutaeruIcon name="files" className="size-4" /> Saved in Files
            </Link>
          </div>

          <EngineRow title="Try another engine" engines={engines} active={engineId} onPick={pickAnother} />
          <button type="button" className="vd-back" onClick={() => { clearVideo(); setPhase("prompt"); }}>Make another with the same prompt</button>
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
            <ConvergeBar progress={progress} state="error" label="STOPPED" etaOverride={`TOOK ${tookSec} S`} ariaLabel="Video stopped" />
          </div>

          <p className="vd-message" role="alert">{errorText} Your prompt is still saved.</p>
          <button type="button" className="vd-btn vd-btn-ink" onClick={() => void generate()}>Try again</button>
          <EngineRow title="Or try with" engines={engines} active={engineId} onPick={pickAnother} />
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
          <Chip key={e.id} active={e.id === active} onClick={() => onPick(e.id)}>{e.label}</Chip>
        ))}
      </div>
    </div>
  );
}
