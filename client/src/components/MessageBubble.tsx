import { useState } from "react";
import { motion } from "framer-motion";
import { BookmarkPlus, Copy, Check, Pin, GitFork } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  streaming?: boolean;
  createdAt: Date;
}

interface MessageBubbleProps {
  message: Message;
  onSave?: (content: string) => void;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function parseContent(
  content: string
): Array<{ type: "text" | "code"; value: string; lang?: string }> {
  const segments: Array<{ type: "text" | "code"; value: string; lang?: string }> = [];
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = codeBlockRe.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: "code", value: match[2].trimEnd(), lang: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }
  return segments;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="my-3 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.09)" }}>
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <span className="text-[10px] tracking-widest uppercase font-mono" style={{ color: "rgba(242,242,242,0.3)" }}>
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] tracking-widest uppercase font-mono transition-colors"
          style={{ color: copied ? "#2dd4bf" : "rgba(242,242,242,0.3)" }}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto" style={{ background: "rgba(0,0,0,0.35)" }}>
        <code className="font-mono text-[13px] leading-relaxed" style={{ color: "rgba(242,242,242,0.82)" }}>
          {code}
        </code>
      </pre>
    </div>
  );
}

function getModelMeta(model?: string) {
  if (!model) return null;
  return { label: "S1", color: "rgba(232,68,42,0.6)" };
}

export function MessageBubble({ message, onSave }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const segments = parseContent(message.content);
  const modelMeta = getModelMeta(message.model);
  const [copied, setCopied] = useState(false);

  const utils = trpc.useUtils();
  const createBlock = trpc.blocks.create.useMutation({
    onSuccess: () => {
      toast.success("Pinned to Board");
      void utils.blocks.pinned.invalidate();
    },
  });

  const handleCopy = () => {
    void navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handlePin = () => {
    createBlock.mutate({
      type: "chat",
      source: "s1",
      content: { text: message.content },
      pinned: true,
      tags: [],
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn("group flex items-end gap-3 mb-6", isUser ? "flex-row-reverse" : "")}
    >
      {/* Avatar */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mb-1"
        style={
          isUser
            ? { background: "rgba(242,242,242,0.08)", border: "1px solid rgba(242,242,242,0.12)", color: "rgba(242,242,242,0.6)" }
            : { background: "rgba(232,68,42,0.08)", border: "1px solid rgba(232,68,42,0.18)", color: "#E8442A" }
        }
      >
        {isUser ? "Y" : "S"}
      </div>

      {/* Bubble */}
      <div className={cn("max-w-[84%] sm:max-w-[72%] flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
        <div
          className={cn("px-4 py-3 text-[14px] leading-relaxed", isUser ? "chat-bubble-user text-[#f0ede8]" : "chat-bubble-ai text-[#f0ede8]")}
        >
          {message.streaming && !message.content ? (
            <div className="flex gap-1.5 items-center py-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "rgba(242,242,242,0.4)" }}
                  animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </div>
          ) : (
            <>
              {segments.map((seg, i) =>
                seg.type === "code" ? (
                  <CodeBlock key={i} code={seg.value} lang={seg.lang} />
                ) : (
                  <span key={i} className="whitespace-pre-wrap">{seg.value}</span>
                )
              )}
              {message.streaming && (
                <span className="inline-block w-[2px] h-[1em] ml-0.5 align-middle animate-pulse" style={{ backgroundColor: "rgba(242,242,242,0.5)" }} />
              )}
            </>
          )}
        </div>

        {/* Footer row */}
        <div className={cn("flex items-center gap-2 px-1", isUser ? "flex-row-reverse" : "")}>
          <span className="text-[10px] font-mono" style={{ color: "rgba(242,242,242,0.22)" }}>
            {formatTime(message.createdAt)}
          </span>
          {!message.streaming && modelMeta && (
            <span className="text-[10px] font-mono tracking-wide" style={{ color: modelMeta.color, opacity: 0.65 }}>
              {modelMeta.label}
            </span>
          )}
        </div>

        {/* Block action bar — assistant messages only */}
        {!isUser && !message.streaming && (
          <div className="flex items-center gap-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {[
              { icon: copied ? Check : Copy, label: "Copy", onClick: handleCopy, color: copied ? "#2dd4bf" : undefined },
              { icon: Pin, label: "Pin to Board", onClick: handlePin, color: undefined },
              { icon: BookmarkPlus, label: "Save to memory", onClick: () => onSave?.(message.content), color: undefined },
            ].map(({ icon: Icon, label, onClick, color }) => (
              <button key={label} onClick={onClick} title={label}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: color ?? "rgba(242,242,242,0.4)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f2f2f2"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.16)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = color ?? "rgba(242,242,242,0.4)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
