import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AttachMenu } from "@/components/AttachMenu";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { Chip, ConvergeBar, FocusBrackets, HalftoneRamp, prefersReducedMotion } from "@/components/art";
import { useTimedProgress } from "@/hooks/useTimedProgress";
import { MAX_FILES, type Attachment } from "@/lib/attachments";
import AtelierGuided, {
  downloadReportExport,
  parseSse,
  ReportPreview,
  type ExportFormat,
  type ReportStructure,
} from "./AtelierGuided";
import "@/styles/new-document.css";

// ─── The contract (SPEC-DOCUMENTS.md) ─────────────────────────────────────────

type DocKind = "short" | "medium" | "academic";
type CitationStyle = "apa" | "mla" | "harvard" | "ieee";

/** POST /api/documents/generate body limits. */
const MAX_BRIEF = 8000;
const MAX_URLS = 8;
const MAX_HTML = 3;
const MAX_HTML_BYTES = 200 * 1024;

interface StageEvent { id: string; label: string; step: number; steps: number }
interface OutlineEvent { title: string; subtitle: string | null; sections: Array<{ id: string; title: string }> }
interface SectionEvent { id: string; title: string; content: string }
interface SourceEvent { id: string; title: string; url?: string }
interface DoneEvent { tookSeconds: number; words: number; pages: number; sources: number }

/** The mono stage word above the bar. Falls back to the server's own label. */
const STAGE_WORDS: Record<string, string> = {
  reading: "READING SOURCES",
  planning: "PLANNING",
  researching: "RESEARCHING",
  writing: "WRITING",
  checking: "CHECKING",
  assembling: "ASSEMBLING",
};

const EXPORT_FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word" },
  { value: "xlsx", label: "Excel" },
  { value: "md", label: "Markdown" },
];

const CITATION_STYLES: Array<{ value: CitationStyle; label: string }> = [
  { value: "apa", label: "APA" },
  { value: "mla", label: "MLA" },
  { value: "harvard", label: "Harvard" },
  { value: "ieee", label: "IEEE" },
];

interface KindPlan {
  id: DocKind;
  label: string;
  pages: string;
  text: string;
  words: string;
  /** Typical wall time, used for the bar until the server reports its own eta. */
  estimateSeconds: number;
}

const KINDS: KindPlan[] = [
  {
    id: "short",
    label: "Short",
    pages: "UNDER 4 PAGES",
    text: "The answer first, then the few facts that carry it.",
    words: "600 to 1,400 words",
    estimateSeconds: 60,
  },
  {
    id: "medium",
    label: "Medium",
    pages: "UP TO 15 PAGES",
    text: "Researched, sectioned, every claim tied to a source.",
    words: "3,000 to 6,500 words",
    estimateSeconds: 300,
  },
  {
    id: "academic",
    label: "Academic",
    pages: "ACADEMIC",
    text: "Abstract, review, method, findings, limitations, references.",
    words: "3,500 to 8,000 words",
    estimateSeconds: 480,
  },
];

/** Small illustrations for the kind cards. They use the page tokens, so they follow light and dark. */
const kindArt: Record<DocKind, ReactNode> = {
  short: (
    <svg viewBox="0 0 240 140" aria-hidden="true">
      <rect x="66" y="18" width="80" height="104" rx="10" className="a-paper" />
      <rect x="78" y="34" width="56" height="12" rx="6" className="a-spot" />
      <path d="M78 60h44M78 74h52M78 88h30" className="a-line" />
      <circle cx="170" cy="46" r="20" className="a-spot" />
      <path d="M170 37v18M161 46h18" className="a-plus" />
    </svg>
  ),
  medium: (
    <svg viewBox="0 0 240 140" aria-hidden="true">
      <rect x="58" y="14" width="92" height="112" rx="10" className="a-paper" />
      <path d="M72 36h64M72 50h64M72 64h40" className="a-line" />
      <rect x="72" y="78" width="64" height="10" rx="4" className="a-mark" />
      <path d="M72 100h48" className="a-line" />
      <rect x="162" y="30" width="44" height="80" rx="8" className="a-paper" />
      <path d="M172 46h24M172 58h24M172 70h16" className="a-line" />
    </svg>
  ),
  academic: (
    <svg viewBox="0 0 240 140" aria-hidden="true">
      <rect x="58" y="16" width="92" height="110" rx="10" className="a-paper" />
      <rect x="72" y="30" width="64" height="18" rx="5" className="a-mark" />
      <path d="M72 60h64M72 72h64M72 84h44" className="a-line" />
      <path d="M72 104h64M72 116h36" className="a-line" />
      <path d="M164 34l30-10 30 10v46c0 18-12 28-30 34-18-6-30-16-30-34V34Z" className="a-paper" />
      <path d="m176 62 10 10 20-22" className="a-line" />
    </svg>
  ),
};

/** Example briefs shown in the empty textarea, one at a time. */
const PLACEHOLDER_EXAMPLES = [
  "e.g. A board brief comparing off-grid solar with grid batteries for rural clinics in East Africa: costs, reliability and what to recommend next quarter.",
  "e.g. A short explainer on what our churn numbers mean for the sales plan, for people who have not read the dashboard.",
  "e.g. An academic review of the evidence on remote working and team performance, with a reference list in APA.",
];

function excerpt(text: string, max = 180): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}...` : clean;
}

/**
 * The link the person typed, as an absolute http(s) URL, or null when it is not one.
 * `new URL()` alone is not enough: it happily encodes "not a url" into a hostname.
 */
function normalizeLink(raw: string): string | null {
  const typed = raw.trim();
  if (!typed || /\s/.test(typed)) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(typed) ? typed : `https://${typed}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  // A real link has a dotted host (or localhost on a dev machine).
  if (url.hostname !== "localhost" && !url.hostname.includes(".")) return null;
  return url.href;
}

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** The user-safe line for a thrown error: never show a raw stack or a provider message. */
function safeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return message.trim() || "The document could not be finished.";
}

/** The internal citation marker a draft section still carries: `[3]`, `[2, 5]`, `[1–3]`. */
const CITATION_MARKER = /\[\d+(?:[ \t]*[,–-][ \t]*\d+)*\]/g;

/**
 * Draft sections arrive before the server's citation pass, so they still carry raw `[n]`
 * markers, and the person should not watch those numbers go by. The final `report` event
 * replaces the drafts with the text in the style's own form, so the marker only needs to be
 * invisible for the moment it is on screen: the number is dropped and the sentence, including
 * its line breaks, is left exactly as written. Only the all-digits form is matched, so a real
 * bracketed note such as `[citation needed]` or a numbered list item stays visible.
 */
function hideDraftCitations(text: string): string {
  return text
    .replace(CITATION_MARKER, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?)\]])/g, "$1")
    .replace(/^[ \t]+/gm, "");
}

export default function NewDocument({ startInInterview = false }: { startInInterview?: boolean } = {}) {
  // ── The form ────────────────────────────────────────────────────────────────
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<DocKind>("medium");
  const [style, setStyle] = useState<CitationStyle>("apa");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [htmlBlobs, setHtmlBlobs] = useState<Array<{ name: string; html: string }>>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const [showHtml, setShowHtml] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [interview, setInterview] = useState(startInInterview);

  const htmlFileRef = useRef<HTMLInputElement>(null);

  // ── The run ─────────────────────────────────────────────────────────────────
  const [folded, setFolded] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<StageEvent | null>(null);
  const [serverProgress, setServerProgress] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [outline, setOutline] = useState<OutlineEvent | null>(null);
  const [draft, setDraft] = useState<SectionEvent[]>([]);
  const [usedSources, setUsedSources] = useState<SourceEvent[]>([]);
  const [showSources, setShowSources] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [report, setReport] = useState<ReportStructure | null>(null);
  const [finish, setFinish] = useState<DoneEvent | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [exporting, setExporting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  /** True once the stream said how it ended, so a silent close is not read as success. */
  const sawTerminalRef = useRef(false);
  /** Bumped on every run so the page can scroll to the progress again after a retry. */
  const [runId, setRunId] = useState(0);

  const plan = KINDS.find((k) => k.id === kind) ?? KINDS[1];
  const timed = useTimedProgress(running, plan.estimateSeconds);

  // The empty brief box cycles through example asks, unless motion is reduced.
  const [exampleAt, setExampleAt] = useState(0);
  useEffect(() => {
    if (brief || folded || prefersReducedMotion()) return;
    const id = window.setInterval(() => setExampleAt((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length), 7000);
    return () => window.clearInterval(id);
  }, [brief, folded]);

  // Nothing outlives the page: an aborted request stops the model spend.
  useEffect(() => () => abortRef.current?.abort(), []);

  // The progress appears where the person was looking: bring it into view.
  useEffect(() => {
    if (!folded) return;
    const id = window.requestAnimationFrame(() => {
      progressRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [folded, runId]);

  const sourceCount = attachments.length + urls.length + htmlBlobs.length;

  // ── Sources: links ──────────────────────────────────────────────────────────
  const addUrl = () => {
    const raw = urlDraft.trim();
    if (!raw) return;
    const href = normalizeLink(raw);
    if (!href) {
      setFormError("That does not look like a web address. Use a full http or https link.");
      return;
    }
    if (urls.some((u) => u === href)) {
      setFormError("That link is already on the list.");
      return;
    }
    if (urls.length >= MAX_URLS) {
      setFormError(`You can add up to ${MAX_URLS} links.`);
      return;
    }
    setUrls((prev) => [...prev, href]);
    setUrlDraft("");
    setFormError(null);
  };

  // ── Sources: pasted or uploaded HTML ────────────────────────────────────────
  const addHtml = (html: string, name?: string) => {
    const body = html.trim();
    if (!body) return;
    if (htmlBlobs.length >= MAX_HTML) {
      setFormError(`You can add up to ${MAX_HTML} pasted pages.`);
      return;
    }
    if (byteLength(body) > MAX_HTML_BYTES) {
      setFormError("That page is too big. Keep each one under 200 KB.");
      return;
    }
    setHtmlBlobs((prev) => [...prev, { name: name?.trim() || `Pasted page ${prev.length + 1}`, html: body }]);
    setHtmlDraft("");
    setShowHtml(false);
    setFormError(null);
  };

  const readHtmlFile = async (file: File) => {
    if (file.size > MAX_HTML_BYTES) {
      setFormError(`${file.name} is over 200 KB.`);
      return;
    }
    try {
      addHtml(await file.text(), file.name);
    } catch {
      setFormError(`${file.name} could not be read.`);
    }
  };

  // ── Run the generation stream ───────────────────────────────────────────────
  const handleEvent = useCallback((event: string, data: string) => {
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    switch (event) {
      case "stage":
        setStage(payload as StageEvent);
        break;
      case "progress": {
        const p = payload as { progress?: number; etaSeconds?: number | null };
        if (typeof p.progress === "number" && Number.isFinite(p.progress)) {
          const next = Math.min(1, Math.max(0, p.progress));
          setServerProgress((prev) => (prev === null ? next : Math.max(prev, next)));
        }
        setEtaSeconds(typeof p.etaSeconds === "number" && Number.isFinite(p.etaSeconds) ? Math.max(0, p.etaSeconds) : null);
        break;
      }
      case "outline":
        setOutline(payload as OutlineEvent);
        break;
      case "section": {
        const section = payload as SectionEvent;
        if (!section || typeof section.id !== "string") break;
        setDraft((prev) => {
          const at = prev.findIndex((s) => s.id === section.id);
          if (at < 0) return [...prev, section];
          const next = [...prev];
          next[at] = section;
          return next;
        });
        break;
      }
      case "source": {
        const source = payload as SourceEvent;
        if (!source || typeof source.id !== "string") break;
        setUsedSources((prev) => (prev.some((s) => s.id === source.id) ? prev : [...prev, source]));
        break;
      }
      case "notice": {
        const notice = payload as { message?: string };
        if (notice?.message) setNotices((prev) => [...prev, notice.message as string]);
        break;
      }
      case "report":
        setReport(payload as ReportStructure);
        sawTerminalRef.current = true;
        break;
      case "done":
        setFinish(payload as DoneEvent);
        setRunning(false);
        sawTerminalRef.current = true;
        break;
      case "error":
        setFailure(typeof payload === "string" ? payload : (payload as { message?: string })?.message || safeError(payload));
        setRunning(false);
        sawTerminalRef.current = true;
        break;
      default:
        break;
    }
  }, []);

  const start = useCallback(async () => {
    const text = brief.trim();
    if (!text) {
      setFormError("Describe the document first.");
      return;
    }
    setFormError(null);
    setFolded(true);
    setRunning(true);
    setRunId((n) => n + 1);
    setStage(null);
    setServerProgress(null);
    setEtaSeconds(null);
    setOutline(null);
    setDraft([]);
    setUsedSources([]);
    setNotices([]);
    setReport(null);
    setFinish(null);
    setFailure(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    sawTerminalRef.current = false;

    const sources: { attachments?: Attachment[]; urls?: string[]; html?: Array<{ name?: string; html: string }> } = {};
    if (attachments.length) sources.attachments = attachments;
    if (urls.length) sources.urls = urls;
    if (htmlBlobs.length) sources.html = htmlBlobs.map((b) => ({ name: b.name, html: b.html }));

    try {
      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: ctrl.signal,
        body: JSON.stringify({
          brief: text.slice(0, MAX_BRIEF),
          kind,
          ...(kind === "academic" ? { style } : {}),
          ...(Object.keys(sources).length ? { sources } : {}),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `The request failed (${res.status}).`);
      }
      if (!res.body) throw new Error("The server sent no response.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSse(buf);
        buf = remainder;
        for (const { event, data } of events) handleEvent(event, data);
      }
      // A stream that closes without a report, a done or an error: say so instead of hanging.
      if (!sawTerminalRef.current) {
        setFailure("The connection stopped before the document was finished.");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFailure(safeError(err));
    } finally {
      if (!ctrl.signal.aborted) setRunning(false);
    }
  }, [brief, kind, style, attachments, urls, htmlBlobs, handleEvent]);

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setFolded(false);
    setStage(null);
    setServerProgress(null);
    setEtaSeconds(null);
    setOutline(null);
    setDraft([]);
    setUsedSources([]);
    setNotices([]);
    setReport(null);
    setFinish(null);
    setFailure(null);
    toast.info("Stopped.");
  };

  const editRequest = () => {
    if (running) cancel();
    setFolded(false);
    setFailure(null);
    setReport(null);
    setFinish(null);
    setDraft([]);
    setUsedSources([]);
    setNotices([]);
  };

  const makeAnother = () => {
    setFolded(false);
    setBrief("");
    setAttachments([]);
    setUrls([]);
    setHtmlBlobs([]);
    setStage(null);
    setServerProgress(null);
    setEtaSeconds(null);
    setOutline(null);
    setDraft([]);
    setUsedSources([]);
    setNotices([]);
    setReport(null);
    setFinish(null);
    setFailure(null);
  };

  const download = async () => {
    if (!report || exporting) return;
    setExporting(true);
    try {
      const filename = await downloadReportExport(report, exportFormat);
      toast.success(`Exported ${filename}`);
    } catch (err) {
      toast.error(safeError(err));
    } finally {
      setExporting(false);
    }
  };

  // ── The bar: the server's own numbers once it sends them, a gentle creep until then ──
  // The creep is capped low on purpose: if it ran ahead of the first real progress event
  // the bar would have to sit still until the server caught up, which reads as a hang.
  const barProgress = report ? 1 : (serverProgress ?? (running ? Math.min(timed.progress, 0.15) : 0));
  const barEta = report ? null : (etaSeconds ?? (running ? timed.etaSeconds : null));
  const stageWord = stage ? (STAGE_WORDS[stage.id] ?? String(stage.label || "").toUpperCase()) : "WORKING";

  // ─── The interview keeps its own screen: it is the same guided component ────
  if (interview) {
    return (
      <div className="sk-nd">
        <AtelierGuided embedded entry="new" initialPhase="interview" onExitInterview={() => setInterview(false)} />
      </div>
    );
  }

  return (
    <div className="sk-nd">
      {/* ── 1. The brief ─────────────────────────────────────────────────────── */}
      {!folded && (
        <section className="sk-nd-card">
          <label className="sk-label" htmlFor="nd-brief">The brief</label>
          <textarea
            id="nd-brief"
            className="sk-textarea sk-nd-brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            maxLength={MAX_BRIEF}
            placeholder={PLACEHOLDER_EXAMPLES[exampleAt]}
          />
          <p className="sk-empty-text sk-nd-hint">Say what it is for, who reads it and what it should decide.</p>
          <div className="sk-nd-brief-foot">
            <button type="button" className="sk-nd-link" onClick={() => setInterview(true)}>
              <SutaeruIcon name="ask" />
              Interview me first
            </button>
            <span className="sk-label sk-num">{brief.length} / {MAX_BRIEF}</span>
          </div>
        </section>
      )}

      {/* ── 2. The kind ──────────────────────────────────────────────────────── */}
      {!folded && (
        <section>
          <span className="sk-label sk-section">Kind</span>
          <div className="sk-nd-kinds" role="radiogroup" aria-label="Document kind">
            {KINDS.map((k) => {
              const active = kind === k.id;
              return (
                <span key={k.id} className="sk-nd-cell">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className="sk-nd-kind"
                    onClick={() => setKind(k.id)}
                  >
                    <span className="sk-nd-kind-art">{kindArt[k.id]}</span>
                    <span className="sk-nd-kind-body">
                      <span className="sk-nd-kind-pages">{k.pages}</span>
                      <span className="sk-nd-kind-title">{k.label}</span>
                      <span className="sk-nd-kind-text">{k.text}</span>
                      <span className="sk-nd-kind-meta">{k.words}</span>
                      <span className="sk-nd-kind-eta">
                        ABOUT {k.estimateSeconds >= 60 ? `${Math.round(k.estimateSeconds / 60)} MIN` : `${k.estimateSeconds} S`}
                      </span>
                    </span>
                    {active ? (
                      <span className="sk-nd-kind-check" aria-hidden="true">
                        <SutaeruIcon name="check" />
                      </span>
                    ) : null}
                  </button>
                  {active ? <FocusBrackets /> : null}
                </span>
              );
            })}
          </div>

          {kind === "academic" ? (
            <div className="sk-nd-styles">
              <span className="sk-label">Citation style</span>
              <div className="sk-row" role="radiogroup" aria-label="Citation style">
                {CITATION_STYLES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={style === s.value}
                    className="art-chip art-chip-sm"
                    data-active={style === s.value ? "true" : "false"}
                    onClick={() => setStyle(s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* ── 3. The sources ───────────────────────────────────────────────────── */}
      {!folded && (
        <section className="sk-nd-card">
          <span className="sk-label">Sources</span>
          <p className="sk-empty-text">The more you give it, the better the report: your own files and pictures, web links, and pages you paste.</p>

          <AttachMenu attachments={attachments} onChange={setAttachments} max={MAX_FILES} />

          <div className="sk-nd-url">
            <label className="sr-only" htmlFor="nd-url">Web link</label>
            <input
              id="nd-url"
              className="sk-input"
              type="text"
              inputMode="url"
              autoComplete="off"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
              placeholder="https://example.com/quarterly-report"
            />
            <button type="button" className="sk-btn sk-btn-sm" onClick={addUrl} disabled={!urlDraft.trim()}>
              Add link
            </button>
          </div>

          {urls.length > 0 ? (
            <ul className="sk-nd-chips" aria-label="Web links">
              {urls.map((u) => (
                <li key={u} className="sk-nd-chip">
                  <span className="sk-nd-chip-icon"><SutaeruIcon name="web" /></span>
                  <span className="sk-nd-chip-name">{siteName(u)}</span>
                  <button type="button" className="sk-nd-chip-x" aria-label={`Remove ${siteName(u)}`} onClick={() => setUrls((prev) => prev.filter((x) => x !== u))}>
                    <SutaeruIcon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="sk-nd-html">
            <button type="button" className="sk-nd-link" aria-expanded={showHtml} onClick={() => setShowHtml((v) => !v)}>
              <SutaeruIcon name="code" />
              {showHtml ? "Close the paste box" : "Paste or upload HTML"}
            </button>
            {showHtml ? (
              <div className="sk-nd-html-box">
                <label className="sr-only" htmlFor="nd-html">HTML to paste</label>
                <textarea
                  id="nd-html"
                  className="sk-textarea sk-nd-html-area"
                  value={htmlDraft}
                  onChange={(e) => setHtmlDraft(e.target.value)}
                  placeholder="<html>... paste the page source here ...</html>"
                />
                <div className="sk-row">
                  <button type="button" className="sk-btn sk-btn-sm" onClick={() => addHtml(htmlDraft)} disabled={!htmlDraft.trim()}>
                    Add page
                  </button>
                  <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => htmlFileRef.current?.click()}>
                    Upload .html
                  </button>
                </div>
              </div>
            ) : null}
            <input
              ref={htmlFileRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readHtmlFile(file);
                e.target.value = "";
              }}
            />
          </div>

          {htmlBlobs.length > 0 ? (
            <ul className="sk-nd-chips" aria-label="Pasted pages">
              {htmlBlobs.map((b, i) => (
                <li key={`${b.name}-${i}`} className="sk-nd-chip">
                  <span className="sk-nd-chip-icon"><SutaeruIcon name="code" /></span>
                  <span className="sk-nd-chip-name">{b.name}</span>
                  <button type="button" className="sk-nd-chip-x" aria-label={`Remove ${b.name}`} onClick={() => setHtmlBlobs((prev) => prev.filter((_, at) => at !== i))}>
                    <SutaeruIcon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {formError ? <p className="sk-nd-formerror" role="alert">{formError}</p> : null}
        </section>
      )}

      {/* ── 4. Generate ──────────────────────────────────────────────────────── */}
      {!folded && (
        <button type="button" className="sk-btn sk-nd-cta" onClick={() => void start()} disabled={!brief.trim()}>
          <SutaeruIcon name="make" className="size-4" />
          Generate {plan.label.toLowerCase()} document
        </button>
      )}

      {/* ── The request, folded into a summary in the same place ─────────────── */}
      {folded ? (
        <section className="sk-nd-summary" aria-label="Your request">
          <div className="sk-nd-summary-head">
            <span className="sk-at-status">
              <span className="sk-dot sk-dot-ink" aria-hidden="true" />
              {failure ? "Stopped" : finish ? "Finished" : "Working"}
            </span>
            <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={editRequest}>
              <SutaeruIcon name="edit" className="size-4" />
              Edit request
            </button>
          </div>
          <p className="sk-nd-summary-brief">{excerpt(brief)}</p>
          <div className="sk-row">
            <Chip active small>{plan.label}</Chip>
            {kind === "academic" ? (
              <Chip small>{CITATION_STYLES.find((s) => s.value === style)?.label ?? "APA"}</Chip>
            ) : null}
            <Chip small>{sourceCount === 0 ? "No extra sources" : `${sourceCount} source${sourceCount === 1 ? "" : "s"}`}</Chip>
          </div>
        </section>
      ) : null}

      {/* ── 5. Progress, directly under the summary ──────────────────────────── */}
      {folded && !report && !failure ? (
        <section className="sk-nd-card sk-nd-progress" ref={progressRef} role="status" aria-live="polite">
          <div className="sk-nd-run-top">
            <span className="art-mono">{stageWord}</span>
            {stage?.steps ? <span className="art-mono">STEP {stage.step} OF {stage.steps}</span> : null}
          </div>
          <ConvergeBar
            progress={barProgress}
            etaSeconds={barEta}
            dots={7}
            ariaLabel={`Generating your ${plan.label.toLowerCase()} document`}
          />
          {running ? (
            <div className="sk-nd-cancel-row">
              <button type="button" className="sk-nd-cancel" onClick={cancel}>Cancel</button>
            </div>
          ) : null}
          {outline?.sections?.length && draft.length === 0 ? (
            <ol className="sk-nd-outline" aria-label="Planned sections">
              {outline.sections.map((s) => (
                <li key={s.id}>{s.title}</li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      {/* ── 6. The draft, section by section, under the progress ─────────────── */}
      {folded && draft.length > 0 && !report ? (
        <section className="sk-nd-drafts" aria-label="Draft sections">
          {draft.map((s) => (
            <article key={s.id} className="sk-nd-draft">
              <h3 className="sk-nd-draft-title">{s.title}</h3>
              <p className="sk-nd-draft-text">{hideDraftCitations(s.content)}</p>
            </article>
          ))}
        </section>
      ) : null}

      {/* ── Sources used: one compact row that opens ─────────────────────────── */}
      {folded && usedSources.length > 0 ? (
        <section className="sk-nd-sourcesused">
          <button type="button" className="sk-nd-sourcesbtn" aria-expanded={showSources} onClick={() => setShowSources((v) => !v)}>
            <SutaeruIcon name="research" />
            {usedSources.length} source{usedSources.length === 1 ? "" : "s"} used
            <span className="sk-nd-caret" aria-hidden="true">{showSources ? "−" : "+"}</span>
          </button>
          {showSources ? (
            <ul className="sk-nd-sourceslist">
              {usedSources.map((s) => (
                <li key={s.id}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                  ) : (
                    <span>{s.title}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {folded && notices.length > 0 ? (
        <ul className="sk-nd-notices" aria-label="Notices">
          {notices.map((n, i) => <li key={`${i}-${n}`}>{n}</li>)}
        </ul>
      ) : null}

      {/* ── 7. Failed: the same language as the Images flow ──────────────────── */}
      {folded && failure ? (
        <section className="sk-nd-failed" role="alert">
          <div className="sk-nd-failed-box">
            <FocusBrackets tone="alert" />
            <HalftoneRamp columns={7} rows={6} cell={12} minRadius={0.8} maxRadius={3.2} fluid className="sk-nd-failed-ramp" />
            <div className="sk-nd-failed-mark" aria-hidden="true">
              <SutaeruIcon name="close" />
            </div>
          </div>
          <div className="sk-nd-card">
            <div className="sk-nd-run-top">
              <span className="art-mono">STOPPED</span>
              <span className="art-mono">TOOK {Math.max(1, timed.elapsedSeconds)} S</span>
            </div>
            {/* etaOverride="" keeps the bar's own STOPPED readout from repeating the row above. */}
            <ConvergeBar progress={barProgress} state="error" showPercent={false} etaOverride="" ariaLabel="Document generation failed" />
          </div>
          <p className="sk-nd-failed-text">
            {failure}
            <br />
            Your brief and your sources are still here.
          </p>
          <div className="sk-row">
            <button type="button" className="sk-btn" onClick={() => void start()}>
              <SutaeruIcon name="make" className="size-4" />
              Try again
            </button>
            <button type="button" className="sk-btn sk-btn-ghost" onClick={editRequest}>
              Edit request
            </button>
          </div>
        </section>
      ) : null}

      {/* ── 8. The result and the export actions, last ───────────────────────── */}
      {folded && report ? (
        <section className="sk-nd-result" aria-label="Finished document">
          <div className="sk-nd-card">
            <div className="sk-nd-run-top">
              <span className="art-mono">DONE</span>
              <span className="art-mono">
                TOOK {(finish?.tookSeconds ?? Math.max(1, timed.elapsedSeconds))} S
              </span>
            </div>
            <ConvergeBar progress={1} state="done" showPercent={false} ariaLabel="Document finished" />
            {finish ? (
              <p className="sk-nd-stats">
                {finish.words.toLocaleString()} words · {finish.pages} pages · {finish.sources} source{finish.sources === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>

          <div className="sk-nd-tool">
            <div className="sk-nd-tool-head">
              <h3 className="sk-nd-result-title">{report.title}</h3>
              {report.subtitle ? <p className="sk-sub">{report.subtitle}</p> : null}
            </div>
            <div className="sk-row" role="radiogroup" aria-label="Export format">
              {EXPORT_FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={exportFormat === f.value}
                  className={`sk-pill sk-pill-sm${exportFormat === f.value ? " is-active" : ""}`}
                  onClick={() => setExportFormat(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="sk-row">
              <button type="button" className="sk-btn" onClick={() => void download()} disabled={exporting}>
                <SutaeruIcon name="download" className="size-4" />
                {exporting ? "Preparing..." : "Download"}
              </button>
              <button type="button" className="sk-btn sk-btn-ghost" onClick={makeAnother}>
                Make another
              </button>
            </div>
          </div>

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
