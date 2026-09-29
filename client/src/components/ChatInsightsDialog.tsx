import { useEffect, useRef, useState } from "react";
import { AlertCircle, Copy, Download, HelpCircle, ListChecks, Loader2, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";
import { getAuthToken } from "@/lib/authSession";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConversation: string;
  initialFocus?: InsightFocus;
}

type Status = "idle" | "loading" | "done" | "error";
export type InsightFocus = "decisions" | "gaps" | "brief" | "followups";

const FOCUS = {
  decisions: { title: "Decisions & next steps", file: "decisions-and-next-steps.md", desc: "what was decided and what needs doing" },
  gaps: { title: "Open questions & missing info", file: "open-questions.md", desc: "unanswered questions and information still missing" },
  brief: { title: "Executive brief", file: "executive-brief.md", desc: "a short brief tailored to your audience" },
  followups: { title: "Ask next", file: "follow-up-questions.md", desc: "the sharpest questions to ask next, and where to dig deeper" },
} as const;

export function ChatInsightsDialog({ open, onOpenChange, initialConversation, initialFocus = "decisions" }: Props) {
  const [focus, setFocus] = useState<InsightFocus>(initialFocus);
  const [conversation, setConversation] = useState("");
  const [audience, setAudience] = useState("");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setConversation(initialConversation);
      setFocus(initialFocus);
      setResult("");
      setStatus("idle");
      setError(null);
    } else {
      abortRef.current?.abort();
    }
  }, [open, initialConversation, initialFocus]);

  const run = async () => {
    const text = conversation.trim();
    if (text.length < 20) {
      setError({ message: "Paste or keep a longer conversation to analyse.", retryable: false });
      setStatus("error");
      return;
    }
    if (focus === "brief" && audience.trim().length < 2) {
      setError({ message: "Describe who the brief is for, e.g. \"Board of directors\".", retryable: false });
      setStatus("error");
      return;
    }
    const token = getAuthToken();
    if (!token) {
      setError({ message: "Sign in to your Sutaeru account to use this.", retryable: false });
      setStatus("error");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setError(null);
    setResult("");
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(focus === "brief" ? { conversation: text, focus, audience: audience.trim() } : { conversation: text, focus }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { retryable: res.status === 429 || res.status >= 500 });
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let failed: { message: string; retryable: boolean } | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const event = block.match(/^event: (.*)$/m)?.[1];
          const data = block.match(/^data: (.*)$/m)?.[1];
          if (!data) continue;
          if (event === "token") setResult((prev) => prev + (JSON.parse(data) as string));
          else if (event === "error") failed = JSON.parse(data);
        }
      }
      if (failed) {
        setError(failed);
        setStatus("error");
      } else setStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus((s) => (s === "loading" ? "idle" : s));
        return;
      }
      const e = err as Error & { retryable?: boolean };
      setError({ message: e.message || "Network error — check your connection.", retryable: e.retryable ?? true });
      setStatus("error");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([result], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = FOCUS[focus].file;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loading = status === "loading";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(720px,calc(100vw-1.5rem))] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{focus === "gaps" || focus === "followups" ? <HelpCircle className="h-5 w-5" /> : <ListChecks className="h-5 w-5" />} {FOCUS[focus].title}</DialogTitle>
          <DialogDescription>{focus === "brief" ? "Use this chat or paste a research report. Kemma writes a short brief for your audience, using only the report." : <>Use this chat or paste any conversation. Kemma finds {FOCUS[focus].desc}.</>}</DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label="Analysis type" className="grid grid-cols-2 gap-1 rounded-2xl border border-border p-1 sm:grid-cols-4 sm:rounded-full">
          {(["decisions", "gaps", "followups", "brief"] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={focus === key}
              disabled={loading}
              onClick={() => { setFocus(key); setResult(""); setStatus("idle"); setError(null); }}
              className={`min-h-10 rounded-full px-3 text-xs font-semibold transition-colors ${focus === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {key === "decisions" ? "Decisions" : key === "gaps" ? "Open questions" : key === "followups" ? "Ask next" : "Executive brief"}
            </button>
          ))}
        </div>

        {focus === "brief" && (
          <>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="insights-audience">Target audience</label>
            <input
              id="insights-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              disabled={loading}
              maxLength={300}
              placeholder="e.g. Board of directors, non-technical investors"
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </>
        )}
        <label className="text-xs font-medium text-muted-foreground" htmlFor="insights-conversation">{focus === "brief" ? "Research report" : "Conversation"}</label>
        <textarea
          id="insights-conversation"
          value={conversation}
          onChange={(e) => setConversation(e.target.value)}
          disabled={loading}
          rows={7}
          placeholder={focus === "brief" ? "Paste a research report here…" : "Paste a conversation here…"}
          className="w-full resize-y rounded-xl border border-input bg-background p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />

        <div className="flex flex-wrap gap-2">
          {loading ? (
            <Button variant="outline" className="min-h-11" onClick={() => abortRef.current?.abort()}><Square className="mr-2 h-4 w-4" /> Stop</Button>
          ) : (
            <Button className="min-h-11 rounded-full" onClick={() => void run()} disabled={!conversation.trim()}>
              <ListChecks className="mr-2 h-4 w-4" /> {focus === "brief" ? (status === "done" ? "Write again" : "Write brief") : focus === "followups" ? (status === "done" ? "Suggest again" : "Suggest questions") : status === "done" ? "Extract again" : "Extract"}
            </Button>
          )}
          {status === "done" && result && (
            <>
              <Button variant="outline" className="min-h-11" onClick={() => { void navigator.clipboard.writeText(result); toast.success("Copied"); }}><Copy className="mr-2 h-4 w-4" /> Copy</Button>
              <Button variant="outline" className="min-h-11" onClick={download}><Download className="mr-2 h-4 w-4" /> Markdown</Button>
            </>
          )}
        </div>

        {loading && !result && (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> {focus === "brief" ? "Writing the brief…" : focus === "followups" ? "Thinking of what to ask next…" : "Reading the conversation…"}
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <span className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error.message}</span>
            {error.retryable && <Button size="sm" variant="outline" onClick={() => void run()}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry</Button>}
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-border p-4 text-sm" aria-busy={loading}>
            <MessageResponse>{result}</MessageResponse>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
