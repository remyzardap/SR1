import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { ImageRunScreen, type RunPicture } from "@/components/studio/ImageRunScreen";
import { StudioScreen, type RefPhoto } from "@/components/studio/StudioScreen";
import { useStudioForm } from "@/components/studio/useStudioForm";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { getAuthToken } from "@/lib/authSession";
import { type Attachment } from "@/lib/attachments";
import { callFunction } from "@/lib/kemmaCloud";
import type { Shot } from "@/lib/studio";
import {
  FALLBACK_ENGINES,
  engineBrief,
  estimate,
  phaseOf,
  type Engine,
  type EngineId,
  type Quality,
} from "@/lib/studioRun";

export type { AspectRatio } from "@/lib/studio";
export type { EngineId, Quality } from "@/lib/studioRun";

interface GenerateResult {
  engine: EngineId;
  model: string;
  mimeType: string;
  width?: number;
  height?: number;
  imageUrl: string;
}

interface Run {
  status: "running" | "done" | "stopped";
  engine: EngineId;
  quality: Quality;
  count: number;
  prompt: string;
  brief: string;
  shot: Shot;
  t0: number;
  secs: number;
  /** Progress when it stopped. */
  p0: number;
  took: number;
  pictures: RunPicture[];
  files: Array<{ href: string; name: string }>;
  pick: number;
  error: string | null;
}

const MAX_PROMPT = 2000;
const MAX_REFERENCE = 2;
/* The bar ramps over the engine's usual time and waits at the end for the real picture. */
const EST_MS = 900;
const HOLD = 0.94;

async function loadImageBlob(imageUrl: string): Promise<Blob> {
  const origin = import.meta.env.VITE_SR1_API_ORIGIN || "";
  const token = getAuthToken();
  const res = await fetch(imageUrl.startsWith("http") ? imageUrl : `${origin}${imageUrl}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error("The image was created but could not be loaded. Find it in My Files.");
  return res.blob();
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "image";
}

export default function Images() {
  useSeoMeta({ title: "Images", path: "/images" });
  const [, navigate] = useLocation();

  const [engines, setEngines] = useState<Engine[]>(FALLBACK_ENGINES);
  const available = useMemo(() => engines.map((e) => e.id), [engines]);
  const form = useStudioForm(available);
  const [refs, setRefs] = useState<Attachment[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const runId = useRef(0);
  const blobUrls = useRef<string[]>([]);
  const progressRef = useRef(0);

  useEffect(() => {
    let live = true;
    callFunction<{ engines: Engine[] }>("image", { action: "engines" })
      .then((data) => {
        const usable = data.engines.filter((e) => e.available);
        if (live && usable.length > 0) setEngines(usable);
      })
      .catch(() => {
        /* Offline or signed out in a preview: the sample engines stay. */
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(
    () => () => {
      runId.current++;
      blobUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  /* Progress for the running picture, from the engine's usual time. */
  const running = run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [running]);

  let progress = 0;
  if (run?.status === "done") progress = 1;
  else if (run?.status === "stopped") progress = run.p0;
  else if (run) {
    const dur = Math.max(9000, run.secs * 1000);
    progress = Math.min(HOLD, Math.max(0, (now - run.t0 - EST_MS) / dur));
    progressRef.current = progress;
  }
  const etaSeconds = run && run.status === "running" ? ((1 - progress) * Math.max(9000, run.secs * 1000)) / 1000 : null;

  const refPhotos: RefPhoto[] = refs.flatMap((r) => (r.source === "device" ? [{ name: r.filename, src: r.dataUrl }] : []));
  const addRefs = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return;
    Array.from(list).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const dataUrl = reader.result;
        setRefs((prev) =>
          prev.length >= MAX_REFERENCE ? prev : [...prev, { source: "device" as const, filename: file.name, mediaType: file.type || "image/jpeg", dataUrl }],
        );
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const current = engines.find((e) => e.id === form.engine) ?? engines[0];

  async function begin(over?: { engine?: EngineId; count?: number }) {
    const text = form.prompt.trim();
    if (!text) {
      toast("Write a prompt first.");
      return;
    }
    const engine = over?.engine ?? form.engine;
    const count = over?.count ?? form.count;
    const target = engines.find((e) => e.id === engine) ?? current;
    const brief = engineBrief(text, form.shot, form.directionOn);
    const id = ++runId.current;
    const t0 = Date.now();
    setNow(t0);
    progressRef.current = 0;
    setRun({
      status: "running", engine, quality: form.quality, count, prompt: text, brief, shot: form.shot,
      t0, secs: estimate(engine, form.quality, count).secs, p0: 0, took: 0, pictures: [], files: [], pick: 0, error: null,
    });
    const quality = form.quality;
    const shot = form.shot;
    const references = target.supportsReference && refs.length > 0 ? { referenceImages: refs } : {};

    try {
      const settled = await Promise.allSettled(
        Array.from({ length: count }, async () => {
          const result = await callFunction<GenerateResult>("image", {
            action: "generate",
            prompt: brief,
            engine,
            quality,
            aspectRatio: shot.ratio,
            ...references,
          });
          return { result, blob: await loadImageBlob(result.imageUrl) };
        }),
      );
      if (id !== runId.current) return;
      const made = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
      if (made.length === 0) {
        const first = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
        throw first?.reason instanceof Error ? first.reason : new Error("The image could not be created.");
      }
      const files = made.map(({ result, blob }, i) => {
        const href = URL.createObjectURL(blob);
        blobUrls.current.push(href);
        const ext = result.mimeType.includes("jpeg") ? "jpg" : "png";
        return { href, name: `${slug(text)}${made.length > 1 ? `-${i + 1}` : ""}.${ext}` };
      });
      const took = Math.max(1, Math.round((Date.now() - t0) / 1000));
      setRun((cur) =>
        cur && id === runId.current
          ? {
              ...cur, status: "done", took, files, pick: 0,
              pictures: files.map((f, i) => ({ id: f.href, src: f.href, shot, alt: `${text} (picture ${i + 1})` })),
            }
          : cur,
      );
      toast.success("Image ready. It is also saved in My Files.");
    } catch (err) {
      if (id !== runId.current) return;
      const msg = err instanceof Error ? err.message : "The image could not be created.";
      setRun((cur) => (cur ? { ...cur, status: "stopped", p0: progressRef.current, error: msg } : cur));
      toast.error(msg);
    }
  }

  function cancel() {
    runId.current++;
    setRun((cur) => (cur ? { ...cur, status: "stopped", p0: progressRef.current, error: null } : cur));
    toast("Generation cancelled.");
  }

  if (!run) {
    return (
      <StudioScreen
        shot={form.shot}
        onPick={form.pick}
        prompt={form.prompt}
        onPrompt={(v) => form.setPrompt(v.slice(0, MAX_PROMPT))}
        maxPrompt={MAX_PROMPT}
        label={form.label}
        vf={form.vf}
        onVf={form.setVf}
        grid={form.grid}
        onGrid={form.setGrid}
        directionOn={form.directionOn}
        onDirection={form.changeDirection}
        engines={engines}
        engine={form.engine}
        suggested={form.suggested}
        why={form.why}
        onEngine={form.setEngine}
        quality={form.quality}
        onQuality={form.setQuality}
        count={form.count}
        onCount={form.setCount}
        refs={refPhotos}
        maxRefs={MAX_REFERENCE}
        onAddRefs={addRefs}
        onRemoveRef={(i) => setRefs((prev) => prev.filter((_, idx) => idx !== i))}
        onBegin={() => void begin()}
        canBegin={form.prompt.trim().length > 0}
        onBack={() => navigate("/generate")}
        backLabel="Create"
      />
    );
  }

  const pictures: RunPicture[] = run.pictures.length ? run.pictures : [{ id: "preview", shot: run.shot, alt: run.prompt }];
  const file = run.files[run.pick];
  const { credits } = estimate(run.engine, run.quality, run.count);

  return (
    <ImageRunScreen
      status={run.status}
      engine={run.engine}
      quality={run.quality}
      count={run.count}
      prompt={run.prompt}
      shot={run.shot}
      progress={progress}
      phase={phaseOf(progress, now - run.t0 > EST_MS)}
      etaSeconds={etaSeconds}
      took={run.took}
      creditsText={`${credits} credits`}
      pictures={pictures}
      pick={run.pick}
      onPick={(i) => setRun((cur) => (cur ? { ...cur, pick: i } : cur))}
      stopReason={run.error}
      engines={engines}
      onCancel={cancel}
      onRetry={() => void begin({ engine: run.engine, count: run.count })}
      onBackToStudio={() => {
        if (run.status === "running") cancel();
        setRun(null);
      }}
      onEngine={(id) => void begin({ engine: id, count: run.count })}
      onVariations={() => void begin({ engine: run.engine, count: 4 })}
      onEdit={() => navigate("/documents?start=edit")}
      downloadHref={file?.href}
      downloadName={file?.name}
    />
  );
}
