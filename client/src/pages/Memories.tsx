import { useState, useMemo, useEffect } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trpc } from "@/lib/trpc";
import { callFunction } from "@/lib/kemmaCloud";
import { motion, AnimatePresence } from "framer-motion";
import SutaeruIcon from "@/components/SutaeruIcon";

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
  return <div className={`sk-skeleton ${className}`} />;
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
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(36, 35, 32, 0.48)" }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2 }}
          className="sk-dialog w-full max-w-lg max-h-[90dvh] overflow-y-auto"
        >
          {/* Modal header */}
          <div className="mb-5 flex items-start justify-between gap-3">
            <h2>Add Memory</h2>
            <button
              onClick={onClose}
              className="sk-icon-btn"
              aria-label="Close add memory"
            >
              <SutaeruIcon name="close" width={18} height={18} />
            </button>
          </div>

          {/* Type selector */}
          <div className="sk-field mb-4">
            <span className="sk-label">Type</span>
            <div className="sk-filters">
              {MEMORY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`sk-pill ${type === t ? "is-active" : ""}`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Content textarea */}
          <div className="sk-field mb-4">
            <span className="sk-label">Content (required)</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Enter memory content…"
              className="sk-textarea"
            />
          </div>

          {/* Source input */}
          <div className="sk-field mb-5">
            <span className="sk-label">Source (optional)</span>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. conversation, document title…"
              className="sk-input"
            />
          </div>

          {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="sk-btn sk-btn-ghost">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="sk-btn"
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
      className="sk-tile group"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="sk-label"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span className="sk-dot sk-dot-ink" />
          {TYPE_LABELS[memory.type] ?? memory.type}
        </span>

        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className={`sk-icon-btn -mt-1 -mr-1 shrink-0 transition-all ${
            confirming
              ? "opacity-100"
              : "lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
          } disabled:opacity-30`}
          style={
            confirming
              ? { background: "#FCE9DE", color: "var(--neon-orange)" }
              : undefined
          }
          title={confirming ? "Click again to confirm" : "Delete memory"}
          aria-label={confirming ? "Confirm delete memory" : "Delete memory"}
        >
          <SutaeruIcon name="delete" width={16} height={16} />
        </button>
      </div>

      <p className="m-0 text-[15px] leading-relaxed line-clamp-3">
        {memory.content}
      </p>

      <span className="sk-meta">
        ADDED {memory.createdAt ? formatDate(memory.createdAt) : "-"}
        {memory.sourceApp ?? memory.source ? ` · FROM ${memory.sourceApp ?? memory.source}` : ""}
      </span>
    </motion.div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="sk-card sk-empty"
    >
      <span className="sk-label">No memories yet</span>
      <p className="sk-empty-text">
        Store facts, preferences, and context your agent should remember.
      </p>
      <button
        onClick={onAdd}
        className="sk-btn self-start"
        style={{ marginTop: 8 }}
      >
        Add first memory
      </button>
    </motion.div>
  );
}

// ─── No Results State ─────────────────────────────────────────────────────────
function NoResults({ query }: { query: string }) {
  return (
    <div className="sk-card sk-empty">
      <span className="sk-label">No results</span>
      <p className="sk-empty-text">
        No memories matching{" "}
        <span className="sk-num">&quot;{query}&quot;</span>
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
    <div className="sk-card-dark h-full">
      <div className="flex items-start gap-4 min-w-0">
        <SutaeruIcon
          name="lock"
          width={26}
          height={26}
          style={{ flex: "none", color: "var(--art-paper)", marginTop: 2 }}
        />
        <div className="min-w-0 flex-1">
          <span className="sk-label">Living memory</span>
          <p className="sk-dark-sub">
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
          className={`sk-toggle ${enabled !== false ? "is-on" : ""}`}
          style={{ marginTop: 4 }}
        />
      </div>
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
          m.content?.toLowerCase().includes(q) || (m.sourceApp ?? m.source)?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [memories, activeTab, search]);

  const tabs = ["all", ...MEMORY_TYPES] as const;

  const total = (memories as any[]).length;
  const shownPct = total > 0 ? Math.round((filtered.length / total) * 100) : 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="sk-page w-full min-w-0"
      >
        {/* ── Header ── */}
        <div className="sk-header">
          <div>
            <h1 className="sk-h1">Memories</h1>
            <p className="sk-sub">
              What Sutaeru knows about you. Private, editable, yours.
            </p>
          </div>
          <div className="sk-actions">
            <button
              onClick={() => setShowModal(true)}
              className="sk-btn"
            >
              Add Memory
            </button>
          </div>
        </div>

        {/* ── Search + filters ── */}
        <div className="sk-toolbar">
          <div className="sk-search">
            <SutaeruIcon name="search" width={16} height={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories…"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="sk-icon-btn"
                style={{ width: 32, height: 32 }}
                aria-label="Clear search"
              >
                <SutaeruIcon name="close" width={14} height={14} />
              </button>
            )}
          </div>
          <div className="sk-filters">
            {tabs.map((tab) => {
              const count =
                tab === "all"
                  ? total
                  : (memories as any[]).filter((m: any) => m.type === tab).length;
              const isActive = activeTab === tab;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`sk-pill ${isActive ? "is-active" : ""}`}
                >
                  {tab === "all" ? "All" : TYPE_LABELS[tab]}
                  <span
                    className="sk-num"
                    style={{ fontSize: 12, opacity: isActive ? 0.7 : 0.55 }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <div className="sk-grid-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sk-card">
                <div className="sk-col">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyState onAdd={() => setShowModal(true)} />
        ) : filtered.length === 0 ? (
          <NoResults query={search || activeTab} />
        ) : (
          <motion.div layout className="sk-grid-3">
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

        {/* ── Privacy + usage ── */}
        <div className="sk-grid-3" style={{ marginTop: 28 }}>
          <div className="md:col-span-2">
            <MemorySwitch />
          </div>
          {!isLoading && (
            <div className="sk-card sk-stat">
              <span className="sk-label">Memories</span>
              <div className="sk-stat-num">{total}</div>
              <div className="sk-progress" style={{ marginTop: 14 }}>
                <span
                  className="sk-progress-fill"
                  style={{ width: `${shownPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
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
