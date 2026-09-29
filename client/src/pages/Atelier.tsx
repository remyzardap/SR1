import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { ArrowUp, Square, Upload, FileText, Download, Palette, ChevronRight, X, BarChart3, Table as TableIcon, BookOpen, Image as ImageIcon, RefreshCw, Check, Pen, LayoutTemplate } from "lucide-react";
import { Sparkles } from "@/components/brandIcons";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

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

const REPORT_TYPES: { type: ReportType; icon: string; desc: string }[] = [
  { type: "Business Report",  icon: "📊", desc: "Performance, strategy, operations" },
  { type: "Pitch Deck",       icon: "🚀", desc: "Investor or client presentation" },
  { type: "Market Research",  icon: "🔍", desc: "Industry analysis & insights" },
  { type: "Proposal",         icon: "📋", desc: "Project, service, or deal proposal" },
  { type: "Executive Brief",  icon: "⚡", desc: "Concise leadership summary" },
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
        <ImageIcon className="w-8 h-8" style={{ color: t.muted }} />
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
    <div className="w-full rounded-2xl overflow-hidden shadow-xl" style={{ background: t.bg, fontFamily: "'Manrope', sans-serif" }}>
      <div className="p-8 max-w-3xl mx-auto">
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

// ─── Main Atelier page ────────────────────────────────────────────────────────

export default function Atelier() {
  useSeoMeta({ title: "Atelier", path: "/atelier" });
  const { data: agentCtx } = trpc.agent.context.useQuery();

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
      const identityContext = agentCtx?.identity
        ? `Name: ${agentCtx.identity.displayName ?? agentCtx.identity.handle}\nBio: ${agentCtx.identity.bio ?? ""}`
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
  }, [input, messages, streaming, reportType, agentCtx]);

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
              toast.error("Report structure error — please try again");
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
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sutaeru-editorial-page flex flex-col gap-8 p-4 sm:p-8 max-w-3xl mx-auto w-full"
      >
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--foreground)", fontFamily: "var(--font-d)" }}>
            Atelier
          </h1>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Professional report studio — powered by S1
          </p>
        </div>

        {/* Two entry points */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Chat intake */}
          <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                <Pen className="w-4 h-4" style={{ color: "var(--foreground)" }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Chat with Kemma</span>
            </div>
            <p className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
              S1 interviews you with targeted questions to gather everything needed, then builds your report automatically.
            </p>
          </div>

          {/* Upload */}
          <div
            className="rounded-2xl p-5 flex flex-col gap-3 cursor-pointer transition-all duration-200"
            style={{ background: uploadedFile ? "var(--accent-dim)" : "var(--card)", border: uploadedFile ? "1px solid var(--border)" : "1px solid var(--border)" }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: uploadedFile ? "var(--accent-dim)" : "var(--card)", border: uploadedFile ? "1px solid var(--border)" : "1px solid var(--border)" }}>
                {uploadParsing ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><RefreshCw className="w-4 h-4" style={{ color: "var(--foreground)" }} /></motion.div>
                  : uploadedFile ? <Check className="w-4 h-4" style={{ color: "var(--foreground)" }} />
                  : <Upload className="w-4 h-4" style={{ color: "var(--foreground)" }} />}
              </div>
              <span className="text-sm font-semibold" style={{ color: uploadedFile ? "var(--foreground)" : "var(--foreground)" }}>
                {uploadedFile ? uploadedFile.name : "Upload a file"}
              </span>
            </div>
            {uploadedFile ? (
              <>
                <p className="text-[12px] font-mono line-clamp-2" style={{ color: "var(--muted-foreground)" }}>{uploadedFile.preview}</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(["rewrite", "reformat"] as UploadMode[]).map((m) => (
                    <button key={m} onClick={(e) => { e.stopPropagation(); setUploadMode(m); }}
                      className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
                      style={uploadMode === m
                        ? { background: "var(--accent-dim)", border: "1px solid var(--border)", color: "var(--foreground)" }
                        : { background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                    >
                      {m === "rewrite" ? "Rewrite" : "Reformat only"}
                    </button>
                  ))}
                  <button onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}
                    aria-label="Remove upload" className="ml-auto min-w-11 min-h-11 flex items-center justify-center rounded-md" style={{ color: "var(--muted-foreground)" }}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
                PDF, DOCX, MD, TXT, CSV — Atelier extracts and rebuilds it.
              </p>
            )}
            <input ref={fileInputRef} type="file" className="hidden"
              accept=".pdf,.docx,.md,.txt,.csv,.xlsx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
          </div>
        </div>

        {/* Report type */}
        <div>
          <p className="text-[11px] uppercase tracking-widest font-medium mb-3" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-d)" }}>Report Type</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {REPORT_TYPES.map(({ type, icon, desc }) => (
              <button key={type} onClick={() => setReportType(type)}
                className="text-left min-h-28 p-3.5 rounded-md transition-all duration-150"
                style={reportType === type
                  ? { background: "var(--accent-dim)", border: "1px solid var(--border)" }
                  : { background: "var(--card)", border: "1px solid var(--border)" }}
              >
                <div className="text-xl mb-2">{icon}</div>
                <p className="text-[13px] font-medium" style={{ color: reportType === type ? "var(--foreground)" : "var(--foreground)" }}>{type}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div>
          <p className="text-[11px] uppercase tracking-widest font-medium mb-3" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-d)" }}>Report Theme</p>
          <div className="grid grid-cols-3 gap-2 min-w-0">
            {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([key, t]) => (
              <button key={key} onClick={() => setTheme(key)}
                className="min-w-0 flex-1 p-2 sm:p-3 rounded-md transition-all duration-150 text-left"
                style={theme === key
                  ? { background: "var(--accent-dim)", border: "1px solid var(--border)" }
                  : { background: "var(--card)", border: "1px solid var(--border)" }}
              >
                <div className="w-full h-8 rounded-lg mb-2" style={{ background: t.bg, border: `1px solid ${t.border}` }}>
                  <div className="m-2 h-1.5 rounded-full w-3/4" style={{ background: t.accent }} />
                </div>
                <p className="text-[12px] font-medium" style={{ color: theme === key ? "var(--foreground)" : "var(--muted-foreground)" }}>{t.label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={startInterview}
          className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-d)" }}
        >
          <Sparkles className="w-4 h-4" />
          {uploadedFile ? `Build ${reportType} from upload` : `Start ${reportType} with S1`}
          <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>
    );
  }

  // ─── Phase: Interview ───────────────────────────────────────────────────────
  if (phase === "interview") {
    return (
      <div className="sutaeru-editorial-page flex flex-col h-full min-h-0 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex-none flex items-center justify-between px-4 sm:px-6 py-3"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--background)", backdropFilter: "blur(20px)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-d)" }}>Atelier · {reportType}</p>
            <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>S1 is gathering information</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {readyToGenerate && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => { setPhase("select"); setReadyToGenerate(false); setTimeout(generateReport, 100); }}
                className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-d)" }}
              >
                <Sparkles className="w-3 h-3" />
                Build Report
              </motion.button>
            )}
            <button onClick={() => setPhase("select")} aria-label="Close interview" className="min-h-11 min-w-11 flex items-center justify-center" style={{ color: "var(--muted-foreground)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
          <AnimatePresence>
            {messages.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[82%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed"
                  style={msg.role === "user"
                    ? { background: "var(--primary)", color: "var(--primary-foreground)", borderRadius: "20px 20px 4px 20px" }
                    : { background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", borderRadius: "20px 20px 20px 4px" }}
                >
                  {msg.content || <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }}>●●●</motion.span>}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex-none px-4 sm:px-6 pb-4 pt-2">
          <div className="flex items-end gap-2 px-4 py-3 rounded-2xl"
            style={{ background: "var(--card)", backdropFilter: "blur(28px)", border: "1px solid var(--border)" }}>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
              placeholder="Answer S1's question…"
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none bg-transparent text-[14px] outline-none leading-relaxed min-h-[24px] max-h-[120px]"
              style={{ color: "var(--foreground)", fontFamily: "'Manrope', sans-serif", caretColor: "var(--foreground)" }}
            />
            <button
              onClick={streaming ? () => abortRef.current?.abort() : () => void sendMessage()}
              aria-label={streaming ? "Stop response" : "Send message"}
               className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all"
              style={streaming
                ? { background: "rgba(179,64,42,.1)", border: "1px solid var(--border)", color: "var(--destructive)" }
                : { background: input.trim() ? "var(--foreground)" : "var(--accent-dim)", color: input.trim() ? "var(--primary-foreground)" : "var(--muted-foreground)" }}
            >
              {streaming ? <Square className="w-3 h-3 fill-current" /> : <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.5} />}
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
      <div className="flex flex-col items-center justify-center h-full gap-8 px-6">
        <motion.div className="relative w-16 h-16">
          <motion.div className="absolute inset-0 rounded-full" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            style={{ border: "2px solid transparent", borderTopColor: "var(--foreground)", borderRightColor: "var(--muted-foreground)" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-6 h-6" style={{ color: "var(--foreground)" }} />
          </div>
        </motion.div>
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--foreground)", fontFamily: "var(--font-d)" }}>Building your {reportType}</h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>S1 is writing your report now…</p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {steps.map((step, i) => (
            <motion.div key={step} initial={{ opacity: 0.2 }} animate={{ opacity: i <= approxStep ? 1 : 0.25 }}
              className="flex items-center gap-3 text-[13px]"
              style={{ color: i <= approxStep ? "var(--foreground)" : "var(--muted-foreground)" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: i <= approxStep ? "var(--foreground)" : "var(--muted-foreground)" }} />
              {step}
              {i === approxStep && <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1 }} style={{ color: "var(--muted-foreground)" }}>…</motion.span>}
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Phase: Preview ─────────────────────────────────────────────────────────
  if (phase === "preview" && report) {
    return (
      <div className="sutaeru-editorial-page flex flex-col h-full min-h-0">
        {/* Toolbar */}
        <div className="flex-none flex items-center justify-between px-4 sm:px-6 py-3 flex-wrap gap-2"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--background)", backdropFilter: "blur(20px)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--foreground)", fontFamily: "var(--font-d)" }}>{report.title}</p>
            <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>Atelier · {reportType}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Theme switcher */}
            <div className="flex items-center gap-1 p-1 rounded-full" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              {(Object.keys(THEMES) as Theme[]).map((t) => (
                <button key={t} onClick={() => { setTheme(t); setReport((r) => r ? { ...r, theme: t } : r); }}
                  className="min-h-11 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                  style={theme === t
                    ? { background: "var(--accent)", color: "var(--foreground)" }
                    : { color: "var(--muted-foreground)" }}>
                  {THEMES[t].label}
                </button>
              ))}
            </div>
            <button onClick={() => { setPhase("select"); setReport(null); setMessages([]); }}
              className="min-h-11 text-[12px] px-3 py-1.5 rounded-md transition-all"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
              New Report
            </button>
            <button className="flex min-h-11 items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md font-semibold transition-all"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
              onClick={() => toast.info("Export coming soon — PDF, DOCX, XLSX, MD")}>
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        </div>

        {/* Report preview */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <ReportPreview report={report} />
          </motion.div>
        </div>
      </div>
    );
  }

  return null;
}
