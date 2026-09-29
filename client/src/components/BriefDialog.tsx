import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Streamdown } from "streamdown";
import { streamFunction } from "@/lib/kemmaCloud";
import { downloadResearchMarkdown, downloadResearchPdf } from "@/lib/researchReports";
import { toast } from "sonner";

const ACCEPT = ".pdf,.txt,.md,.docx";
const MAX_BYTES = 15 * 1024 * 1024;

interface BriefDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled document (e.g. opened from My Files). */
  initialDocument?: { filename: string; text?: string; file?: string; mediaType?: string } | null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsText(file);
  });
}

export function BriefDialog({ open, onOpenChange, initialDocument }: BriefDialogProps) {
  const [document, setDocument] = useState<{ filename: string; text?: string; file?: string; mediaType?: string } | null>(null);
  const [brief, setBrief] = useState("");
  const [phase, setPhase] = useState<"pick" | "working" | "done" | "error">("pick");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function startBrief(doc: { filename: string; text?: string; file?: string; mediaType?: string }) {
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

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) { toast.error("Files up to 15 MB are supported."); return; }
    try {
      if (file.type === "text/plain" || file.type === "text/markdown" || /\.(txt|md)$/i.test(file.name)) {
        const text = await readAsText(file);
        await startBrief({ filename: file.name, text });
      } else {
        const dataUrl = await readAsDataUrl(file);
        const mediaType = file.type || (file.name.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf");
        await startBrief({ filename: file.name, file: dataUrl, mediaType });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the file.");
    }
  }

  function reset() {
    abortRef.current?.abort();
    setDocument(null);
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
      <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" aria-hidden="true" />
            Document brief
          </DialogTitle>
        </DialogHeader>

        {phase === "pick" && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-sm text-muted-foreground max-w-sm">
              Drop in a PDF, Word, Markdown, or text file and Kemma will turn it into an interactive brief — overview, key figures with exact quotes, timeline, and section takeaways.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
            />
            <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="size-4" aria-hidden="true" /> Choose a document
            </Button>
          </div>
        )}

        {phase !== "pick" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground truncate">{document?.filename}</span>
              <div className="flex items-center gap-1">
                {phase === "done" && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => exportReport("md")}>Markdown</Button>
                    <Button variant="ghost" size="sm" onClick={() => exportReport("pdf")}>PDF</Button>
                  </>
                )}
                <Button variant="ghost" size="icon-sm" onClick={reset} aria-label="Start over"><X className="size-4" aria-hidden="true" /></Button>
              </div>
            </div>
            {phase === "working" && !brief && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Reading the document…</p>
            )}
            {phase === "error" && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <p>{error}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => document && startBrief(document)}>Try again</Button>
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
