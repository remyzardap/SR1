import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { toast } from "sonner";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { ConvergeBar, FocusBrackets } from "@/components/art";
import { useTimedProgress } from "@/hooks/useTimedProgress";
import { PageTitle } from "@/components/chrome/PageTitle";
import "@/styles/documents-start.css";
import "@/styles/atelier-reskin.css";
import "@/styles/edit-document.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadMode = "rewrite" | "reformat";
type Theme = "corporate" | "monochrome" | "editorial";
type ExportFormat = "pdf" | "docx" | "xlsx" | "md";

interface UploadedDoc {
  name: string;
  size?: number;
  content: string;
  preview: string;
}

type ExtraSource =
  | { id: string; kind: "file"; name: string; size?: number; mediaType?: string; dataUrl?: string }
  | { id: string; kind: "url"; url: string }
  | { id: string; kind: "html"; title: string; html: string };

interface ReportSection {
  id: string;
  type: "cover" | "summary" | "section" | "table" | "chart" | "image";
  title?: string;
  content?: string;
  data?: any;
}

interface ReportStructure {
  title: string;
  subtitle?: string;
  theme: Theme;
  author?: string;
  date?: string;
  sections: ReportSection[];
}

const THEMES: Record<Theme, {
  label: string; preview: string;
  bg: string; surface: string; text: string;
  muted: string; accent: string; border: string; heading: string;
}> = {
  corporate: {
    label: "Corporate", preview: "bg-blue-50",
    bg: "#ffffff", surface: "#f8fafc", text: "#0f172a",
    muted: "#64748b", accent: "#1e40af", border: "#e2e8f0", heading: "#1e3a5f",
  },
  monochrome: {
    label: "Monochrome", preview: "bg-zinc-100",
    bg: "#fafafa", surface: "#f4f4f5", text: "#09090b",
    muted: "#71717a", accent: "#18181b", border: "#e4e4e7", heading: "#09090b",
  },
  editorial: {
    label: "Editorial", preview: "bg-amber-50",
    bg: "#fffbf5", surface: "#fef9ee", text: "#1c1917",
    muted: "#78716c", accent: "#92400e", border: "#fde68a", heading: "#451a03",
  },
};

const STAGES = [
  { id: "analyse", label: "Analysing document", mono: "ANALYSING" },
  { id: "structure", label: "Structuring sections", mono: "STRUCTURING" },
  { id: "draft", label: "Writing content", mono: "DRAFTING" },
  { id: "format", label: "Formatting tables and layout", mono: "FORMATTING" },
  { id: "finalise", label: "Finalising file", mono: "FINALISING" },
];

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── SSE Parser ───────────────────────────────────────────────────────────────

function parseSse(raw: string): { events: Array<{ event: string; data: string }>; remainder: string } {
  const events: Array<{ event: string; data: string }> = [];
  const blocks = raw.split("\n\n");
  const remainder = blocks.pop() ?? "";
  for (const block of blocks) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (data) events.push({ event, data });
  }
  return { events, remainder };
}

// ─── Visual Illustrations for the Two Option Cards ───────────────────────────

const art: Record<string, ReactNode> = {
  rewrite: (
    <svg viewBox="0 0 240 140" aria-hidden="true">
      <rect x="70" y="12" width="88" height="116" rx="10" className="a-paper" />
      <path d="M84 38h60M84 64h60M84 78h34" className="a-line" />
      <rect x="82" y="46" width="64" height="14" rx="4" className="a-mark" />
      <path d="M178 36l22 22-48 48-26 4 4-26z" className="a-pen" />
    </svg>
  ),
  reformat: (
    <svg viewBox="0 0 240 140" aria-hidden="true">
      <rect x="52" y="12" width="136" height="116" rx="10" className="a-paper" />
      <rect x="66" y="24" width="108" height="16" rx="4" className="a-spot" />
      <path d="M78 32h56" className="a-line a-line-light" />
      <rect x="66" y="48" width="50" height="68" rx="4" className="a-paper" />
      <path d="M74 58h34M74 68h34M74 78h34M74 88h22" className="a-line" />
      <rect x="124" y="48" width="50" height="68" rx="4" className="a-paper" />
      <path d="M132 58h34M132 68h34M132 78h34M132 88h22" className="a-line" />
    </svg>
  ),
};

// ─── Report Section Renderers ─────────────────────────────────────────────────

function CoverSection({ section, t }: { section: ReportSection; t: typeof THEMES[Theme] }) {
  return (
    <div
      className="min-h-[300px] flex flex-col items-center justify-center text-center p-10 rounded-2xl mb-6"
      style={{ background: `linear-gradient(135deg, ${t.accent}15 0%, ${t.surface} 100%)`, border: `1px solid ${t.border}` }}
    >
      <div className="w-12 h-1 rounded-full mb-8" style={{ background: t.accent }} />
      <h1 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight" style={{ color: t.heading, fontFamily: "var(--r-font-title)" }}>
        {section.title}
      </h1>
      {section.content && (
        <p className="text-sm mt-3 max-w-lg" style={{ color: t.muted }}>{section.content}</p>
      )}
      <div className="w-12 h-1 rounded-full mt-8" style={{ background: t.accent }} />
    </div>
  );
}

function SummarySection({ section, t }: { section: ReportSection; t: typeof THEMES[Theme] }) {
  return (
    <div className="p-6 rounded-2xl mb-5" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full" style={{ background: t.accent }} />
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: t.accent, fontFamily: "var(--r-font-mono)" }}>
          {section.title ?? "Executive Summary"}
        </h2>
      </div>
      <div className="text-[14px] sm:text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: t.text }}>
        {section.content}
      </div>
    </div>
  );
}

function TextSection({ section, t }: { section: ReportSection; t: typeof THEMES[Theme] }) {
  return (
    <div className="mb-6">
      {section.title && (
        <h2 className="text-xl font-bold mb-3" style={{ color: t.heading, fontFamily: "var(--r-font-title)" }}>
          {section.title}
        </h2>
      )}
      <div className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: t.text }}>
        {section.content}
      </div>
      <div className="mt-4 h-px" style={{ background: t.border }} />
    </div>
  );
}

function TableSection({ section, t }: { section: ReportSection; t: typeof THEMES[Theme] }) {
  const { headers = [], rows = [] } = section.data ?? {};
  return (
    <div className="mb-6">
      {section.title && <h3 className="text-base font-semibold mb-3" style={{ color: t.heading }}>{section.title}</h3>}
      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${t.border}` }}>
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ background: t.accent }}>
              {headers.map((h: string, i: number) => (
                <th key={i} className="px-4 py-3 text-left font-semibold text-white">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: string[], ri: number) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? t.bg : t.surface }}>
                {row.map((cell: string, ci: number) => (
                  <td key={ci} className="px-4 py-2.5" style={{ color: t.text, borderTop: `1px solid ${t.border}` }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartSection({ section, t }: { section: ReportSection; t: typeof THEMES[Theme] }) {
  const { labels = [], values = [], chartType = "bar", color } = section.data ?? {};
  const max = Math.max(...values, 1);
  const barColor = color ?? t.accent;

  return (
    <div className="mb-6 p-5 rounded-2xl" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
      {section.title && <h3 className="text-base font-semibold mb-4" style={{ color: t.heading }}>{section.title}</h3>}
      {chartType === "pie" ? (
        <div className="flex flex-wrap gap-3">
          {labels.map((label: string, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[13px]" style={{ color: t.text }}>
              <div className="w-3 h-3 rounded-full" style={{ background: barColor, opacity: 0.4 + i * 0.15 }} />
              <span>{label}</span>
              <span className="font-semibold">{values[i]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-end gap-2 h-32 pt-4">
          {values.map((val: number, i: number) => (
            <div key={i} className="flex flex-col items-center flex-1 gap-1">
              <span className="text-[10px] font-mono" style={{ color: t.muted }}>{val}</span>
              <div
                className="w-full rounded-t-lg transition-all duration-300"
                style={{ background: barColor, height: `${(val / max) * 90}px`, minHeight: "4px" }}
              />
              <span className="text-[10px] text-center truncate w-full" style={{ color: t.muted }}>{labels[i]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageSection({ section, t }: { section: ReportSection; t: typeof THEMES[Theme] }) {
  return (
    <div className="mb-6 rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
      <div className="aspect-video flex flex-col items-center justify-center gap-3" style={{ background: t.surface }}>
        <SutaeruIcon name="image" signal={false} className="w-8 h-8" style={{ color: t.muted }} />
        <p className="text-[13px] text-center max-w-xs px-4" style={{ color: t.muted }}>{section.content ?? section.title}</p>
      </div>
      {section.title && (
        <div className="px-4 py-2" style={{ borderTop: `1px solid ${t.border}` }}>
          <p className="text-[12px]" style={{ color: t.muted }}>{section.title}</p>
        </div>
      )}
    </div>
  );
}

function ReportPreview({ report }: { report: ReportStructure }) {
  const t = THEMES[report.theme] ?? THEMES.corporate;
  return (
    <div className="w-full rounded-2xl overflow-hidden" style={{ background: t.bg, fontFamily: "var(--r-font-body)" }}>
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        {report.sections.map((section) => {
          switch (section.type) {
            case "cover":   return <CoverSection key={section.id} section={section} t={t} />;
            case "summary": return <SummarySection key={section.id} section={section} t={t} />;
            case "table":   return <TableSection key={section.id} section={section} t={t} />;
            case "chart":   return <ChartSection key={section.id} section={section} t={t} />;
            case "image":   return <ImageSection key={section.id} section={section} t={t} />;
            default:        return <TextSection key={section.id} section={section} t={t} />;
          }
        })}
      </div>
    </div>
  );
}

// ─── Main Edit Document Component ─────────────────────────────────────────────

export interface EditDocumentProps {
  embedded?: boolean;
  onBack?: () => void;
}

export default function EditDocument({ embedded = false, onBack }: EditDocumentProps) {
  // Form input state
  const [uploadedDoc, setUploadedDoc] = useState<UploadedDoc | null>(null);
  const [uploadParsing, setUploadParsing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>("rewrite");
  const [instructions, setInstructions] = useState("");
  const [extraSources, setExtraSources] = useState<ExtraSource[]>([]);

  // Subform toggles for extra sources
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [showHtmlInput, setShowHtmlInput] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");

  // Refs for file inputs
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);

  // Execution & Progress state
  const [isStarted, setIsStarted] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [generatingText, setGeneratingText] = useState("");
  const [report, setReport] = useState<ReportStructure | null>(null);
  const [theme, setTheme] = useState<Theme>("corporate");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [isExporting, setIsExporting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const progressCardRef = useRef<HTMLDivElement>(null);

  // Timed progress hook
  const run = useTimedProgress(isRunning, 45);

  // Auto-scroll progress card into view when generation starts
  useEffect(() => {
    if (isStarted && progressCardRef.current) {
      progressCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isStarted]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Handle Main Document File Upload ─────────────────────────────────────────
  const handleDocUpload = async (file: File) => {
    setUploadParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/atelier/parse", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`);
      }
      const data = (await res.json()) as { filename: string; content: string; preview: string; size?: number };
      setUploadedDoc({
        name: data.filename || file.name,
        size: data.size || file.size,
        content: data.content,
        preview: data.preview,
      });
      toast.success(`${data.filename || file.name} loaded`);
    } catch (err) {
      toast.error("Failed to parse document: " + (err as Error).message);
    } finally {
      setUploadParsing(false);
    }
  };

  // ── Handle Extra File Attachments ────────────────────────────────────────────
  const handleExtraFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: ExtraSource[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isImg = f.type.startsWith("image/");
      const isText = f.type.includes("text") || f.name.endsWith(".md") || f.name.endsWith(".txt") || f.name.endsWith(".csv");

      let contentOrUrl = "";
      if (isImg) {
        contentOrUrl = URL.createObjectURL(f);
      } else if (isText) {
        try {
          contentOrUrl = await f.text();
        } catch {
          contentOrUrl = "";
        }
      }

      added.push({
        id: crypto.randomUUID(),
        kind: "file",
        name: f.name,
        size: f.size,
        mediaType: f.type,
        dataUrl: isImg ? contentOrUrl : undefined,
      });
    }
    setExtraSources((prev) => [...prev, ...added]);
    toast.success(`Added ${added.length} file${added.length > 1 ? "s" : ""}`);
  };

  const handleAddUrl = () => {
    const raw = urlDraft.trim();
    if (!raw) return;
    try {
      const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      setExtraSources((prev) => [...prev, { id: crypto.randomUUID(), kind: "url", url: u.href }]);
      setUrlDraft("");
      setShowUrlInput(false);
      toast.success("Web reference added");
    } catch {
      toast.error("Please enter a valid web URL");
    }
  };

  const handleAddHtml = () => {
    const raw = htmlDraft.trim();
    if (!raw) return;
    setExtraSources((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: "html",
        title: `HTML snippet (${raw.length} chars)`,
        html: raw,
      },
    ]);
    setHtmlDraft("");
    setShowHtmlInput(false);
    toast.success("HTML source added");
  };

  const removeExtraSource = (id: string) => {
    setExtraSources((prev) => prev.filter((s) => s.id !== id));
  };

  // ── Start Generation ────────────────────────────────────────────────────────
  const handleStartGenerate = useCallback(async () => {
    if (!uploadedDoc) {
      toast.error("Please upload a document first");
      return;
    }

    setIsStarted(true);
    setIsRunning(true);
    setIsCancelled(false);
    setGeneratingText("");
    setReport(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Prepare uploadedContent with extra context appended client-side
    let finalUploadedContent = uploadedDoc.content;
    const extraSections: string[] = [];

    if (instructions.trim()) {
      extraSections.push(`User Instructions for ${uploadMode === "reformat" ? "Reformat" : "Rewrite"}:\n${instructions.trim()}`);
    }

    // For Rewrite: append extra sources. For Reformat: extra sources are ignored per spec.
    if (uploadMode === "rewrite" && extraSources.length > 0) {
      const formattedSources = extraSources.map((s, idx) => {
        if (s.kind === "file") return `[Source ${idx + 1}: File "${s.name}"]`;
        if (s.kind === "url") return `[Source ${idx + 1}: Web URL <${s.url}>]`;
        if (s.kind === "html") return `[Source ${idx + 1}: HTML Content]\n${s.html}`;
        return "";
      }).filter(Boolean).join("\n\n");

      extraSections.push(`Additional Reference Sources:\n${formattedSources}`);
    }

    if (extraSections.length > 0) {
      finalUploadedContent = `${uploadedDoc.content}\n\n---\n\n${extraSections.join("\n\n")}`;
    }

    try {
      const res = await fetch("/api/atelier/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: [],
          reportType: "Business Report",
          theme,
          mode: uploadMode,
          uploadedContent: finalUploadedContent,
        }),
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSse(buf);
        buf = remainder;

        for (const { event, data } of events) {
          if (event === "token") {
            try {
              const token = JSON.parse(data) as string;
              setGeneratingText((t) => t + token);
            } catch { /* skip */ }
          } else if (event === "report") {
            try {
              const parsed = JSON.parse(data) as ReportStructure;
              setReport(parsed);
              setIsRunning(false);
              toast.success("Document edit finished");
            } catch {
              toast.error("Failed to parse report structure");
            }
          } else if (event === "error") {
            try {
              const err = JSON.parse(data) as string;
              toast.error(err);
            } catch {
              toast.error(data);
            }
            setIsRunning(false);
          }
        }
      }
      setIsRunning(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setIsCancelled(true);
      } else {
        toast.error("Generation error: " + (err as Error).message);
      }
      setIsRunning(false);
    }
  }, [uploadedDoc, uploadMode, instructions, extraSources, theme]);

  // ── Cancel Generation ───────────────────────────────────────────────────────
  const handleCancel = () => {
    abortRef.current?.abort();
    setIsCancelled(true);
    setIsRunning(false);
    toast.info("Generation cancelled");
  };

  // ── Export Finished Report ──────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!report || isExporting) return;
    setIsExporting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/atelier/export`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, format: exportFormat, theme: report.theme }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const filename = res.headers.get("X-Filename") ?? `document.${exportFormat}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filename}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  }, [report, exportFormat, isExporting]);

  // Progress calculations
  const approxStep = Math.min(Math.floor(generatingText.length / 500), STAGES.length - 1);
  const stepProgress = (approxStep + 0.5) / STAGES.length;
  const isDone = !isRunning && isStarted && report !== null;
  const blendedProgress = isDone ? 1 : Math.min(0.95, Math.max(run.progress, stepProgress * 0.9));
  const currentStage = STAGES[approxStep];

  return (
    <div className={`sk-edit-doc${embedded ? "" : " mx-auto py-6"}`}>
      {/* Standalone header if not embedded inside Documents.tsx */}
      {!embedded && (
        <div className="sk-header">
          <div>
            {onBack && (
              <button type="button" className="sk-doc-back" onClick={onBack}>
                ← All documents
              </button>
            )}
            <PageTitle className="skx-title-flush">Edit document</PageTitle>
            <p className="sk-sub">Upload the file you want to change.</p>
          </div>
        </div>
      )}

      {/* ─── FOLDED SUMMARY CARD (when started) ─────────────────────────────── */}
      {isStarted ? (
        <section className="sk-edit-summary" aria-label="Edit Request Summary">
          <FocusBrackets />
          <div className="sk-edit-summary-top">
            <span className="sk-edit-summary-label">
              {isRunning ? "EDIT IN PROGRESS" : isCancelled ? "EDIT STOPPED" : "EDIT COMPLETED"}
            </span>
            {!isRunning && (
              <button
                type="button"
                className="sk-btn sk-btn-ghost sk-btn-sm"
                onClick={() => {
                  setIsStarted(false);
                  setIsRunning(false);
                }}
              >
                <SutaeruIcon name="edit" className="size-4" />
                Edit request
              </button>
            )}
          </div>

          <div className="sk-edit-summary-file">
            <span className="sk-edit-filecard-icon">
              <SutaeruIcon name="report" />
            </span>
            <span className="sk-edit-summary-file-name">{uploadedDoc?.name}</span>
            {uploadedDoc?.size && (
              <span className="sk-edit-filecard-meta">({formatBytes(uploadedDoc.size)})</span>
            )}
          </div>

          <div className="sk-edit-summary-row">
            <span className="sk-chip sk-chip-active">
              {uploadMode === "rewrite" ? "Rewrite & enhance" : "Reformat only"}
            </span>
            {uploadMode === "rewrite" && extraSources.length > 0 && (
              <span className="sk-chip">
                {extraSources.length} extra source{extraSources.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {instructions.trim() ? (
            <p className="sk-edit-summary-request">
              <strong>Instructions:</strong> {instructions.trim()}
            </p>
          ) : null}
        </section>
      ) : (
        /* ─── FORM PHASE: ONE column in exact order ────────────────────────── */
        <>
          {/* 1. UPLOAD ZONE */}
          <div>
            <span className="sk-edit-section-label">Source Document</span>
            {uploadedDoc ? (
              <div className="sk-edit-filecard">
                <FocusBrackets />
                <div className="sk-edit-filecard-head">
                  <span className="sk-edit-filecard-icon">
                    <SutaeruIcon name="check" />
                  </span>
                  <div className="sk-edit-filecard-info">
                    <span className="sk-edit-filecard-name">{uploadedDoc.name}</span>
                    <span className="sk-edit-filecard-meta">
                      {formatBytes(uploadedDoc.size)} · Uploaded
                    </span>
                  </div>
                  <button
                    type="button"
                    className="sk-icon-btn ml-auto"
                    onClick={() => setUploadedDoc(null)}
                    aria-label="Remove uploaded document"
                  >
                    <SutaeruIcon name="close" />
                  </button>
                </div>
                {uploadedDoc.preview && (
                  <p className="sk-edit-filecard-preview">{uploadedDoc.preview}</p>
                )}
              </div>
            ) : (
              <div
                className={`sk-edit-dropzone${isDragOver ? " is-dragover" : ""}`}
                role="button"
                tabIndex={0}
                aria-label="Upload document to edit"
                onClick={() => mainFileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    mainFileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void handleDocUpload(f);
                }}
              >
                <span className="sk-edit-dropzone-icon">
                  {uploadParsing ? (
                    <span className="sk-at-spin" aria-hidden="true" />
                  ) : (
                    <SutaeruIcon name="files" />
                  )}
                </span>
                <p className="sk-edit-dropzone-title">
                  {uploadParsing ? "Reading document..." : "Upload a document to change"}
                </p>
                <p className="sk-edit-dropzone-desc">
                  Drag and drop your file here, or tap to browse
                </p>
                <span className="sk-edit-dropzone-types">
                  PDF, DOCX, MD, TXT, CSV, XLSX
                </span>
                <input
                  ref={mainFileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.md,.txt,.csv,.xlsx"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleDocUpload(f);
                  }}
                />
              </div>
            )}
          </div>

          {/* 2. WHAT TO DO (TWO VISUAL CARDS WITH ILLUSTRATION) */}
          <div>
            <span className="sk-edit-section-label">What to do</span>
            <div className="sk-edit-modes" role="radiogroup" aria-label="What to do">
              {/* Rewrite card */}
              <div className="sk-edit-card-cell">
                <button
                  type="button"
                  role="radio"
                  aria-checked={uploadMode === "rewrite"}
                  className="sk-edit-card"
                  onClick={() => setUploadMode("rewrite")}
                >
                  <span className="sk-edit-card-art">{art.rewrite}</span>
                  <span className="sk-edit-card-body">
                    <span className="sk-edit-card-label">Rewrite</span>
                    <span className="sk-edit-card-title">Improve writing & content</span>
                    <span className="sk-edit-card-text">
                      Polish phrasing, tighten arguments, elevate tone, and enhance the content.
                    </span>
                  </span>
                </button>
                {uploadMode === "rewrite" ? <FocusBrackets /> : null}
              </div>

              {/* Reformat card */}
              <div className="sk-edit-card-cell">
                <button
                  type="button"
                  role="radio"
                  aria-checked={uploadMode === "reformat"}
                  className="sk-edit-card"
                  onClick={() => setUploadMode("reformat")}
                >
                  <span className="sk-edit-card-art">{art.reformat}</span>
                  <span className="sk-edit-card-body">
                    <span className="sk-edit-card-label">Reformat only</span>
                    <span className="sk-edit-card-title">Keep content, fix layout</span>
                    <span className="sk-edit-card-text">
                      Keep the exact content, fix structure, typography, sections, and layout.
                    </span>
                  </span>
                </button>
                {uploadMode === "reformat" ? <FocusBrackets /> : null}
              </div>
            </div>
          </div>

          {/* 3. OPTIONAL INSTRUCTIONS */}
          <div className="sk-edit-field">
            <label className="sk-edit-label" htmlFor="edit-instructions">
              <span>What should change?</span>
              <span className="opacity-60">(Optional)</span>
            </label>
            <textarea
              id="edit-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Make executive summary more concise, adopt an analytical tone, add bullet takeaways..."
              className="sk-edit-textarea"
              maxLength={3000}
            />
          </div>

          {/* 4. OPTIONAL EXTRA SOURCES */}
          <div className="sk-edit-sources-card">
            <div className="flex items-center justify-between gap-4">
              <span className="sk-edit-section-label" style={{ margin: 0 }}>
                Extra sources (optional)
              </span>
              {uploadMode === "reformat" ? (
                <span className="sk-edit-sources-notice">
                  Extra sources are ignored in Reformat only mode
                </span>
              ) : null}
            </div>

            <p className="sk-empty-text" style={{ margin: 0 }}>
              {uploadMode === "rewrite"
                ? "Add extra files, pictures, web links, or HTML snippets to provide reference material for the rewrite."
                : "Reformat only preserves your uploaded text and does not take extra material."}
            </p>

            {/* Icon-only controls row */}
            <div className="sk-edit-sources-toolbar">
              {/* Attach files & pictures: icon-only button */}
              <button
                type="button"
                className="sk-edit-icon-btn"
                title="Attach files or pictures"
                aria-label="Attach files or pictures"
                disabled={uploadMode === "reformat"}
                onClick={() => extraFileInputRef.current?.click()}
              >
                <SutaeruIcon name="plus" />
              </button>
              <input
                ref={extraFileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  void handleExtraFileUpload(e.target.files);
                  e.target.value = "";
                }}
              />

              {/* Web URL icon button */}
              <button
                type="button"
                className={`sk-edit-icon-btn${showUrlInput ? " is-active" : ""}`}
                title="Add web URL"
                aria-label="Add web URL"
                disabled={uploadMode === "reformat"}
                onClick={() => {
                  setShowUrlInput(!showUrlInput);
                  setShowHtmlInput(false);
                }}
              >
                <SutaeruIcon name="web" />
              </button>

              {/* Pasted HTML icon button */}
              <button
                type="button"
                className={`sk-edit-icon-btn${showHtmlInput ? " is-active" : ""}`}
                title="Paste HTML"
                aria-label="Paste HTML"
                disabled={uploadMode === "reformat"}
                onClick={() => {
                  setShowHtmlInput(!showHtmlInput);
                  setShowUrlInput(false);
                }}
              >
                <SutaeruIcon name="code" />
              </button>

              <span className="sk-edit-card-label" style={{ marginLeft: 4 }}>
                {extraSources.length > 0 ? `${extraSources.length} added` : "Files, photos, URLs, HTML"}
              </span>
            </div>

            {/* Inline URL input popover */}
            {showUrlInput && (
              <div className="sk-edit-subform">
                <label htmlFor="extra-url-input" className="sk-edit-label">Add Web Link</label>
                <div className="sk-edit-subform-row">
                  <input
                    id="extra-url-input"
                    type="url"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddUrl(); } }}
                    placeholder="https://example.com/reference-data"
                    className="sk-edit-input"
                  />
                  <button type="button" className="sk-btn sk-btn-sm" onClick={handleAddUrl}>
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Inline HTML paste popover */}
            {showHtmlInput && (
              <div className="sk-edit-subform">
                <label htmlFor="extra-html-input" className="sk-edit-label">Paste HTML Snippet</label>
                <textarea
                  id="extra-html-input"
                  value={htmlDraft}
                  onChange={(e) => setHtmlDraft(e.target.value)}
                  placeholder="<article><h2>Reference Data</h2><p>...</p></article>"
                  className="sk-edit-textarea"
                  style={{ minHeight: 80 }}
                />
                <button type="button" className="sk-btn sk-btn-sm self-start" onClick={handleAddHtml}>
                  Add HTML
                </button>
              </div>
            )}

            {/* Added sources chips */}
            {extraSources.length > 0 && (
              <ul className="sk-edit-chips" aria-label="Attached extra sources">
                {extraSources.map((s) => (
                  <li key={s.id} className="sk-edit-chip">
                    <span className="sk-edit-chip-icon">
                      {s.kind === "file" ? (
                        s.dataUrl ? (
                          <img src={s.dataUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                          <SutaeruIcon name="report" />
                        )
                      ) : s.kind === "url" ? (
                        <SutaeruIcon name="web" />
                      ) : (
                        <SutaeruIcon name="code" />
                      )}
                    </span>
                    <span className="sk-edit-chip-name">
                      {s.kind === "file" ? s.name : s.kind === "url" ? s.url : s.title}
                    </span>
                    <button
                      type="button"
                      className="sk-edit-chip-remove"
                      onClick={() => removeExtraSource(s.id)}
                      aria-label={`Remove source`}
                    >
                      <SutaeruIcon name="close" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 5. GENERATE BUTTON */}
          <button
            type="button"
            className="sk-btn sk-edit-cta"
            disabled={!uploadedDoc || uploadParsing}
            onClick={() => void handleStartGenerate()}
          >
            <SutaeruIcon name="make" className="size-4" />
            {!uploadedDoc
              ? "Upload a document to continue"
              : uploadMode === "rewrite"
              ? "Rewrite document"
              : "Reformat document"}
          </button>
        </>
      )}

      {/* ─── PROGRESS CARD (appears directly under folded summary card) ─────── */}
      {isStarted ? (
        <section
          ref={progressCardRef}
          className="sk-edit-progress"
          role="status"
          aria-live="polite"
        >
          <div className="sk-edit-progress-top">
            <span className="sk-at-status">
              <span className={`sk-dot${isRunning ? " sk-dot-ink" : ""}`} aria-hidden="true" />
              Documents · {isRunning ? "Running" : isCancelled ? "Cancelled" : "Done"}
            </span>
            <div className="flex items-center gap-3">
              <span className="sk-meta sk-num">
                STEP {approxStep + 1} OF {STAGES.length}
              </span>
              {isRunning && (
                <button
                  type="button"
                  className="sk-btn sk-btn-ghost sk-btn-sm"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div>
            <h2 className="sk-edit-progress-title">
              {uploadMode === "rewrite" ? "Rewriting your document" : "Reformatting your document"}
            </h2>
            <p className="sk-edit-progress-body">
              {isRunning
                ? "Sutaeru is analysing, revising, and assembling your finished report..."
                : isCancelled
                ? "Generation stopped by user."
                : "Your document is ready to download."}
            </p>
          </div>

          {/* ConvergeBar with 7 bolder dither dots for Documents */}
          <ConvergeBar
            progress={blendedProgress}
            etaSeconds={run.etaSeconds}
            dots={7}
            state={isCancelled ? "error" : isDone ? "done" : "running"}
            label={isCancelled ? "STOPPED" : isDone ? "COMPLETED" : currentStage.mono}
            etaOverride={
              isDone
                ? `TOOK ${Math.max(1, run.elapsedSeconds)} S`
                : isCancelled
                ? "STOPPED"
                : undefined
            }
            ariaLabel={`Editing document progress`}
          />

          {/* Timeline steps */}
          <ol className="sk-at-timeline" style={{ margin: "4px 0" }}>
            {STAGES.map((s, i) => {
              const state = i < approxStep || isDone ? "is-done" : i === approxStep && isRunning ? "is-active" : "";
              const stateLabel = i < approxStep || isDone ? "Done" : i === approxStep && isRunning ? "In progress" : "";
              return (
                <li key={s.id} className={`sk-at-step${state ? ` ${state}` : ""}`}>
                  <span className="sk-at-step-dot" aria-hidden="true" />
                  <span className="sk-at-step-label">{s.label}</span>
                  <span className="sk-at-step-state">{stateLabel}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {/* ─── STREAMING DRAFT CARD (under progress card) ─────────────────────── */}
      {isStarted && generatingText ? (
        <section className="sk-card sk-at-draft" aria-label="Draft text preview">
          <FocusBrackets />
          <div className="flex items-center justify-between">
            <p className="sk-label">Draft preview</p>
            <span className="sk-meta sk-num">{generatingText.length} chars</span>
          </div>
          <p className="sk-at-draft-text">{generatingText}</p>
        </section>
      ) : null}

      {/* ─── RESULT & EXPORT PILLS (last!) ─────────────────────────────────── */}
      {isDone && report ? (
        <section className="sk-edit-result" aria-label="Finished Document & Export">
          <div className="sk-edit-result-toolbar">
            <div className="sk-edit-result-info">
              <span className="sk-label">Finished Document</span>
              <h2 className="sk-edit-result-title">{report.title}</h2>
              {report.subtitle && <p className="sk-sub" style={{ margin: 0 }}>{report.subtitle}</p>}
            </div>

            <div className="sk-edit-result-actions">
              {/* Theme pills */}
              <div className="sk-row" role="radiogroup" aria-label="Document theme">
                {(Object.keys(THEMES) as Theme[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={theme === t}
                    onClick={() => {
                      setTheme(t);
                      setReport((r) => (r ? { ...r, theme: t } : r));
                    }}
                    className={`sk-pill sk-pill-sm${theme === t ? " is-active" : ""}`}
                  >
                    <span
                      className="sk-at-swatch-dot"
                      style={{
                        background: THEMES[t].bg,
                        boxShadow: `inset 0 0 0 1px ${THEMES[t].border}`,
                      }}
                    >
                      <i style={{ background: THEMES[t].accent }} />
                    </span>
                    {THEMES[t].label}
                  </button>
                ))}
              </div>

              {/* Export format pills */}
              <div className="sk-row" role="radiogroup" aria-label="Export format">
                {(["pdf", "docx", "xlsx", "md"] as ExportFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={exportFormat === f}
                    onClick={() => setExportFormat(f)}
                    className={`sk-pill sk-pill-sm${exportFormat === f ? " is-active" : ""}`}
                  >
                    {f === "docx" ? "Word" : f === "xlsx" ? "Excel" : f === "md" ? "Markdown" : "PDF"}
                  </button>
                ))}
              </div>

              {/* Download / Export Button */}
              <button
                type="button"
                className="sk-btn sk-btn-sm"
                disabled={isExporting}
                onClick={() => void handleExport()}
              >
                <SutaeruIcon name="download" className="size-4" />
                {isExporting ? "Exporting..." : `Export ${exportFormat.toUpperCase()}`}
              </button>
            </div>
          </div>

          {/* Rendered Report Preview */}
          <div className="sk-at-frame-wrap">
            <FocusBrackets />
            <div className="sk-card sk-at-report-frame">
              <ReportPreview report={report} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
