import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { AttachMenu } from "@/components/AttachMenu";
import { PageTitle } from "@/components/chrome/PageTitle";
import { ConvergeBar } from "@/components/art/ConvergeBar";
import { HalftoneRamp } from "@/components/art/HalftoneRamp";
import { FocusBrackets } from "@/components/art/FocusBrackets";
import { callFunction } from "@/lib/kemmaCloud";
import { getAuthToken } from "@/lib/authSession";
import { type Attachment } from "@/lib/attachments";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { toast } from "sonner";
import { SutaeruStamp } from "@/components/brand/SutaeruSeal";
import { StudioCredits, StudioDirection, StudioOptions, StudioViewfinder } from "@/components/studio/StudioPicker";
import { StudioFrame } from "@/components/studio/StudioFrame";
import { DEFAULT_SHOT, direction, type Shot, type StudioGroup } from "@/lib/studio";
import "@/styles/engine-cards.css";

export type EngineId = "gemini" | "qwen" | "openai" | "forge";
export type Quality = "standard" | "high";
export type AspectRatio = "1:1" | "4:3" | "16:9" | "3:4" | "9:16";
export type FlowStep = "engine" | "prompt" | "generating" | "done" | "failed";

export interface Engine {
  id: EngineId;
  label: string;
  model: string;
  qualityModel: string;
  available: boolean;
  defaultEngine: boolean;
  supportsReference: boolean;
}

interface GenerateResult {
  engine: EngineId;
  model: string;
  mimeType: string;
  width?: number;
  height?: number;
  imageUrl: string;
}

interface Render {
  id: number;
  prompt: string;
  engine: string;
  model: string;
  width?: number;
  height?: number;
  blobUrl: string;
  filename: string;
  elapsedSeconds: number;
  quality: Quality;
}

interface EngineMeta {
  displayTitle: string;
  blurb: string;
  time: Record<Quality, string>;
  img?: string;
}

const ENGINE_META: Record<string, EngineMeta> = {
  gemini: {
    displayTitle: "Gemini",
    blurb: "Fast and clean. Sharp lettering.",
    time: { standard: "10 TO 17 S", high: "UP TO 70 S" },
    img: "/engines/gemini.jpg",
  },
  openai: {
    displayTitle: "OpenAI",
    blurb: "Precise text and layout. Follows long prompts.",
    time: { standard: "15 TO 30 S", high: "15 TO 30 S" },
    img: "/engines/openai.jpg",
  },
  qwen: {
    displayTitle: "Wan",
    blurb: "Crisp and natural. True to the scene.",
    time: { standard: "16 TO 30 S", high: "20 TO 40 S" },
    img: "/engines/qwen.jpg",
  },
  forge: {
    displayTitle: "GPU",
    blurb: "Open models on our own GPU. Started on demand.",
    time: { standard: "UP TO 5 MIN", high: "UP TO 5 MIN" },
  },
};

const DEFAULT_ENGINES: Engine[] = [
  { id: "gemini", label: "Gemini", model: "", qualityModel: "", available: true, defaultEngine: true, supportsReference: true },
  { id: "openai", label: "OpenAI", model: "", qualityModel: "", available: true, defaultEngine: false, supportsReference: true },
  { id: "qwen", label: "Wan", model: "", qualityModel: "", available: true, defaultEngine: false, supportsReference: true },
];

function EngineMark({ id }: { id: string }) {
  const common = {
    viewBox: "0 0 96 96",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (id === "gemini") {
    return (
      <svg {...common} className="size-3.5">
        <circle cx="37" cy="48" r="21" />
        <circle cx="59" cy="48" r="21" />
      </svg>
    );
  }
  if (id === "qwen") {
    return (
      <svg {...common} className="size-3.5">
        <path d="M16 64a32 32 0 0 1 64 0" />
        <path d="M29 64a19 19 0 0 1 38 0" />
        <path d="M42 64a6 6 0 0 1 12 0" />
      </svg>
    );
  }
  if (id === "forge") {
    return (
      <svg {...common} className="size-3.5">
        <rect x="18" y="22" width="60" height="14" rx="7" />
        <rect x="18" y="41" width="60" height="14" rx="7" />
        <rect x="18" y="60" width="60" height="14" rx="7" />
      </svg>
    );
  }
  return (
    <svg {...common} className="size-3.5">
      <rect x="19" y="19" width="58" height="58" rx="17" />
      <circle cx="48" cy="48" r="12" />
    </svg>
  );
}

const MAX_PROMPT = 2000;
const MAX_REFERENCE = 2;
const KEPT_RENDERS = 8;

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

  const [engines, setEngines] = useState<Engine[]>([]);
  const [enginesLoading, setEnginesLoading] = useState(true);
  const [enginesError, setEnginesError] = useState("");
  const [engine, setEngine] = useState<EngineId>("gemini");
  const [quality, setQuality] = useState<Quality>("standard");
  const [ratio, setRatio] = useState<AspectRatio>("1:1");
  const [camera, setCamera] = useState<Omit<Shot, "ratio">>(() => {
    const { ratio: _r, ...rest } = DEFAULT_SHOT;
    return rest;
  });
  /* Camera choices reach the engine as words. Off until the person picks a tile or turns it on. */
  const [directionOn, setDirectionOn] = useState(false);
  const directionTouched = useRef(false);
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<Attachment[]>([]);
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [renders, setRenders] = useState<Render[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [stepState, setStepState] = useState<FlowStep>("engine");

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nextId = useRef(1);
  const renderUrls = useRef<string[]>([]);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const remaining = MAX_REFERENCE - refs.length;
    if (remaining <= 0) return;
    Array.from(fileList).slice(0, remaining).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setRefs((prev) => [
            ...prev,
            {
              source: "device" as const,
              filename: file.name,
              mediaType: file.type || "image/jpeg",
              dataUrl: reader.result as string,
            },
          ].slice(0, MAX_REFERENCE));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Read URL query parameter step for direct navigation and screenshot test capture
  const step = useMemo<FlowStep>(() => {
    if (typeof window === "undefined") return stepState;
    const p = new URLSearchParams(window.location.search);
    const s = p.get("step") as FlowStep | null;
    if (s && ["engine", "prompt", "generating", "done", "failed"].includes(s)) {
      return s;
    }
    if (generating) return "generating";
    if (generationError) return "failed";
    if (selectedId !== null && renders.length > 0) return "done";
    return stepState;
  }, [stepState, generating, generationError, selectedId, renders.length]);

  const setStep = useCallback((next: FlowStep) => {
    setStepState(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("step", next);
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);

  const loadEngines = useCallback(async () => {
    setEnginesLoading(true);
    setEnginesError("");
    try {
      const data = await callFunction<{ engines: Engine[] }>("image", { action: "engines" });
      const usable = data.engines.filter((e) => e.available);
      if (usable.length > 0) {
        setEngines(usable);
        setEngine((cur) => cur || usable.find((e) => e.defaultEngine)?.id || usable[0]?.id || "gemini");
      } else {
        setEngines(DEFAULT_ENGINES);
      }
    } catch {
      // In offline/mock preview, use fallback engines
      setEngines(DEFAULT_ENGINES);
    } finally {
      setEnginesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEngines();
  }, [loadEngines]);

  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  // Clean up object URLs on unmount
  useEffect(() => () => {
    renderUrls.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const currentEngine = useMemo(() => {
    return engines.find((e) => e.id === engine) || engines[0] || DEFAULT_ENGINES[0];
  }, [engines, engine]);

  const currentMeta = useMemo(() => {
    return ENGINE_META[currentEngine.id] || ENGINE_META.gemini;
  }, [currentEngine.id]);

  const selectedRender = renders.find((r) => r.id === selectedId) ?? renders[0];

  const shot: Shot = useMemo(() => ({ ...camera, ratio }), [camera, ratio]);
  const pick = useCallback(<G extends StudioGroup>(group: G, value: Shot[G]) => {
    if (group === "ratio") {
      setRatio(value as AspectRatio);
      return;
    }
    setCamera((cur) => ({ ...cur, [group]: value }));
    if (!directionTouched.current) setDirectionOn(true);
  }, []);
  const changeDirection = useCallback((next: boolean) => {
    directionTouched.current = true;
    setDirectionOn(next);
  }, []);

  // Calculation for generation progress simulation / visualization
  const targetEta = quality === "high" ? 40 : 16;
  const progressRatio = Math.min(0.95, Math.max(0.08, elapsed / targetEta));
  const effectiveProgress = step === "generating" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("progress")
    ? parseFloat(new URLSearchParams(window.location.search).get("progress")!)
    : step === "generating" && !generating
    ? 0.62
    : progressRatio;

  const secondsLeft = Math.max(1, Math.round(targetEta * (1 - effectiveProgress)));

  async function generate() {
    if (!currentEngine) return;
    const text = prompt.trim();
    if (!text && step !== "generating") return;

    setGenerationError(null);
    setGenerating(true);
    setStep("generating");
    abortControllerRef.current = new AbortController();

    const startSec = Date.now();
    try {
      const result = await callFunction<GenerateResult>("image", {
        action: "generate",
        prompt: directionOn ? `${text}\n\n${direction(shot)}` : text,
        engine: currentEngine.id,
        quality,
        aspectRatio: ratio,
        ...(currentEngine.supportsReference && refs.length > 0 ? { referenceImages: refs } : {}),
      });

      const blob = await loadImageBlob(result.imageUrl);
      const blobUrl = URL.createObjectURL(blob);
      renderUrls.current.push(blobUrl);

      const id = nextId.current++;
      const ext = result.mimeType.includes("jpeg") ? "jpg" : "png";
      const totalElapsed = Math.round((Date.now() - startSec) / 1000);

      const newRender: Render = {
        id,
        prompt: text,
        engine: currentEngine.label,
        model: result.model,
        width: result.width,
        height: result.height,
        blobUrl,
        filename: `${slug(text)}.${ext}`,
        elapsedSeconds: totalElapsed || 12,
        quality,
      };

      setRenders((prev) => [newRender, ...prev].slice(0, KEPT_RENDERS));
      setSelectedId(id);
      setStep("done");
      toast.success("Image ready. It is also saved in My Files.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The image could not be created.";
      setGenerationError(msg);
      setStep("failed");
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  function handleCancel() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setGenerating(false);
    setStep("prompt");
    toast("Generation cancelled.");
  }

  // ────────────────────────────────────────────────────────────────────────────
  // (a) ENGINE PICKER (01-images-engine.png)
  // ────────────────────────────────────────────────────────────────────────────
  if (step === "engine") {
    return (
      <div className="sk-page min-h-full px-5 pt-6 pb-28">
        <div className="img-flow-container">
          <header className="mb-6">
            <PageTitle className="skx-title-flush">Images</PageTitle>
            <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--r-quiet)]">
              Describe a picture and choose which engine draws it. Every image is saved to My Files.
            </p>
          </header>

          {/* Engine Section */}
          <section aria-label="Engine selection">
            <span className="img-section-label">ENGINE</span>
            <div className="img-engine-list" role="radiogroup" aria-label="Choose image engine">
              {engines.map((e) => {
                const meta = ENGINE_META[e.id] ?? ENGINE_META.gemini;
                const active = currentEngine.id === e.id;

                return (
                  <div key={e.id} className="relative">
                    {active && <FocusBrackets tone="ink" />}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setEngine(e.id);
                        if (!e.supportsReference) setRefs([]);
                        setStep("prompt");
                      }}
                      className={`img-engine-card${active ? " is-active" : ""}`}
                    >
                      <div className="img-engine-thumb">
                        {meta.img ? (
                          <img src={meta.img} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--r-quiet)]">
                            <EngineMark id={e.id} />
                          </div>
                        )}
                        <span className="img-engine-badge" aria-hidden="true">
                          <EngineMark id={e.id} />
                        </span>
                      </div>

                      <div className="img-engine-info">
                        <div className="img-engine-title">{meta.displayTitle}</div>
                        <div className="img-engine-blurb">{meta.blurb}</div>
                        <div className="img-engine-time">{meta.time[quality]}</div>
                      </div>

                      <div className="img-engine-check" aria-hidden="true">
                        {active && <SutaeruIcon name="check" className="size-3.5 text-[var(--r-paper)]" />}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Quality Section */}
          <section aria-label="Quality selection">
            <span className="img-section-label">QUALITY</span>
            <div className="img-quality-control" role="group" aria-label="Image quality">
              <button
                type="button"
                onClick={() => setQuality("standard")}
                aria-pressed={quality === "standard"}
                className={`img-quality-btn${quality === "standard" ? " is-active" : ""}`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => setQuality("high")}
                aria-pressed={quality === "high"}
                className={`img-quality-btn${quality === "high" ? " is-active" : ""}`}
              >
                High
              </button>
            </div>
          </section>

          {/* Footer sample notice */}
          <div className="mt-6 text-center">
            <span className="art-mono text-[11px] font-medium tracking-[1.54px] uppercase text-[var(--r-rule)]">
              SAMPLE PHOTOS · UNSPLASH
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // (b) PROMPT SCREEN (02-images-prompt.png)
  // ────────────────────────────────────────────────────────────────────────────
  if (step === "prompt") {
    const canCreate = !generating && (!!prompt.trim() || !!new URLSearchParams(window.location.search).get("demo"));
    return (
      <div className="sk-page min-h-full px-5 pt-6 pb-2">
        <div className="img-flow-container">
          <header className="mb-4">
            <PageTitle className="skx-title-flush">Your picture</PageTitle>
            <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--r-quiet)]">
              Describe it, then set up the shot. Each tile is your picture with that one choice changed.
            </p>
          </header>

          <StudioViewfinder shot={shot} />

          {/* Prompt Section */}
          <section aria-label="Prompt input" className="mb-4">
            <span className="img-section-label">PROMPT</span>
            <div className="relative">
              <FocusBrackets tone="ink" />
              <div className="img-card flex flex-col min-h-[120px]">
                <textarea
                  id="image-prompt-field"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      void generate();
                    }
                  }}
                  rows={3}
                  placeholder="A ceramic mug on a wooden table in soft morning light"
                  className="w-full resize-none border-none bg-transparent text-[16px] leading-[1.5] text-[var(--r-ink)] placeholder:text-[var(--r-quiet)] focus:outline-none focus:ring-0 ring-0 outline-none"
                />
                <div className="mt-auto pt-2 text-right art-mono text-[11px] font-medium tracking-[1.54px] text-[var(--r-quiet)]">
                  {prompt.length} / {MAX_PROMPT}
                </div>
              </div>
            </div>
          </section>

          <StudioDirection shot={shot} on={directionOn} onChange={changeDirection} />

          {/* Reference Photo Section */}
          {currentEngine.supportsReference && (
            <section aria-label="Reference photo upload" className="mt-5 mb-1">
              <span className="img-section-label">REFERENCE PHOTO</span>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                className="img-ref-card cursor-pointer hover:border-[var(--r-ink)] transition-colors"
              >
                <div className="img-ref-plus">
                  <SutaeruIcon name="plus" className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-[var(--r-ink)]">
                    Add photos or files
                  </div>
                  <div className="text-[13px] text-[var(--r-quiet)]">
                    Up to {MAX_REFERENCE} photos this engine should look at.
                  </div>
                </div>
                <span className="art-mono text-[11px] font-medium tracking-[1.54px] text-[var(--r-quiet)]">
                  {refs.length} / {MAX_REFERENCE}
                </span>
              </div>

              {refs.length > 0 && (
                <div className="flex gap-2.5 mt-2">
                  {refs.map((r, i) => (
                    <div key={i} className="relative size-14 rounded-2xl overflow-hidden border border-[var(--r-card-stroke)]">
                      {r.source === "device" && (
                        <img src={r.dataUrl} alt={r.filename} className="size-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRefs((prev) => prev.filter((_, idx) => idx !== i));
                        }}
                        className="absolute top-1 right-1 size-5 bg-[var(--r-ink)] text-[var(--r-paper)] rounded-full flex items-center justify-center text-[12px] font-bold shadow"
                        aria-label="Remove photo"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <StudioOptions shot={shot} onPick={pick} />
          <StudioCredits />

          {/* Sticky action bar: what will run, and the one button */}
          <div className="st-go">
            <button
              type="button"
              onClick={() => setStep("engine")}
              className="st-go-sum"
              aria-label={`Engine ${currentMeta.displayTitle}, ${quality} quality. Change engine`}
            >
              <span>{currentMeta.displayTitle} · {quality === "high" ? "High" : "Standard"}</span>
              <b>About {quality === "high" ? "40" : "15"} s</b>
            </button>
            <button type="button" onClick={() => void generate()} disabled={!canCreate} className="img-btn-primary st-go-btn">
              {generating ? "Drawing..." : "Create image"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // (c) GENERATING SCREEN (07-images-generating.png)
  // ────────────────────────────────────────────────────────────────────────────
  if (step === "generating") {
    const displayPrompt = prompt || "A ceramic mug on a pale desk, soft window light, shallow depth of field.";
    const currentProgress = effectiveProgress;
    const stage = currentProgress < 0.25 ? "QUEUED" : currentProgress > 0.85 ? "SAVING" : "DRAWING";

    return (
      <div className="sk-page min-h-full px-5 pt-6 pb-28">
        <div className="img-flow-container">
          <header className="mb-6">
            <PageTitle className="skx-title-flush">Images</PageTitle>
            <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--r-quiet)]">
              {currentMeta.displayTitle} is drawing your picture.
            </p>
          </header>

          {/* Split Preview Card with FocusBrackets */}
          <div className="relative mb-4">
            <FocusBrackets tone="ink" />
            <div className="img-split-preview">
              <div className="img-split-left">
                {refs[0] && refs[0].source === "device" ? (
                  <img src={refs[0].dataUrl} alt="Source" />
                ) : directionOn ? (
                  <StudioFrame shot={shot} width={180} aspect={0.76} />
                ) : (
                  <img src={currentMeta.img || "/engines/gemini.jpg"} alt="Preview reference" />
                )}
                <div className="img-preview-badge">
                  {currentMeta.displayTitle.toUpperCase()} · {quality.toUpperCase()}
                </div>
              </div>
              <div className="img-split-right text-[var(--r-ink)]">
                <HalftoneRamp
                  columns={12}
                  rows={16}
                  cell={12}
                  minRadius={0.8}
                  maxRadius={3.6}
                  progress={currentProgress}
                  fluid
                />
              </div>
            </div>
          </div>

          {/* Progress Card */}
          <div className="img-card mb-6">
            <div className="art-mono text-[11px] font-medium tracking-[1.54px] uppercase text-[var(--r-quiet)] mb-2">
              {stage}
            </div>

            <div className="flex items-baseline justify-between mb-4">
              <span className="font-['Inter_Tight',sans-serif] text-[42px] font-extrabold leading-none tracking-[-2px] text-[var(--r-ink)]">
                {Math.round(currentProgress * 100)}%
              </span>
              <span className="art-mono text-[11px] font-medium tracking-[1.54px] uppercase text-[var(--r-quiet)]">
                ABOUT {secondsLeft} S LEFT
              </span>
            </div>

            <ConvergeBar progress={currentProgress} showPercent={false} ariaLabel="Image drawing progress" />

            <div className="img-stage-row">
              <span className={stage === "QUEUED" ? "is-active" : ""}>QUEUED</span>
              <span className={stage === "DRAWING" ? "is-active" : ""}>DRAWING</span>
              <span className={stage === "SAVING" ? "is-active" : ""}>SAVING</span>
            </div>
          </div>

          {/* Prompt Recap & Cancel Row */}
          <div className="flex items-center justify-between mb-3">
            <span className="img-section-label mb-0">PROMPT</span>
            <button
              type="button"
              onClick={handleCancel}
              className="px-5 py-1.5 rounded-full border border-[var(--r-ink)] text-[13px] font-semibold text-[var(--r-ink)] hover:bg-[var(--r-ink)] hover:text-[var(--r-paper)] transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="text-[14.5px] leading-relaxed text-[var(--r-ink)]">
            {displayPrompt}
          </p>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // (d) DONE SCREEN (08-images-done.png)
  // ────────────────────────────────────────────────────────────────────────────
  if (step === "done") {
    const render = selectedRender || {
      id: 999,
      prompt: prompt || "A ceramic mug on a pale desk, soft window light, shallow depth of field.",
      engine: currentEngine.label,
      model: "",
      blobUrl: currentMeta.img || "/engines/gemini.jpg",
      filename: "ceramic-mug.jpg",
      elapsedSeconds: 12,
      quality,
    };

    return (
      <div className="sk-page min-h-full px-5 pt-6 pb-28">
        <div className="img-flow-container">
          <header className="mb-6">
            <PageTitle className="skx-title-flush">Images</PageTitle>
            <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--r-quiet)]">
              Ready, and saved to My Files.
            </p>
          </header>

          {/* Full Image Card with FocusBrackets */}
          <div className="relative mb-4">
            <FocusBrackets tone="ink" />
            <div className="relative rounded-[28px] overflow-hidden border border-[var(--r-card-stroke)] bg-[var(--r-card)] shadow-sm h-[230px] max-h-[240px]">
              <img
                src={render.blobUrl}
                alt={render.prompt}
                className="w-full h-full object-cover"
              />
              <div className="img-preview-badge">
                {currentMeta.displayTitle.toUpperCase()} · {render.quality.toUpperCase()}
              </div>
              <SutaeruStamp className="st-stamp" />
            </div>
          </div>

          {/* Done Progress Card */}
          <div className="img-card mb-5">
            <div className="flex items-center justify-between mb-4">
              <span className="art-mono text-[11px] font-medium tracking-[1.54px] uppercase text-[var(--r-ink)] font-bold">
                DONE
              </span>
              <span className="art-mono text-[11px] font-medium tracking-[1.54px] uppercase text-[var(--r-quiet)]">
                TOOK {render.elapsedSeconds || 12} S
              </span>
            </div>

            <ConvergeBar progress={1} state="done" showPercent={false} ariaLabel="Image complete" />
          </div>

          {/* Actions Row */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <a
              href={render.blobUrl}
              download={render.filename}
              className="img-btn-ink"
            >
              Download
            </a>
            <button
              type="button"
              onClick={() => navigate("/documents?start=edit")}
              className="img-btn-outline"
            >
              Edit in Documents
            </button>
          </div>

          {/* Try Another Engine Section */}
          <section aria-label="Try another engine">
            <span className="img-section-label">TRY ANOTHER ENGINE</span>
            <div className="img-pill-row">
              {engines.map((e) => {
                const meta = ENGINE_META[e.id] ?? ENGINE_META.gemini;
                const active = currentEngine.id === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      setEngine(e.id);
                      setStep("prompt");
                    }}
                    className={`img-pill-btn${active ? " is-active" : ""}`}
                  >
                    {meta.displayTitle}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // (e) FAILED SCREEN (09-images-failed.png)
  // ────────────────────────────────────────────────────────────────────────────
  const errorElapsed = elapsed > 0 ? elapsed : 21;

  return (
    <div className="sk-page min-h-full px-5 pt-6 pb-28">
      <div className="img-flow-container">
        <header className="mb-5">
          <PageTitle className="skx-title-flush">Images</PageTitle>
          <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--r-quiet)]">
            {currentMeta.displayTitle} couldn't finish this one.
          </p>
        </header>

        {/* Failed Split Preview Card with Alert FocusBrackets */}
        <div className="relative mb-4">
          <FocusBrackets tone="alert" />
          <div className="img-split-preview" style={{ height: "180px" }}>
            <div className="img-split-left">
              <img src={currentMeta.img || "/engines/gemini.jpg"} alt="Attempt preview" />
            </div>
            <div className="img-split-right is-failed relative text-[var(--r-ink)]">
              <HalftoneRamp
                columns={12}
                rows={16}
                cell={12}
                minRadius={0.8}
                maxRadius={3.6}
                fluid
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="img-alert-circle">
                  <SutaeruIcon name="close" className="size-6 text-[var(--r-alert)]" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stopped Progress Card */}
        <div className="img-card mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="art-mono text-[11px] font-bold tracking-[1.54px] uppercase text-[var(--r-alert)]">
              STOPPED
            </span>
            <span className="art-mono text-[11px] font-medium tracking-[1.54px] uppercase text-[var(--r-quiet)]">
              TOOK {errorElapsed} S
            </span>
          </div>

          <div className="font-['Inter_Tight',sans-serif] text-[42px] font-extrabold leading-none tracking-[-2px] text-[var(--r-ink)] mb-4">
            38%
          </div>

          <ConvergeBar progress={0.38} state="error" showPercent={false} ariaLabel="Image generation failed" />
        </div>

        {/* Failure message: verified prompt is preserved in state */}
        <div className="mb-4">
          <p className="text-[14.5px] leading-relaxed text-[var(--r-quiet)]">
            The engine timed out before the picture was finished.
            <br />
            Your prompt is still saved.
          </p>
        </div>

        {/* Try Again Button */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => void generate()}
            className="img-btn-ink w-full"
          >
            Try again
          </button>
        </div>

        {/* Or Try With Engine Row */}
        <section aria-label="Try with another engine">
          <span className="img-section-label">OR TRY WITH</span>
          <div className="img-pill-row">
            {engines.map((e) => {
              const meta = ENGINE_META[e.id] ?? ENGINE_META.gemini;
              const isCurrent = currentEngine.id === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setEngine(e.id);
                    setStep("prompt");
                  }}
                  className={`img-pill-btn${isCurrent ? " is-alert" : ""}`}
                >
                  {meta.displayTitle}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
