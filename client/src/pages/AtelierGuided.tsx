import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Square } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";
import "@/styles/atelier-reskin.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType = "Business Report" | "Pitch Deck" | "Market Research" | "Proposal" | "Executive Brief";
type Theme = "corporate" | "monochrome" | "editorial";
type Phase = "select" | "interview" | "generating" | "preview";
type UploadMode = "rewrite" | "reformat";

interface Message { role: "user" | "assistant"; content: string; }

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

// ─── Theme tokens ─────────────────────────────────────────────────────────────

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

const REPORT_TYPES: { type: ReportType; icon: SutaeruIconName; desc: string }[] = [
  { type: "Business Report",  icon: "report",  desc: "Performance, strategy, operations" },
  { type: "Pitch Deck",       icon: "play",    desc: "Investor or client presentation" },
  { type: "Market Research",  icon: "research", desc: "Industry analysis & insights" },
  { type: "Proposal",         icon: "plan",    desc: "Project, service, or deal proposal" },
  { type: "Executive Brief",  icon: "review",  desc: "Concise leadership summary" },
];

// ─── SSE parser ───────────────────────────────────────────────────────────────

function parseSse(raw: string): { events: Array<{ event: string; data: string }>; remainder: string } {
  const events: Array<{ event: string; data: string }> = [];
  const blocks = raw.split("\n\n");
  const remainder = blocks.pop() ?? "";
  for (const block of blocks) {
    let event = "message"; let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (data) events.push({ event, data });
  }
  return { events, remainder };
}

// ─── Report Section Renderers ─────────────────────────────────────────────────
// The document below keeps its own selectable themes: it is user output, not app chrome.

function CoverSection({ section, t }: { section: ReportSection; t: typeof THEMES[Theme] }) {
  return (
    <div className="min-h-[340px] flex flex-col items-center justify-center text-center p-12 rounded-2xl mb-6"
      style={{ background: `linear-gradient(135deg, ${t.accent}15 0%, ${t.surface} 100%)`, border: `1px solid ${t.border}` }}>
      <div className="w-12 h-1 rounded-full mb-8" style={{ background: t.accent }} />
      <h1 className="text-4xl font-bold mb-4 leading-tight" style={{ color: t.heading, fontFamily: "'Syne', sans-serif" }}>
        {section.title}
      </h1>
      {section.content && (
        <p className="text-sm mt-4" style={{ color: t.muted }}>{section.content}</p>
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
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: t.accent }}>
          {section.title}
        </h2>
      </div>
      <div className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: t.text }}>
        {section.content}
      </div>
    </div>
  );
}

function TextSection({ section, t }: { section: ReportSection; t: typeof THEMES[Theme] }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold mb-3" style={{ color: t.heading, fontFamily: "'Syne', sans-serif" }}>
        {section.title}
      </h2>
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
    <div className="mb-5">
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
    <div className="mb-5 p-5 rounded-2xl" style={{ background: t.surface, border: `1px solid ${t.border}` }}>
      {section.title && <h3 className="text-base font-semibold mb-4" style={{ color: t.heading }}>{section.title}</h3>}
      {chartType === "pie" ? (
        // Simple pie legend fallback
        <div className="flex flex-wrap gap-3">
          {labels.map((label: string, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[13px]" style={{ color: t.text }}>
              <div className="w-3 h-3 rounded-full" style={{ background: barColor, opacity: 0.4 + (i * 0.15) }} />
              <span>{label}</span>
              <span className="font-semibold">{values[i]}</span>
            </div>
          ))}
        </div>
      ) : (
        // Bar / line chart
        <div className="flex items-end gap-2 h-32">
          {values.map((val: number, i: number) => (
            <div key={i} className="flex flex-col items-center flex-1 gap-1">
              <span className="text-[10px] font-mono" style={{ color: t.muted }}>{val}</span>
              <motion.div
                className="w-full rounded-t-lg"
                initial={{ height: 0 }}
                animate={{ height: `${(val / max) * 100}px` }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                style={{ background: barColor, minHeight: "4px" }}
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
    <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
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
    <div className="w-full rounded-2xl overflow-hidden" style={{ background: t.bg, fontFamily: "'Manrope', sans-serif" }}>
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        {report.sections.map((section) => {
          switch (section.type) {
            case "cover":   return <CoverSection   key={section.id} section={section} t={t} />;
            case "summary": return <SummarySection  key={section.id} section={section} t={t} />;
            case "table":   return <TableSection    key={section.id} section={section} t={t} />;
            case "chart":   return <ChartSection    key={section.id} section={section} t={t} />;
            case "image":   return <ImageSection    key={section.id} section={section} t={t} />;
            default:        return <TextSection     key={section.id} section={section} t={t} />;
          }
        })}
      </div>
    </div>
  );
}

// ─── Running view (shared by both phases that build) ──────────────────────────

function RunTimeline({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="sk-at-timeline">
      {steps.map((label, i) => {
        const state = i < current ? "is-done" : i === current ? "is-active" : "";
        const stateLabel = i < current ? "Done" : i === current ? "In progress" : "";
        return (
          <li key={label} className={`sk-at-step${state ? ` ${state}` : ""}`} aria-current={i === current ? "step" : undefined}>
            <span className="sk-at-step-dot" aria-hidden="true" />
            <span className="sk-at-step-label">{label}</span>
            <span className="sk-at-step-state">{stateLabel}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Main Atelier page ────────────────────────────────────────────────────────

export default function AtelierGuided({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: identity } = trpc.identity.get.useQuery();

  // Phase management
  const [phase, setPhase] = useState<Phase>("select");
  const [reportType, setReportType] = useState<ReportType>("Business Report");
  const [theme, setTheme] = useState<Theme>("corporate");
  const [uploadMode, setUploadMode] = useState<UploadMode>("rewrite");

  // Interview state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [readyToGenerate, setReadyToGenerate] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string; preview: string } | null>(null);
  const [uploadParsing, setUploadParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Report state
  const [report, setReport] = useState<ReportStructure | null>(null);
  const [exportFormat, setExportFormat] = useState<"pdf" | "docx" | "xlsx" | "md">("pdf");
  const [exporting, setExporting] = useState(false);
  const [generatingText, setGeneratingText] = useState("");

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  // ── Send interview message ──────────────────────────────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || streaming) return;

    const userMsg: Message = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const identityContext = identity
        ? `Name: ${identity.displayName ?? identity.handle}\nBio: ${identity.bio ?? ""}`
        : "";

      const res = await fetch("/api/atelier/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: ctrl.signal,
        body: JSON.stringify({ messages: newMessages, reportType, identityContext }),
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
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role !== "assistant") return prev;
                return [...prev.slice(0, -1), { ...last, content: last.content + token }];
              });
            } catch { /* skip */ }
          } else if (event === "ready") {
            setReadyToGenerate(true);
          }
        }
      }

      // Clean [READY_TO_GENERATE] tag from final message
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role !== "assistant") return prev;
        return [...prev.slice(0, -1), { ...last, content: last.content.replace(/\[READY_TO_GENERATE\]/g, "").trim() }];
      });

    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      toast.error("Interview error: " + (err as Error).message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming, reportType, identity]);

  // ── Upload file ─────────────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    setUploadParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/atelier/parse", { method: "POST", credentials: "include", body: formData });
      const data = await res.json() as { filename: string; content: string; preview: string };
      setUploadedFile({ name: data.filename, content: data.content, preview: data.preview });
      toast.success(`${data.filename} parsed successfully`);
    } catch (err) {
      toast.error("Failed to parse file: " + (err as Error).message);
    } finally {
      setUploadParsing(false);
    }
  };

  // ── Generate report ─────────────────────────────────────────────────────────
  const generateReport = useCallback(async () => {
    setPhase("generating");
    setGeneratingText("");

    try {
      const res = await fetch("/api/atelier/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages,
          reportType,
          theme,
          mode: uploadMode,
          uploadedContent: uploadedFile?.content ?? "",
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
            try { setGeneratingText((t) => t + (JSON.parse(data) as string)); } catch { /* skip */ }
          } else if (event === "report") {
            try {
              const parsed = JSON.parse(data) as ReportStructure;
              setReport(parsed);
              setPhase("preview");
            } catch {
              toast.error("Report structure error, please try again");
              setPhase("interview");
            }
          } else if (event === "error") {
            toast.error(JSON.parse(data) as string);
            setPhase("interview");
          }
        }
      }
    } catch (err) {
      toast.error("Generation failed: " + (err as Error).message);
      setPhase("interview");
    }
  }, [messages, reportType, theme, uploadMode, uploadedFile]);

  const exportReport = useCallback(async () => {
    if (!report || exporting) return;
    setExporting(true);
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
      const filename = res.headers.get("X-Filename") ?? `report.${exportFormat}`;
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
      setExporting(false);
    }
  }, [report, exportFormat, exporting]);

  // ── Start interview ─────────────────────────────────────────────────────────
  const startInterview = async () => {
    setPhase("interview");
    setMessages([]);
    setReadyToGenerate(false);

    // If file uploaded, skip interview
    if (uploadedFile) {
      setPhase("generating");
      await generateReport();
      return;
    }

    // Kick off with first S1 question
    setStreaming(true);
    try {
      const res = await fetch("/api/atelier/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: [], reportType, identityContext: "" }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let firstMsg = "";

      setMessages([{ role: "assistant", content: "" }]);

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
              firstMsg += token;
              setMessages([{ role: "assistant", content: firstMsg }]);
            } catch { /* skip */ }
          }
        }
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStreaming(false);
    }
  };

  // ─── Phase: Select ──────────────────────────────────────────────────────────
  if (phase === "select") {
    return (
      <div className={embedded ? "sk-at-one w-full" : "sk-page sk-at-one mx-auto"}>
        {/* Header (the Atelier wrapper page provides it when embedded) */}
        {!embedded && (
          <div>
            <h1 className="sk-h1">Atelier</h1>
            <p className="sk-sub">Professional report studio, powered by Kemma</p>
          </div>
        )}

        {/* Two entry points */}
        <div className="sk-grid-2">
          {/* Chat intake */}
          <div className="sk-card flex flex-col gap-3">
            <div className="sk-row">
              <span className="sk-icon-tile">
                <SutaeruIcon name="ask" />
              </span>
              <h2 className="sk-tile-title">Chat with Kemma</h2>
            </div>
            <p className="sk-empty-text">
              Kemma interviews you with targeted questions to gather everything needed, then builds your report automatically.
            </p>
          </div>

          {/* Upload */}
          <div
            className={`sk-card sk-at-tile flex flex-col gap-3${uploadedFile ? " is-active" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
          >
            <div className="sk-row">
              <span className="sk-icon-tile">
                {uploadParsing
                  ? <span className="sk-at-spin" aria-hidden="true" />
                  : uploadedFile ? <SutaeruIcon name="check" />
                  : <SutaeruIcon name="files" />}
              </span>
              <h2 className="sk-tile-title">
                {uploadedFile ? uploadedFile.name : "Upload a file"}
              </h2>
            </div>
            {uploadedFile ? (
              <>
                <p className="sk-meta line-clamp-2" style={{ fontFamily: "var(--sk-mono)" }}>{uploadedFile.preview}</p>
                <div className="sk-row">
                  {(["rewrite", "reformat"] as UploadMode[]).map((m) => (
                    <button key={m} type="button" onClick={(e) => { e.stopPropagation(); setUploadMode(m); }}
                      aria-pressed={uploadMode === m}
                      className={`sk-pill sk-pill-sm${uploadMode === m ? " is-active" : ""}`}
                    >
                      {m === "rewrite" ? "Rewrite" : "Reformat only"}
                    </button>
                  ))}
                  <button type="button" onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}
                    aria-label="Remove upload" className="sk-icon-btn ml-auto">
                    <SutaeruIcon name="close" />
                  </button>
                </div>
              </>
            ) : (
              <p className="sk-empty-text">
                PDF, DOCX, MD, TXT, CSV. Atelier extracts and rebuilds it.
              </p>
            )}
            <input ref={fileInputRef} type="file" className="hidden"
              accept=".pdf,.docx,.md,.txt,.csv,.xlsx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
          </div>
        </div>

        {/* Report type */}
        <div>
          <span className="sk-label sk-section">Report Type</span>
          <div className="sk-at-tiles" role="radiogroup" aria-label="Report type">
            {REPORT_TYPES.map(({ type, icon, desc }) => (
              <button key={type} type="button" onClick={() => setReportType(type)}
                role="radio" aria-checked={reportType === type}
                className={`sk-tile sk-at-tile${reportType === type ? " is-active" : ""}`}
              >
                <span className="sk-icon-tile">
                  <SutaeruIcon name={icon} />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="sk-tile-title">{type}</p>
                  <p className="sk-empty-text">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div>
          <span className="sk-label sk-section">Report Theme</span>
          <div className="sk-row" role="radiogroup" aria-label="Report theme">
            {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([key, t]) => (
              <button key={key} type="button" onClick={() => setTheme(key)}
                role="radio" aria-checked={theme === key}
                className={`sk-pill${theme === key ? " is-active" : ""}`}
              >
                <span className="sk-at-swatch-dot" style={{ background: t.bg, boxShadow: `inset 0 0 0 1px ${t.border}` }}>
                  <i style={{ background: t.accent }} />
                </span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button type="button" onClick={startInterview} className="sk-btn w-full" style={{ minHeight: 56 }}>
          <SutaeruIcon name="make" className="size-4" />
          {uploadedFile ? `Build ${reportType} from upload` : `Start ${reportType} with Kemma`}
        </button>
      </div>
    );
  }

  // ─── Phase: Interview ───────────────────────────────────────────────────────
  if (phase === "interview") {
    return (
      <div className={embedded ? "sk-at-one w-full" : "sk-page sk-at-one mx-auto"}>
        {/* Header */}
        <div className="sk-card sk-at-tool">
          <div className="min-w-0">
            <span className="sk-at-status">
              <span className="sk-dot" aria-hidden="true" /> Atelier · {reportType}
            </span>
            <p className="sk-sub" style={{ margin: "6px 0 0" }}>Kemma is gathering information</p>
          </div>
          <div className="sk-row">
            {readyToGenerate && (
              <button
                type="button"
                onClick={() => { setPhase("select"); setReadyToGenerate(false); setTimeout(generateReport, 100); }}
                className="sk-btn sk-btn-sm"
              >
                <SutaeruIcon name="make" className="size-4" />
                Build Report
              </button>
            )}
            <button type="button" onClick={() => setPhase("select")} aria-label="Close interview" className="sk-icon-btn">
              <SutaeruIcon name="close" />
            </button>
          </div>
        </div>

        {/* Transcript */}
        <div className="sk-card flex flex-col gap-4">
          <div className="sk-at-transcript">
            {messages.map((msg, i) => (
              <div key={i} className={`sk-at-row${msg.role === "user" ? " is-user" : ""}`}>
                {msg.role === "user" ? (
                  <div className="sk-at-bubble">{msg.content}</div>
                ) : (
                  <div className="sk-at-answer">
                    <span className="sk-at-msg-label">Kemma</span>
                    <div className="sk-at-answer-text">
                      {msg.content || <span className="sk-at-typing">...</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="sk-composer sk-at-composer">
            <label htmlFor="atelier-interview-answer" className="sr-only">Answer</label>
            <textarea
              id="atelier-interview-answer"
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
              placeholder="Answer Kemma's question..."
              rows={1}
              disabled={streaming}
            />
            <button
              type="button"
              onClick={streaming ? () => abortRef.current?.abort() : () => void sendMessage()}
              aria-label={streaming ? "Stop response" : "Send message"}
              className="sk-send"
            >
              {streaming ? <Square className="w-3 h-3 fill-current" /> : <SutaeruIcon name="arrow" className="-rotate-90" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Phase: Generating ──────────────────────────────────────────────────────
  if (phase === "generating") {
    const steps = ["Analysing context", "Structuring sections", "Writing content", "Adding data & charts", "Finalising layout"];
    const approxStep = Math.min(Math.floor(generatingText.length / 600), steps.length - 1);
    return (
      <div className={embedded ? "sk-at-one w-full" : "sk-page sk-at-one mx-auto"}>
        <div className="sk-card" role="status" aria-live="polite">
          <div className="sk-at-run-top">
            <span className="sk-at-status">
              <span className="sk-dot" aria-hidden="true" /> Atelier · Running
            </span>
            <span className="sk-meta sk-num">STEP {approxStep + 1} OF {steps.length}</span>
          </div>
          <h2 className="sk-at-run-title">Building your {reportType}</h2>
          <p className="sk-at-run-body">Kemma is writing your report now...</p>
          <RunTimeline steps={steps} current={approxStep} />
          <div className="sk-at-now">
            <span className="sk-at-now-label">Now</span>
            <p className="sk-at-now-text">{steps[approxStep]}</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Phase: Preview ─────────────────────────────────────────────────────────
  if (phase === "preview" && report) {
    return (
      <div className={embedded ? "sk-at-one w-full" : "sk-page sk-at-one mx-auto"}>
        {/* Toolbar */}
        <div className="sk-card sk-at-tool">
          <div className="min-w-0">
            <span className="sk-label">Atelier · {reportType}</span>
            <h2 className="sk-at-run-title" style={{ margin: "8px 0 0" }}>{report.title}</h2>
          </div>
          <div className="sk-row">
            {/* Theme switcher */}
            <div className="sk-row" role="radiogroup" aria-label="Report theme">
              {(Object.keys(THEMES) as Theme[]).map((t) => (
                <button key={t} type="button" onClick={() => { setTheme(t); setReport((r) => r ? { ...r, theme: t } : r); }}
                  role="radio" aria-checked={theme === t}
                  className={`sk-pill sk-pill-sm${theme === t ? " is-active" : ""}`}
                >
                  {THEMES[t].label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setPhase("select"); setReport(null); setMessages([]); }}
              className="sk-btn sk-btn-ghost sk-btn-sm">
              New Report
            </button>
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)}
              aria-label="Export format"
              className="sk-at-select">
              <option value="pdf">PDF</option>
              <option value="docx">Word (DOCX)</option>
              <option value="xlsx">Excel (XLSX)</option>
              <option value="md">Markdown</option>
            </select>
            <button type="button" disabled={exporting} className="sk-btn sk-btn-sm" onClick={exportReport}>
              <SutaeruIcon name="download" className="size-4" />
              {exporting ? "Exporting..." : "Export"}
            </button>
          </div>
        </div>

        {/* Report preview: the document keeps its own theme, the frame is the app's */}
        <div className="sk-card sk-at-report-frame">
          <ReportPreview report={report} />
        </div>
      </div>
    );
  }

  return null;
}
