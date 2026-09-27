/**
 * Universal Block Component
 * Renders any block type with consistent action bar: pin, fork, lock, archive, permalink, copy
 *
 * ✨ Modern UX Features:
 * - Spring physics animations (snappy collapse/expand)
 * - Always-visible collapse indicator (left strip)
 * - Peek preview on hover when collapsed
 * - Haptic-like visual feedback on interactions
 * - Keyboard shortcuts (Space to toggle, arrows to navigate)
 * - Smart content preview
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Pin, PinOff, GitFork, Lock, Unlock, Archive,
  Link2, ChevronDown, ChevronUp, MessageSquare,
  FileText, BookOpen, CheckSquare, Play, Mic,
  LayoutDashboard, StickyNote, Copy, Sparkles,
  Eye,
} from "lucide-react";

export type BlockType = "chat" | "atelier" | "memory" | "task" | "media" | "transcript" | "widget" | "note";
export type BlockSource = "s1" | "atelier" | "her" | "user" | "feed" | "system";

export interface BlockData {
  id: string;
  type: BlockType;
  source: BlockSource;
  parentId?: string | null;
  sessionId?: string | null;
  title?: string | null;
  content: Record<string, unknown>;
  agentId?: string | null;
  pinned: boolean;
  locked: boolean;
  archived: boolean;
  tags: string[] | unknown;
  position: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const TYPE_ICON: Record<BlockType, React.ElementType> = {
  chat: MessageSquare, atelier: FileText, memory: BookOpen,
  task: CheckSquare, media: Play, transcript: Mic,
  widget: LayoutDashboard, note: StickyNote,
};

const TYPE_COLOR: Record<BlockType, string> = {
  chat: "#f2f2f2", atelier: "#a78bfa", memory: "#f59e0b",
  task: "#2dd4bf", media: "#f97316", transcript: "#f43f5e",
  widget: "#0069ff", note: "#84cc16",
};

const AGENT_COLORS: Record<string, string> = {
  qwen: "#7c3aed", gemini: "#4285f4", sonar: "#2dd4bf", blend: "#f2f2f2", s1: "#f2f2f2",
};

// ─── Content renderers ────────────────────────────────────────────────────────

function ChatContent({ content }: { content: Record<string, unknown> }) {
  return (
    <p className="text-[14px] leading-relaxed whitespace-pre-wrap line-clamp-6"
      style={{ color: "rgba(242,242,242,0.80)" }}>
      {(content.text as string) ?? ""}
    </p>
  );
}

function AtelierContent({ content }: { content: Record<string, unknown> }) {
  const sections = (content.sections as Array<{ title?: string; type?: string }>) ?? [];
  return (
    <div className="flex flex-col gap-2">
      {typeof content.reportTitle === "string" && (
        <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{content.reportTitle as string}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {sections.slice(0, 5).map((s, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full"
            style={{ background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.18)", color: "#a78bfa" }}>
            {s.title ?? s.type ?? `Section ${i + 1}`}
          </span>
        ))}
        {sections.length > 5 && (
          <span className="text-[11px]" style={{ color: "rgba(242,242,242,0.3)" }}>+{sections.length - 5} more</span>
        )}
      </div>
      {typeof content.preview === "string" && (
        <p className="text-[13px] line-clamp-2" style={{ color: "rgba(242,242,242,0.45)" }}>{content.preview as string}</p>
      )}
    </div>
  );
}

function MemoryContent({ content }: { content: Record<string, unknown> }) {
  return (
    <div>
      {typeof content.memoryType === "string" && (
        <span className="text-[10px] uppercase tracking-widest font-semibold"
          style={{ color: "#f59e0b" }}>{content.memoryType as string} · </span>
      )}
      <span className="text-[14px] leading-relaxed" style={{ color: "rgba(242,242,242,0.75)" }}>
        {content.text as string ?? ""}
      </span>
    </div>
  );
}

function TaskContent({ content }: { content: Record<string, unknown> }) {
  const done = content.status === "done";
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded-md mt-0.5 shrink-0 flex items-center justify-center"
        style={{ background: done ? "rgba(45,212,191,0.12)" : "transparent", border: `1px solid ${done ? "rgba(45,212,191,0.3)" : "rgba(255,255,255,0.12)"}` }}>
        {done && <span style={{ color: "#2dd4bf", fontSize: 11 }}>✓</span>}
      </div>
      <div>
        <p className="text-[14px]" style={{ color: done ? "rgba(242,242,242,0.4)" : "rgba(242,242,242,0.8)", textDecoration: done ? "line-through" : "none" }}>
          {content.title as string ?? "Untitled task"}
        </p>
        {typeof content.dueDate === "string" && (
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(242,242,242,0.3)" }}>Due {content.dueDate as string}</p>
        )}
      </div>
    </div>
  );
}

function TranscriptContent({ content }: { content: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#f43f5e" }} />
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "#f43f5e" }}>
          {content.duration ? `${content.duration}` : "Call"} · {content.caller as string ?? "Unknown"}
        </span>
      </div>
      <p className="text-[13px] line-clamp-3" style={{ color: "rgba(242,242,242,0.55)" }}>
        {content.summary as string ?? content.text as string ?? "No transcript available"}
      </p>
      {Array.isArray(content.actions) && content.actions.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {(content.actions as string[]).slice(0, 3).map((a, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.18)", color: "#f43f5e" }}>
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteContent({ content }: { content: Record<string, unknown> }) {
  return (
    <p className="text-[14px] leading-relaxed whitespace-pre-wrap line-clamp-8"
      style={{ color: "rgba(242,242,242,0.75)", fontFamily: "'Manrope', sans-serif" }}>
      {content.text as string ?? "Empty note"}
    </p>
  );
}

function GenericContent({ content }: { content: Record<string, unknown> }) {
  const text = content.text ?? content.summary ?? content.title ?? content.body;
  return (
    <p className="text-[13px] leading-relaxed line-clamp-4" style={{ color: "rgba(242,242,242,0.6)" }}>
      {typeof text === "string" ? text : JSON.stringify(content).slice(0, 200)}
    </p>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({ icon: Icon, label, onClick, active, color }: {
  icon: React.ElementType; label: string; onClick: () => void;
  active?: boolean; color?: string;
}) {
  return (
    <button onClick={onClick} title={label}
      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150"
      style={{
        background: active ? `${color ?? "#f2f2f2"}12` : "transparent",
        border: active ? `1px solid ${color ?? "#f2f2f2"}25` : "1px solid transparent",
        color: active ? (color ?? "#f2f2f2") : "rgba(242,242,242,0.25)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = color ?? "#f2f2f2"; (e.currentTarget as HTMLButtonElement).style.background = `${color ?? "#f2f2f2"}10`; }}
      onMouseLeave={(e) => {
        if (!active) { (e.currentTarget as HTMLButtonElement).style.color = "rgba(242,242,242,0.25)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }
      }}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

// ─── Main Block component ─────────────────────────────────────────────────────

export function Block({
  block,
  compact = false,
  onUpdate,
}: {
  block: BlockData;
  compact?: boolean;
  onUpdate?: (updated: BlockData) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [localBlock, setLocalBlock] = useState(block);
  const blockRef = useRef<HTMLDivElement>(null);

  // Spring physics for smooth interactions
  const scale = useMotionValue(1);
  const springScale = useSpring(scale, { stiffness: 400, damping: 25 });

  const utils = trpc.useUtils();
  const updateMutation = trpc.blocks.update.useMutation({
    onSuccess: (updated) => {
      if (updated) { setLocalBlock(updated as unknown as BlockData); onUpdate?.(updated as unknown as BlockData); }
      void utils.blocks.pinned.invalidate();
      void utils.blocks.list.invalidate();
    },
  });
  const forkMutation = trpc.blocks.fork.useMutation({
    onSuccess: () => { toast.success("Block forked"); void utils.blocks.list.invalidate(); },
  });
  const deleteMutation = trpc.blocks.delete.useMutation({
    onSuccess: () => { toast.success("Block archived"); void utils.blocks.list.invalidate(); void utils.blocks.pinned.invalidate(); },
  });

  const Icon = TYPE_ICON[localBlock.type] ?? Sparkles;
  const typeColor = TYPE_COLOR[localBlock.type] ?? "#f2f2f2";
  const agentColor = localBlock.agentId ? (AGENT_COLORS[localBlock.agentId] ?? "#f2f2f2") : typeColor;

  // Haptic-like feedback
  const handlePress = useCallback(() => {
    scale.set(0.98);
    setTimeout(() => scale.set(1), 100);
  }, [scale]);

  const toggle = (field: "pinned" | "locked") => {
    const val = !localBlock[field];
    setLocalBlock((b) => ({ ...b, [field]: val }));
    updateMutation.mutate({ id: localBlock.id, [field]: val });
    handlePress();
    toast.success(field === "pinned" ? (val ? "Pinned to Board" : "Unpinned") : (val ? "Block locked" : "Block unlocked"));
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(`${window.location.origin}/block/${localBlock.id}`);
    handlePress();
    toast.success("Link copied");
  };

  const copyContent = () => {
    const text = (localBlock.content.text as string) ?? JSON.stringify(localBlock.content, null, 2);
    void navigator.clipboard.writeText(text);
    handlePress();
    toast.success("Copied");
  };

  const toggleCollapse = () => {
    handlePress();
    setCollapsed((c) => !c);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!blockRef.current || document.activeElement !== blockRef.current) return;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleCollapse();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleCollapse]);

  // Smart content preview (extract key info)
  const getPreviewText = useCallback(() => {
    const content = localBlock.content;
    if (typeof content.text === "string") return content.text.slice(0, 80);
    if (typeof content.summary === "string") return content.summary.slice(0, 80);
    if (typeof content.title === "string") return content.title.slice(0, 80);
    return "";
  }, [localBlock.content]);

  const renderContent = () => {
    switch (localBlock.type) {
      case "chat":       return <ChatContent       content={localBlock.content} />;
      case "atelier":    return <AtelierContent    content={localBlock.content} />;
      case "memory":     return <MemoryContent     content={localBlock.content} />;
      case "task":       return <TaskContent       content={localBlock.content} />;
      case "transcript": return <TranscriptContent content={localBlock.content} />;
      case "note":       return <NoteContent       content={localBlock.content} />;
      default:           return <GenericContent    content={localBlock.content} />;
    }
  };

  const tags = Array.isArray(localBlock.tags) ? localBlock.tags as string[] : [];
  const createdAt = new Date(localBlock.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const previewText = getPreviewText();

  return (
    <motion.div
      ref={blockRef}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="group relative rounded-2xl overflow-hidden cursor-default"
      style={{
        background: localBlock.pinned ? `${typeColor}07` : "var(--elev-1-bg)",
        border: localBlock.pinned ? `1px solid ${typeColor}18` : "1px solid var(--elev-1-border)",
        boxShadow: "var(--elev-1-shadow)",
        opacity: localBlock.archived ? 0.4 : 1,
        scale: springScale,
      }}
      tabIndex={0}
      role="button"
      aria-label={`Block: ${localBlock.title || localBlock.type}`}
      onMouseEnter={() => collapsed && setIsPeeking(true)}
      onMouseLeave={() => setIsPeeking(false)}
    >
      {/* Collapse Indicator (Left Strip) */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 w-1 z-10"
        style={{ background: collapsed ? "transparent" : typeColor }}
        animate={{ opacity: collapsed ? 0.3 : 1 }}
        transition={{ duration: 0.15 }}
      />

      {/* Peek Preview (On Hover When Collapsed) */}
      <AnimatePresence>
        {collapsed && isPeeking && previewText && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="px-4 pb-3 border-t border-[var(--line-1)]"
            style={{ background: "var(--elev-2-bg)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-3 h-3" style={{ color: "var(--t3)" }} />
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--t3)" }}>Preview</span>
            </div>
            <p className="text-[12px] leading-relaxed line-clamp-2" style={{ color: "var(--t2)" }}>
              {previewText}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
        {/* Type icon */}
        <motion.div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${typeColor}12`, border: `1px solid ${typeColor}22` }}
          whileHover={{ scale: 1.05, rotate: 5 }}
          transition={{ duration: 0.15 }}
        >
          <Icon className="w-3 h-3" style={{ color: typeColor }} />
        </motion.div>

        {/* Title / meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {localBlock.title && (
              <p className="text-[13px] font-medium truncate" style={{ color: "rgba(242,242,242,0.80)" }}>
                {localBlock.title}
              </p>
            )}
            {localBlock.agentId && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: `${agentColor}12`, border: `1px solid ${agentColor}22`, color: agentColor }}>
                {localBlock.agentId}
              </span>
            )}
            {localBlock.source !== "user" && !localBlock.agentId && (
              <span className="text-[10px] uppercase tracking-widest shrink-0" style={{ color: "rgba(242,242,242,0.25)" }}>
                {localBlock.source}
              </span>
            )}
          </div>
        </div>

        {/* Collapse toggle (always visible, subtle) */}
        <motion.button
          onClick={toggleCollapse}
          className="shrink-0 transition-opacity"
          style={{ color: "rgba(242,242,242,0.25)" }}
          whileHover={{ scale: 1.1, color: "rgba(242,242,242,0.5)" }}
          whileTap={{ scale: 0.95 }}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          <motion.div
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.div>
        </motion.button>
      </div>

      {/* Content (Spring Animation) */}
      <AnimatePresence initial={false} mode="wait">
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.34, 1.56, 0.64, 1], // Spring bounce
            }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">{renderContent()}</div>

            {/* Tags */}
            {tags.length > 0 && (
              <motion.div
                className="flex flex-wrap gap-1.5 px-4 pb-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                {tags.map((tag, i) => (
                  <motion.span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(242,242,242,0.35)",
                    }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03, duration: 0.2 }}
                    whileHover={{ scale: 1.05, borderColor: "rgba(255,255,255,0.15)" }}
                  >
                    {tag}
                  </motion.span>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action bar */}
      <div className={`flex items-center justify-between px-3 pb-2.5 ${collapsed ? "pt-1" : ""}`}>
        <span className="text-[11px]" style={{ color: "rgba(242,242,242,0.2)" }}>{createdAt}</span>
        <div className="flex items-center gap-0.5">
          <ActionBtn icon={localBlock.pinned ? PinOff : Pin} label={localBlock.pinned ? "Unpin" : "Pin to Board"}
            onClick={() => toggle("pinned")} active={localBlock.pinned} color={typeColor} />
          <ActionBtn icon={localBlock.locked ? Unlock : Lock} label={localBlock.locked ? "Unlock" : "Lock"}
            onClick={() => toggle("locked")} active={localBlock.locked} color="#f59e0b" />
          <ActionBtn icon={GitFork} label="Fork" onClick={() => forkMutation.mutate({ id: localBlock.id })} />
          <ActionBtn icon={Copy} label="Copy content" onClick={copyContent} />
          <ActionBtn icon={Link2} label="Copy permalink" onClick={copyLink} />
          <ActionBtn icon={Archive} label="Archive" onClick={() => deleteMutation.mutate({ id: localBlock.id })} color="#f43f5e" />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Block skeleton ───────────────────────────────────────────────────────────

export function BlockSkeleton() {
  return (
    <div className="rounded-2xl p-4 animate-pulse" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-6 h-6 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-3 w-32 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="h-3 w-4/5 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="h-3 w-3/5 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>
    </div>
  );
}
