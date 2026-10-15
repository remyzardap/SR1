import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
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
import { VideoScreen } from "@/components/video";
import { useFoldState } from "@/components/fold";

type Phase = "prompt" | "running" | "done" | "failed";

const MAX_PROMPT = 2000;
const MAX_REFERENCE = 1;
const SHAPES: Array<{ value: VideoAspectRatio; label: string; w: number; h: number }> = [
  { value: "16:9", label: "16:9", w: 34, h: 19 },
  { value: "9:16", label: "9:16", w: 19, h: 34 },
  { value: "1:1", label: "1:1", w: 26, h: 26 },
];
const STAGES: VideoJobState[] = ["QUEUED", "DRAWING", "SAVING"];

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

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "video";
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
    setRanWith({ label: `${engineName(current)} · ${quality === "high" ? "High" : "Standard"}`, prompt: text, ratio, duration });
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
    phase === "running" ? `${current ? engineName(current) : "The engine"} is filming your clip.`
    : phase === "done" ? "Ready, and saved to My Files."
    : phase === "failed" ? `${current ? engineName(current) : "The engine"} couldn't finish this one.`
    : "";
  const title = "Video";

  return (
    <VideoScreen
      phase={phase}
      engines={engines}
      enginesLoading={enginesLoading}
      enginesError={enginesError}
      engineId={engineId}
      onEngineChange={setEngineId}
      quality={quality}
      onQualityChange={setQuality}
      ratio={ratio}
      onRatioChange={setRatio}
      duration={duration}
      onDurationChange={setDuration}
      minDuration={minDur}
      maxDuration={maxDur}
      prompt={prompt}
      onPromptChange={setPrompt}
      maxPrompt={MAX_PROMPT}
      refs={refs}
      onRefsChange={setRefs}
      maxRefs={MAX_REFERENCE}
      supportsReference={current?.supportsReference ?? false}
      canCreate={canCreate}
      onCreate={generate}
      runningLabel={ranWith.label}
      runningProgress={progress}
      runningEta={eta}
      runningStage={stage}
      onCancel={cancel}
      ranWith={ranWith}
      videoUrl={videoUrl}
      filename={filename}
      tookSec={tookSec}
      onDownload={() => {}}
      onOpenFiles={() => {}}
      onTryAnotherEngine={pickAnother}
      onMakeAnother={() => { clearVideo(); setPhase("prompt"); }}
      errorText={errorText}
      onRetry={generate}
      availableEngines={engines}
      activeEngineId={engineId}
      folds={folds}
    />
  );
}

const ENGINE_META: Record<string, { blurb: string }> = {
  gemini: { blurb: "Natural motion and clean detail. Our quickest option." },
  openai: { blurb: "Cinematic and precise. Follows long prompts closely." },
  qwen: { blurb: "Crisp and true to the scene, with steady camera moves." },
  forge: { blurb: "Open models on our own GPU, started on demand. The first clip can take a few minutes." },
};
const FALLBACK_META: { blurb: string } = { blurb: "Turns your description into a short clip." };

const ENGINE_NAMES: Record<string, string> = { gemini: "Fast", openai: "Cinematic", qwen: "Crisp", forge: "GPU" };
const engineName = (e: { id: string; label: string }) => ENGINE_NAMES[e.id] ?? "Engine";