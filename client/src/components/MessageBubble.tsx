import { useState } from "react";
import { motion } from "framer-motion";
import { BookmarkPlus, Copy, Check, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { NEON, NEON_FD, NEON_FM } from "@/lib/design";

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
    <div className="my-3 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(10,10,10,0.06)" }}>
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ background: "rgba(10,10,10,0.03)", borderBottom: "1px solid rgba(10,10,10,0.05)" }}
      >
        <span className="text-[10px] tracking-widest uppercase font-mono" style={{ color: NEON.muted }}>
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] tracking-widest uppercase font-mono transition-colors"
          style={{ color: copied ? NEON.orange : NEON.muted }}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto" style={{ background: "#f7f4ed" }}>
        <code className="font-mono text-[13px] leading-relaxed" style={{ color: NEON.ink }}>
          {code}
        </code>
      </pre>
    </div>
  );
}

function renderTextWithCitations(text: string) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      return <span key={i} className="neon-citation">{match[1]}</span>;
    }
    return <span key={i} className="whitespace-pre-wrap">{part}</span>;
  });
}

function getModelMeta(model?: string) {
  if (!model) return null;
  return { label: model, color: NEON.orange };
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
        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mb-1"
        style={
          isUser
            ? { background: "rgba(10,10,10,0.08)", border: "1px solid rgba(10,10,10,0.10)", color: NEON.ink }
            : { background: NEON.orangeDim, border: `1px solid ${NEON.orange}25`, color: NEON.orange }
        }
      >
        {isUser ? "Y" : "S"}
      </div>

      {/* Bubble */}
      <div className={cn("max-w-[84%] sm:max-w-[72%] flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
        <div
          className={cn("px-4 py-3 text-[14px] leading-relaxed", isUser ? "rounded-[22px] rounded-br-md" : "rounded-[22px] rounded-bl-md")}
          style={{
            background: isUser ? NEON.black : "#ffffff",
            color: isUser ? NEON.cream : NEON.ink,
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
            border: isUser ? "none" : "1px solid rgba(10,10,10,0.05)",
          }}
        >
          {message.streaming && !message.content ? (
            <div className="flex gap-1.5 items-center py-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: NEON.orange }}
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
                  <span key={i}>{renderTextWithCitations(seg.value)}</span>
                )
              )}
              {message.streaming && (
                <span className="inline-block w-[2px] h-[1em] ml-0.5 align-middle animate-pulse" style={{ backgroundColor: NEON.orange }} />
              )}
            </>
          )}
        </div>

        {/* Footer row */}
        <div className={cn("flex items-center gap-2 px-1", isUser ? "flex-row-reverse" : "")}>
          <span className="text-[10px] font-mono" style={{ color: NEON.muted }}>
            {formatTime(message.createdAt)}
          </span>
          {!message.streaming && modelMeta && (
            <span className="text-[10px] font-mono tracking-wide" style={{ color: modelMeta.color, opacity: 0.85 }}>
              {modelMeta.label}
            </span>
          )}
        </div>

        {/* Action bar */}
        {!isUser && !message.streaming && (
          <div className="flex items-center gap-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {[
              { icon: copied ? Check : Copy, label: "Copy", onClick: handleCopy, color: copied ? NEON.orange : undefined },
              { icon: Pin, label: "Pin to Board", onClick: handlePin, color: undefined },
              { icon: BookmarkPlus, label: "Save to memory", onClick: () => onSave?.(message.content), color: undefined },
            ].map(({ icon: Icon, label, onClick, color }) => (
              <button key={label} onClick={onClick} title={label}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-all"
                style={{ background: "rgba(10,10,10,0.04)", border: "1px solid rgba(10,10,10,0.06)", color: color ?? NEON.muted }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = NEON.ink; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(10,10,10,0.12)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = color ?? NEON.muted; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(10,10,10,0.06)"; }}
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
