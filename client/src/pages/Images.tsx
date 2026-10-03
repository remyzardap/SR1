import { useCallback, useEffect, useRef, useState } from "react";
import { SutaeruGlyph } from "@/components/SutaeruGlyph";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { AttachMenu } from "@/components/AttachMenu";
import { callFunction } from "@/lib/kemmaCloud";
import { getAuthToken } from "@/lib/authSession";
import { type Attachment } from "@/lib/attachments";
import { toast } from "sonner";
import "@/styles/engine-cards.css";

type EngineId = "gemini" | "qwen" | "openai" | "forge";
type Quality = "standard" | "high";
type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

interface Engine {
  id: EngineId;
  label: string;
  model: string;
  qualityModel: string;
  available: boolean;
  defaultEngine: boolean;
  /** Whether this engine can take reference photos. Engines that do not report it cannot. */
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
}

const RATIOS: Array<{ value: AspectRatio; label: string }> = [
  { value: "1:1", label: "Square" },
  { value: "4:3", label: "Landscape 4:3" },
  { value: "16:9", label: "Wide 16:9" },
  { value: "3:4", label: "Portrait 3:4" },
  { value: "9:16", label: "Tall 9:16" },
];

interface EngineMeta { blurb: string; tags: string[]; time: Record<Quality, string>; img?: string }

/** What each engine is good at, from side-by-side test renders. Unknown engines fall back to a plain card. */
const ENGINE_META: Record<string, EngineMeta> = {
  gemini: {
    blurb: "Fast and clean. Sharp lettering, and steady products and characters across images.",
    tags: ["Fast", "Lettering", "Consistent"],
    time: { standard: "10 to 17 s", high: "up to 70 s" },
    img: "/engines/gemini.jpg",
  },
  qwen: {
    blurb: "Crisp studio detail and natural light. Fine texture stays sharp.",
    tags: ["Detail", "Natural light"],
    time: { standard: "16 to 25 s", high: "20 to 40 s" },
    img: "/engines/qwen.jpg",
  },
  openai: {
    blurb: "Rich, cinematic and highly detailed. A strong pick for portraits and mood.",
    tags: ["Cinematic", "Portraits"],
    time: { standard: "13 to 35 s", high: "13 to 35 s" },
    img: "/engines/openai.jpg",
  },
  forge: {
    blurb: "Open Stable Diffusion models on our own GPU, started on demand. The first image can take a few minutes.",
    tags: ["Open models", "On demand"],
    time: { standard: "up to 5 min", high: "up to 5 min" },
  },
};
const FALLBACK_META: EngineMeta = { blurb: "Creates an image from your prompt.", tags: [], time: { standard: "10 to 60 s", high: "up to 70 s" } };

/** Abstract marks in the app's own icon style. Not vendor logos. */
function EngineMark({ id }: { id: string }) {
  const common = { viewBox: "0 0 96 96", fill: "none", stroke: "currentColor", strokeWidth: 6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "gemini") return <svg {...common}><circle cx="37" cy="48" r="21" /><circle cx="59" cy="48" r="21" /></svg>;
  if (id === "qwen") return <svg {...common}><path d="M16 64a32 32 0 0 1 64 0" /><path d="M29 64a19 19 0 0 1 38 0" /><path d="M42 64a6 6 0 0 1 12 0" /></svg>;
  if (id === "forge") return <svg {...common}><rect x="18" y="22" width="60" height="14" rx="7" /><rect x="18" y="41" width="60" height="14" rx="7" /><rect x="18" y="60" width="60" height="14" rx="7" /></svg>;
  if (id === "openai") return <svg {...common}><rect x="19" y="19" width="58" height="58" rx="17" /><circle cx="48" cy="48" r="12" /></svg>;
  return <svg {...common}><circle cx="48" cy="48" r="27" /></svg>;
}

const MAX_PROMPT = 2000;
const MAX_REFERENCE = 2;
const KEPT_RENDERS = 8;

/** The saved image lives behind the session gate, so fetch it with the same credentials as the API calls. */
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
  const [engines, setEngines] = useState<Engine[]>([]);
  const [enginesLoading, setEnginesLoading] = useState(true);
  const [enginesError, setEnginesError] = useState("");
  const [engine, setEngine] = useState<EngineId | "">("");
  const [quality, setQuality] = useState<Quality>("standard");
  const [ratio, setRatio] = useState<AspectRatio>("1:1");
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<Attachment[]>([]);
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [renders, setRenders] = useState<Render[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const nextId = useRef(1);
  const renderUrls = useRef<string[]>([]);

  const loadEngines = useCallback(async () => {
    setEnginesLoading(true);
    setEnginesError("");
    try {
      const data = await callFunction<{ engines: Engine[] }>("image", { action: "engines" });
      const usable = data.engines.filter((e) => e.available);
      setEngines(usable);
      setEngine((current) => current || usable.find((e) => e.defaultEngine)?.id || usable[0]?.id || "");
    } catch (err) {
      setEnginesError(err instanceof Error ? err.message : "Could not load the image engines.");
    } finally {
      setEnginesLoading(false);
    }
  }, []);

  useEffect(() => { void loadEngines(); }, [loadEngines]);

  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  // Free the object URLs when the page closes.
  useEffect(() => () => { renderUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const current = engines.find((e) => e.id === engine);
  const selected = renders.find((r) => r.id === selectedId) ?? renders[0];
  const canGenerate = !!current && prompt.trim().length > 0 && !generating;

  async function generate() {
    if (!current || !canGenerate) return;
    setGenerating(true);
    try {
      const text = prompt.trim();
      const result = await callFunction<GenerateResult>("image", {
        action: "generate",
        prompt: text,
        engine: current.id,
        quality,
        aspectRatio: ratio,
        ...(current.supportsReference && refs.length > 0 ? { referenceImages: refs } : {}),
      });
      const blob = await loadImageBlob(result.imageUrl);
      const blobUrl = URL.createObjectURL(blob);
      renderUrls.current.push(blobUrl);
      const id = nextId.current++;
      const ext = result.mimeType.includes("jpeg") ? "jpg" : "png";
      setRenders((prev) => {
        const next = [{ id, prompt: text, engine: current.label, model: result.model, width: result.width, height: result.height, blobUrl, filename: `${slug(text)}.${ext}` }, ...prev];
        for (const dropped of next.slice(KEPT_RENDERS)) {
          URL.revokeObjectURL(dropped.blobUrl);
          renderUrls.current = renderUrls.current.filter((u) => u !== dropped.blobUrl);
        }
        return next.slice(0, KEPT_RENDERS);
      });
      setSelectedId(id);
      toast.success("Image ready. It is also saved in My Files.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The image could not be created.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="sk-page h-full overflow-y-auto">
      <header className="sk-header">
        <div>
          <h1 className="sk-h1">Images</h1>
          <p className="sk-sub">
            Describe a picture and choose which engine draws it. Every image is saved to My Files.
          </p>
        </div>
        <div className="sk-actions">
          <button type="button" className="sk-btn" onClick={() => void generate()} disabled={!canGenerate}>
            {generating ? "Drawing..." : "Create image"}
          </button>
        </div>
      </header>

      {enginesLoading && (
        <div className="sk-card sk-empty">
          <span className="sk-label">Images</span>
          <p className="sk-empty-text">Loading image engines...</p>
        </div>
      )}

      {enginesError && (
        <div className="sk-card sk-empty">
          <span className="sk-label">Images</span>
          <p className="sk-empty-text">{enginesError}</p>
          <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm mt-3 self-start" onClick={() => void loadEngines()}>
            Try again
          </button>
        </div>
      )}

      {!enginesLoading && !enginesError && engines.length === 0 && (
        <div className="sk-card sk-empty">
          <span className="sk-label">Images</span>
          <p className="sk-empty-text">No image engine is set up on this server yet. Ask the owner to add an engine key.</p>
        </div>
      )}

      {!enginesLoading && !enginesError && engines.length > 0 && (
        <div className="sk-stack">
          <div className="sk-card flex flex-col gap-5">
            <div className="sk-field">
              <span className="sk-label">Engine</span>
              <div className="sk-engine-grid" role="radiogroup" aria-label="Image engine" style={{ ["--sk-cols" as string]: engines.length === 4 ? 2 : Math.max(1, Math.min(engines.length, 3)) } as React.CSSProperties}>
                {engines.map((e) => {
                  const meta = ENGINE_META[e.id] ?? FALLBACK_META;
                  const active = engine === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => { setEngine(e.id); if (!e.supportsReference) setRefs([]); }}
                      className={`sk-engine${active ? " is-active" : ""}`}
                    >
                      <span className="sk-engine-hero">
                        {meta.img ? (
                          <img src={meta.img} alt="" width={960} height={540} loading="lazy" decoding="async" />
                        ) : (
                          <span className="sk-engine-hero-empty"><SutaeruGlyph className="w-14" /></span>
                        )}
                        <span className="sk-engine-time sk-num">{meta.time[quality]}</span>
                        {active && (
                          <span className="sk-engine-check" aria-hidden="true">
                            <SutaeruIcon name="check" className="size-4" />
                          </span>
                        )}
                      </span>
                      <span className="sk-engine-body">
                        <span className="sk-engine-head">
                          <span className="sk-engine-mark" aria-hidden="true"><EngineMark id={e.id} /></span>
                          <span className="sk-engine-name">{e.label}</span>
                          <span className="sk-engine-kind">Image</span>
                        </span>
                        <span className="sk-engine-blurb">{meta.blurb}</span>
                        {meta.tags.length > 0 && (
                          <span className="sk-engine-tags">
                            {meta.tags.map((t) => <span key={t} className="sk-engine-tag">{t}</span>)}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sk-field">
              <span className="sk-label">Quality</span>
              <div className="sk-row" role="group" aria-label="Quality">
                {(["standard", "high"] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuality(q)}
                    aria-pressed={quality === q}
                    className={`sk-pill sk-pill-sm ${quality === q ? "is-active" : ""}`}
                    style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <p className="sk-empty-text">High uses the larger model and can take up to a minute.</p>
            </div>
          </div>

          {generating && (
            <div className="sk-card" role="status" aria-live="polite">
              <span className="sk-label">Generating</span>
              <p className="mt-2 text-[15px] leading-6" style={{ color: "var(--art-ink)" }}>
                Drawing your image.
              </p>
              <p className="sk-empty-text sk-num mt-1">{elapsed}s elapsed. This usually takes 10 to 70 seconds.</p>
            </div>
          )}

          {(generating || renders.length > 0) && (
            <div className="sk-grid" role="list" aria-label="Recent images">
              {generating && (
                <div className="sk-thumb" role="presentation">
                  <div className="sk-thumb-glyph">
                    <SutaeruGlyph className="w-16" />
                  </div>
                  <div className="sk-thumb-generating">
                    <span className="sk-dot" aria-hidden="true" />
                    Generating · {elapsed}s
                  </div>
                </div>
              )}
              {renders.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="listitem"
                  onClick={() => setSelectedId(r.id)}
                  aria-label={`Show image: ${r.prompt.slice(0, 60)}`}
                  className="sk-thumb block cursor-pointer border-0 p-0 text-left"
                  style={selected?.id === r.id ? { outline: "2px solid var(--art-ink)", outlineOffset: "3px" } : undefined}
                >
                  <img src={r.blobUrl} alt="" width={r.width} height={r.height} />
                  <span className="sk-thumb-bar">
                    {r.width && r.height ? `${r.width} x ${r.height}` : "Image"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!generating && !selected && (
            <div className="sk-card sk-empty">
              <span className="sk-label">Images</span>
              <p className="sk-empty-text">Your images will appear here.</p>
              <p className="sk-empty-text">Write a prompt, pick an engine and a shape, then press Create image.</p>
            </div>
          )}

          {!generating && selected && (
            <div className="sk-card flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="sk-tile-title line-clamp-2">{selected.prompt}</p>
                <p className="sk-meta sk-num mt-1">
                  {selected.width && selected.height ? `${selected.width} x ${selected.height}` : "Image"}
                </p>
              </div>
              <a href={selected.blobUrl} download={selected.filename} className="sk-btn sk-btn-ghost sk-btn-sm shrink-0">
                <SutaeruIcon name="download" className="size-4" /> Download
              </a>
            </div>
          )}

          <div className="sk-composer flex-wrap">
            <label htmlFor="image-prompt" className="sr-only">Prompt</label>
            <textarea
              id="image-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT))}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate(); }}
              rows={1}
              placeholder="A ceramic mug on a wooden table in soft morning light"
              className="min-w-0 flex-1 resize-none border-0 bg-transparent text-[15px] leading-6 outline-none text-[var(--art-ink)] placeholder:text-[var(--art-quiet)]"
            />
            <span className="sk-label sk-num whitespace-nowrap">{prompt.length} / {MAX_PROMPT}</span>
            <div className="sk-row" style={{ gap: 8 }} role="group" aria-label="Aspect ratio">
              {RATIOS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRatio(r.value)}
                  aria-pressed={ratio === r.value}
                  className={`sk-pill sk-pill-sm ${ratio === r.value ? "is-active" : ""}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="sk-send"
              onClick={() => void generate()}
              disabled={!canGenerate}
              aria-label={generating ? "Drawing..." : "Create image"}
            >
              <SutaeruIcon name="arrow" className="-rotate-90" />
            </button>
          </div>

          {current?.supportsReference ? (
            <div className="sk-card">
              <AttachMenu
                attachments={refs}
                onChange={setRefs}
                max={MAX_REFERENCE}
                imagesOnly
                disabled={generating}
                label="Reference photo"
              />
              <p className="sk-empty-text mt-3">Up to {MAX_REFERENCE} photos this engine should look at while it draws.</p>
            </div>
          ) : (
            <p className="sk-empty-text">This engine cannot use reference photos.</p>
          )}
        </div>
      )}
    </div>
  );
}
