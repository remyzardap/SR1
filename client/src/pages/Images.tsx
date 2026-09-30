import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callFunction } from "@/lib/kemmaCloud";
import { getAuthToken } from "@/lib/authSession";
import { toast } from "sonner";

type EngineId = "gemini" | "qwen" | "openai";
type Quality = "standard" | "high";
type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

interface Engine {
  id: EngineId;
  label: string;
  model: string;
  qualityModel: string;
  available: boolean;
  defaultEngine: boolean;
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

const MAX_PROMPT = 2000;
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
    <div className="sutaeru-editorial-page mx-auto max-w-4xl px-3 py-6 sm:px-4 sm:py-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <ImageIcon className="size-5" aria-hidden="true" /> Images
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe a picture and choose which engine draws it. Every image is saved to My Files.
        </p>
      </header>

      {enginesLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading image engines...
        </p>
      )}

      {enginesError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p>{enginesError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadEngines()}>Try again</Button>
        </div>
      )}

      {!enginesLoading && !enginesError && engines.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No image engine is set up on this server yet. Ask the owner to add an engine key.
        </p>
      )}

      {!enginesLoading && !enginesError && engines.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="glass-card flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="image-prompt" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prompt</label>
              <textarea
                id="image-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT))}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate(); }}
                rows={6}
                placeholder="A ceramic mug on a wooden table in soft morning light"
                className="input-glass w-full resize-y px-3 py-2.5 text-sm outline-none"
              />
              <p className="text-right text-xs text-muted-foreground tabular-nums">{prompt.length} / {MAX_PROMPT}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Engine</span>
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Image engine">
                {engines.map((e) => (
                  <button
                    key={e.id}
                    role="radio"
                    aria-checked={engine === e.id}
                    onClick={() => setEngine(e.id)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${engine === e.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent/40"}`}
                  >
                    <span className="block text-sm font-medium text-foreground">{e.label}</span>
                    <span className="block text-xs text-muted-foreground">{quality === "high" ? e.qualityModel : e.model}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quality</span>
              <div className="flex w-fit rounded-full border border-border p-0.5" role="group" aria-label="Quality">
                {(["standard", "high"] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    aria-pressed={quality === q}
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${quality === q ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">High uses the larger model and can take up to a minute.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shape</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Aspect ratio">
                {RATIOS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRatio(r.value)}
                    aria-pressed={ratio === r.value}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${ratio === r.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent/40"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={() => void generate()} disabled={!canGenerate} className="gap-1.5">
              {generating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-4" aria-hidden="true" />}
              {generating ? "Drawing..." : "Create image"}
            </Button>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {generating && (
              <div className="glass-card flex flex-col items-center gap-2 p-8 text-center" role="status" aria-live="polite">
                <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-foreground">{current?.label} is drawing your image.</p>
                <p className="text-xs text-muted-foreground tabular-nums">{elapsed}s elapsed. This usually takes 10 to 70 seconds.</p>
              </div>
            )}

            {!generating && !selected && (
              <div className="glass-card p-10 text-center">
                <p className="text-sm text-foreground">Your images will appear here.</p>
                <p className="mt-1 text-xs text-muted-foreground">Write a prompt, pick an engine and a shape, then press Create image.</p>
              </div>
            )}

            {!generating && selected && (
              <figure className="glass-card overflow-hidden">
                <img
                  src={selected.blobUrl}
                  alt={selected.prompt}
                  className="mx-auto block max-h-[70vh] w-auto max-w-full"
                  width={selected.width}
                  height={selected.height}
                />
                <figcaption className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm text-foreground">{selected.prompt}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {selected.engine} ({selected.model}){selected.width && selected.height ? ` · ${selected.width} x ${selected.height}` : ""}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
                    <a href={selected.blobUrl} download={selected.filename}><Download className="size-4" aria-hidden="true" /> Download</a>
                  </Button>
                </figcaption>
              </figure>
            )}

            {renders.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Recent images">
                {renders.map((r) => (
                  <button
                    key={r.id}
                    role="listitem"
                    onClick={() => setSelectedId(r.id)}
                    aria-label={`Show image: ${r.prompt.slice(0, 60)}`}
                    className={`size-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${selected?.id === r.id ? "border-primary" : "border-transparent hover:border-border"}`}
                  >
                    <img src={r.blobUrl} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
