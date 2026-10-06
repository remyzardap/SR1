import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AttachMenu } from "@/components/AttachMenu";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { Streamdown } from "streamdown";
import { streamFunction } from "@/lib/kemmaCloud";
import { downloadResearchMarkdown, downloadResearchPdf } from "@/lib/researchReports";
import { dataUrlToText, isTextType, type Attachment } from "@/lib/attachments";

/** What the brief is built from: text, inline bytes, or a Drive reference. */
type BriefSource = { filename: string; text?: string; file?: string; mediaType?: string; attachment?: Attachment };

interface BriefDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled document (e.g. opened from My Files). */
  initialDocument?: BriefSource | null;
}

export function BriefDialog({ open, onOpenChange, initialDocument }: BriefDialogProps) {
  const [document, setDocument] = useState<BriefSource | null>(null);
  const [picked, setPicked] = useState<Attachment[]>([]);
  const [brief, setBrief] = useState("");
  const [phase, setPhase] = useState<"pick" | "working" | "done" | "error">("pick");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function startBrief(doc: BriefSource) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDocument(doc);
    setBrief("");
    setError("");
    setPhase("working");
    await streamFunction("document-brief", doc, {
      onToken: (token) => setBrief((prev) => prev + token),
      onDone: () => setPhase("done"),
      onError: (message) => { setError(message); setPhase("error"); },
    }, controller.signal).catch((err) => {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "The brief could not be completed.");
      setPhase("error");
    });
  }

  const startedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (open && initialDocument && startedForRef.current !== initialDocument.filename) {
      startedForRef.current = initialDocument.filename;
      void startBrief(initialDocument);
    }
    if (!open) startedForRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDocument]);

  /** One document, from this device or Drive, starts the brief straight away. */
  function handlePicked(next: Attachment[]) {
    setPicked(next);
    const att = next[0];
    if (!att) return;
    if (att.source === "drive") {
      void startBrief({ filename: att.filename || "Google Drive file", attachment: att });
      return;
    }
    if (isTextType(att.mediaType)) {
      void startBrief({ filename: att.filename, text: dataUrlToText(att.dataUrl) });
      return;
    }
    void startBrief({ filename: att.filename, file: att.dataUrl, mediaType: att.mediaType });
  }

  function reset() {
    abortRef.current?.abort();
    setDocument(null);
    setPicked([]);
    setBrief("");
    setError("");
    setPhase("pick");
  }

  function exportReport(kind: "md" | "pdf") {
    const report = { question: document?.filename || "Document brief", answer: brief, sources: [], mode: "deep" as const, model: "openai/gpt-6-astra", createdAt: new Date() };
    if (kind === "md") downloadResearchMarkdown(report);
    else downloadResearchPdf(report);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent
        className="sk-dialog max-h-[85dvh] overflow-y-auto"
        style={{ maxWidth: "min(672px, calc(100vw - 32px))" }}
      >
        <DialogHeader>
          <DialogTitle>Document brief</DialogTitle>
        </DialogHeader>

        {phase === "pick" && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="sk-empty-text max-w-sm">
              Drop in a PDF, Word, Markdown, or text file and Sutaeru will turn it into an interactive brief: overview, key figures with exact quotes, timeline, and section takeaways.
            </p>
            <AttachMenu
              attachments={picked}
              onChange={handlePicked}
              max={1}
              documentsOnly
              label="Document"
            />
          </div>
        )}

        {phase !== "pick" && (
          <div className="flex flex-col gap-3">
            <div className="sk-between">
              <span className="sk-meta min-w-0 truncate">{document?.filename}</span>
              <div className="flex items-center gap-1">
                {phase === "done" && (
                  <>
                    <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => exportReport("md")}>Markdown</button>
                    <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => exportReport("pdf")}>PDF</button>
                  </>
                )}
                <button type="button" className="sk-icon-btn" onClick={reset} aria-label="Start over"><SutaeruIcon name="close" /></button>
              </div>
            </div>
            {phase === "working" && !brief && (
              <p className="sk-empty-text flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading the document…</p>
            )}
            {phase === "error" && (
              <div className="sk-card">
                <div className="sk-empty">
                  <span className="sk-label">Error</span>
                  <p className="sk-empty-text">{error}</p>
                  <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm mt-2 self-start" onClick={() => document && startBrief(document)}>Try again</button>
                </div>
              </div>
            )}
            {brief && (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                <Streamdown>{brief}</Streamdown>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
