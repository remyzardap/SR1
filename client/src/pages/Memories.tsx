import { PAGE_BG, NOISE_OVERLAY, CSS_ANIM } from '@/lib/design';
import { useState, useMemo, useEffect } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trpc } from "@/lib/trpc";
import { callFunction } from "@/lib/kemmaCloud";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────
type MemoryType = "preference" | "fact" | "project" | "document" | "interaction";

const MEMORY_TYPES: MemoryType[] = [
  "preference",
  "fact",
  "project",
  "document",
  "interaction",
];

const TYPE_LABELS: Record<string, string> = {
  preference: "Preference",
  fact: "Fact",
  project: "Project",
  document: "Document",
  interaction: "Interaction",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr: string | Date) {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: "var(--accent-dim)" }}
    />
  );
}

// ─── Type Badge ───────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  preference: {
    bg: "var(--accent-dim)",
    color: "var(--accent-light)",
    border: "var(--accent-border)",
  },
  fact: {
    bg: "var(--secondary-dim)",
    color: "var(--secondary-light)",
    border: "var(--secondary-border)",
  },
  project: {
    bg: "var(--accent-dim)",
    color: "var(--foreground)",
    border: "var(--border)",
  },
  document: {
    bg: "var(--accent-dim)",
    color: "var(--foreground)",
    border: "var(--border)",
  },
  interaction: {
    bg: "rgba(79,107,79,.08)",
    color: "var(--state-success)",
    border: "rgba(79,107,79,.2)",
  },
};

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] ?? {
    bg: "var(--accent-dim)",
    color: "var(--muted-foreground)",
    border: "var(--border)",
  };
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-widest font-semibold"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Add Memory Modal ─────────────────────────────────────────────────────────
function AddMemoryModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<MemoryType>("fact");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");

  const utils = trpc.useUtils();
  const createMutation = trpc.memories.create.useMutation({
    onSuccess: () => {
      utils.memories.list.invalidate();
      onSuccess();
      onClose();
    },
    onError: (err) => {
      setError(err.message ?? "Failed to create memory.");
    },
  });

  function handleSubmit() {
    if (!content.trim()) {
      setError("Content is required.");
      return;
    }
    setError("");
    createMutation.mutate({
      type,
      content: content.trim(),
      sourceApp: source.trim() || undefined,
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2 }}
           className="glass-strong w-full max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6"
        >
          {/* Modal header */}
          <div className="mb-5 flex items-center justify-between">
            <h2
              className="text-sm font-bold uppercase tracking-widest"
              style={{ color: "var(--foreground)" }}
            >
              Add Memory
            </h2>
            <button
              onClick={onClose}
               className="flex h-11 w-11 items-center justify-center rounded-md transition-colors"
               aria-label="Close add memory"
              style={{
                background: "var(--accent-dim)",
                border: "1px solid var(--border)",
                color: "var(--muted-foreground)",
              }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Type selector */}
          <div className="mb-4">
            <label
              className="mb-2 block text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--muted-foreground)" }}
            >
              Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MEMORY_TYPES.map((t) => {
                const c = TYPE_COLORS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-all"
                    style={
                      type === t
                        ? {
                            background: c.bg,
                            color: c.color,
                            border: `1px solid ${c.border}`,
                            boxShadow: `0 0 8px ${c.border}`,
                          }
                        : {
                            background: "var(--accent-dim)",
                            color: "var(--muted-foreground)",
                            border: "1px solid var(--border)",
                          }
                    }
                  >
                    {TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content textarea */}
          <div className="mb-4">
            <label
              className="mb-2 block text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--muted-foreground)" }}
            >
              Content{" "}
              <span style={{ color: "var(--muted-foreground)" }}>(required)</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Enter memory content…"
              className="input-glass w-full resize-none px-3 py-2.5 text-sm outline-none"
            />
          </div>

          {/* Source input */}
          <div className="mb-5">
            <label
              className="mb-2 block text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--muted-foreground)" }}
            >
              Source{" "}
              <span style={{ color: "var(--muted-foreground)" }}>(optional)</span>
            </label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. conversation, document title…"
              className="input-glass w-full px-3 py-2.5 text-sm outline-none"
            />
          </div>

          {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-liquid px-4 py-2 text-xs">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="btn-primary-teal px-4 py-2 text-xs disabled:opacity-50"
            >
              {createMutation.isPending ? "Saving…" : "Save Memory"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Memory Card ──────────────────────────────────────────────────────────────
function MemoryCard({
  memory,
  onDelete,
}: {
  memory: any;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const utils = trpc.useUtils();

  const deleteMutation = trpc.memories.delete.useMutation({
    onSuccess: () => {
      utils.memories.list.invalidate();
    },
  });

  function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 2500);
      return;
    }
    deleteMutation.mutate({ id: memory.id });
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="group glass-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left content */}
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <TypeBadge type={memory.type} />
          <p
            className="text-sm leading-relaxed line-clamp-3"
            style={{ color: "var(--foreground)" }}
          >
            {memory.content}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-0.5">
            {memory.source && (
              <span
                className="flex items-center gap-1 text-[11px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                <span style={{ color: "var(--muted-foreground)" }}>from</span>
                <span className="font-mono" style={{ color: "var(--muted-foreground)" }}>
                  {memory.source}
                </span>
              </span>
            )}
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--muted-foreground)" }}
            >
              {memory.createdAt ? formatDate(memory.createdAt) : "—"}
            </span>
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
             className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-all ${
            confirming
              ? "border-destructive/40 bg-destructive/10 text-destructive"
               : "border-transparent bg-transparent opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
          } disabled:opacity-30`}
          style={confirming ? {} : { color: "var(--muted-foreground)" }}
           title={confirming ? "Click again to confirm" : "Delete memory"}
           aria-label={confirming ? "Confirm delete memory" : "Delete memory"}
        >
          <TrashIcon />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center gap-4 py-24 text-center"
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full glass"
        style={{ border: "1px solid var(--border)" }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--muted-foreground)" }}
        >
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
          <path d="M12 8v4l3 3" />
        </svg>
      </div>
      <div>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          No memories yet
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
          Store facts, preferences, and context your agent should remember.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="btn-liquid flex items-center gap-1.5 px-4 py-2 text-xs"
      >
        <PlusIcon />
        Add first memory
      </button>
    </motion.div>
  );
}

// ─── No Results State ─────────────────────────────────────────────────────────
function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="text-sm" style={{ color: "rgba(122,118,112,0.6)" }}>
        No memories matching{" "}
        <span className="font-mono" style={{ color: "var(--muted-foreground)" }}>
          &quot;{query}&quot;
        </span>
      </p>
    </div>
  );
}

// ─── Living Memory Switch ─────────────────────────────────────────────────────
function MemorySwitch() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    callFunction<{ enabled: boolean }>("memories", { action: "getSetting" })
      .then((r) => { if (!cancelled) setEnabled(r.enabled); })
      .catch(() => { if (!cancelled) setEnabled(true); });
    return () => { cancelled = true; };
  }, []);

  async function toggle() {
    if (enabled === null || saving) return;
    setSaving(true);
    try {
      const next = !enabled;
      await callFunction("memories", { action: "setSetting", enabled: next });
      setEnabled(next);
    } catch {
      // keep the previous state
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg px-4 py-3"
      style={{ background: "var(--accent-dim)", border: "1px solid var(--border)" }}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
          Living memory
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
          {enabled === false
            ? "Off — Kemma stops noting new things from your chats. Existing memories stay."
            : "On — after each chat, Kemma quietly notes anything worth remembering here."}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={enabled !== false}
        aria-label="Toggle living memory"
        onClick={() => void toggle()}
        disabled={enabled === null || saving}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40"
        style={{ background: enabled !== false ? "var(--btn-fill, #E8500F)" : "var(--border)" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
          style={{ transform: enabled !== false ? "translateX(22px)" : "translateX(2px)" }}
        />
      </button>
    </div>
  );
}

// ─── Memories Page ────────────────────────────────────────────────────────────
export default function Memories() {
  useSeoMeta({ title: "Memories", path: "/memories" });

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | MemoryType>("all");
  const [showModal, setShowModal] = useState(false);

  const { data: memories = [], isLoading } = trpc.memories.list.useQuery();

  const filtered = useMemo(() => {
    let result = memories as any[];
    if (activeTab !== "all") {
      result = result.filter((m: any) => m.type === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m: any) =>
          m.content?.toLowerCase().includes(q) || m.source?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [memories, activeTab, search]);

  const tabs = ["all", ...MEMORY_TYPES] as const;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
         className="sutaeru-editorial-page flex flex-col gap-5 p-3 sm:p-6 max-w-3xl mx-auto w-full min-w-0"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1
              className="text-xl font-bold"
              style={{ color: "var(--foreground)" }}
            >
              Memories
            </h1>
            {!isLoading && (
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-mono"
                style={{
                  background: "var(--accent-dim)",
                  border: "1px solid var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                {(memories as any[]).length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary-teal px-3.5 py-2 text-xs inline-flex items-center gap-1.5"
          >
            <PlusIcon />
            Add Memory
          </button>
        </div>

        {/* ── Living memory switch ── */}
        <MemorySwitch />

        {/* ── Search bar ── */}
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--muted-foreground)" }}
          >
            <SearchIcon />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories…"
            className="input-glass w-full py-2.5 pl-9 pr-4 text-sm outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
               className="absolute right-0 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center transition-colors"
               aria-label="Clear search"
              style={{ color: "var(--muted-foreground)" }}
            >
              <CloseIcon />
            </button>
          )}
        </div>

        {/* ── Filter tabs ── */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {tabs.map((tab) => {
            const count =
              tab === "all"
                ? (memories as any[]).length
                : (memories as any[]).filter((m: any) => m.type === tab).length;
            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                 className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all"
                style={
                  isActive
                    ? {
                        background: "var(--accent-dim)",
                        color: "var(--accent-light)",
                        border: "1px solid var(--accent-border)",
                      }
                    : {
                        color: "var(--muted-foreground)",
                        border: "1px solid transparent",
                      }
                }
              >
                {tab === "all" ? "All" : TYPE_LABELS[tab]}
                <span
                  className="text-[10px]"
                  style={{
                    color: isActive ? "var(--muted-foreground)" : "var(--muted-foreground)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="glass-card p-4"
              >
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-3 w-24 mt-1" />
                </div>
              </div>
            ))}
          </div>
        ) : (memories as any[]).length === 0 ? (
          <EmptyState onAdd={() => setShowModal(true)} />
        ) : filtered.length === 0 ? (
          <NoResults query={search || activeTab} />
        ) : (
          <motion.div layout className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((memory: any) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  onDelete={() => {}}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>

      {/* ── Add Memory Modal ── */}
      <AnimatePresence>
        {showModal && (
          <AddMemoryModal
            onClose={() => setShowModal(false)}
            onSuccess={() => setShowModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
