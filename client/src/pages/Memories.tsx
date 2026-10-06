import { useState, useMemo, useEffect } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trpc } from "@/lib/trpc";
import { callFunction } from "@/lib/kemmaCloud";
import { motion, AnimatePresence } from "framer-motion";
import SutaeruIcon from "@/components/SutaeruIcon";
import { Chip, HalftoneRamp, Toggle } from "@/components/art";
import { PageTitle } from "@/components/chrome/PageTitle";
import { relativeTime } from "@/lib/relativeTime";
import "@/styles/list-pages.css";

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

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ w, h = 14 }: { w: string; h?: number }) {
  return <span className="lp-skeleton" style={{ width: w, height: h }} />;
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
        style={{ background: "color-mix(in srgb, var(--r-ink) 48%, transparent)" }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2 }}
          className="sk-dialog lp-dialog w-full max-w-lg max-h-[90dvh] overflow-y-auto"
        >
          {/* Modal header */}
          <div className="mb-5 flex items-start justify-between gap-3">
            <h2>Add Memory</h2>
            <button
              onClick={onClose}
              className="lp-icon-btn"
              aria-label="Close add memory"
            >
              <SutaeruIcon name="close" width={18} height={18} />
            </button>
          </div>

          {/* Type selector: one card per memory type */}
          <div className="lp-field-group mb-4">
            <span className="lp-mono">Type</span>
            <div className="lp-chips lp-chips-scroll" role="radiogroup" aria-label="Memory type">
              {MEMORY_TYPES.map((t) => (
                <Chip key={t} active={type === t} onClick={() => setType(t)}>
                  {TYPE_LABELS[t]}
                </Chip>
              ))}
            </div>
          </div>

          {/* Content textarea */}
          <div className="lp-field-group mb-4">
            <label className="lp-mono" htmlFor="memory-content">Content (required)</label>
            <textarea
              id="memory-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Enter memory content..."
              className="lp-field lp-area"
            />
          </div>

          {/* Source input */}
          <div className="lp-field-group mb-5">
            <label className="lp-mono" htmlFor="memory-source">Source (optional)</label>
            <input
              id="memory-source"
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. conversation, document title..."
              className="lp-field"
            />
          </div>

          {error && <p className="mb-3 text-sm" style={{ color: "var(--r-alert)" }}>{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="lp-btn lp-btn-quiet">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="lp-btn"
            >
              {createMutation.isPending ? "Saving..." : "Save Memory"}
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
}: {
  memory: any;
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
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="lp-row"
    >
      <div className="lp-row-main">
        <span className="lp-mono">{TYPE_LABELS[memory.type] ?? memory.type}</span>
        <p className="lp-row-title line-clamp-3" style={{ fontWeight: 600 }}>
          {memory.content}
        </p>
        <span className="lp-body">
          Added {memory.createdAt ? relativeTime(memory.createdAt) : "recently"}
          {memory.sourceApp ?? memory.source ? ` · from ${memory.sourceApp ?? memory.source}` : ""}
        </span>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleteMutation.isPending}
        className="lp-icon-btn"
        style={confirming ? { background: "var(--r-accent-tint)", color: "var(--r-accent)" } : undefined}
        title={confirming ? "Click again to confirm" : "Delete memory"}
        aria-label={confirming ? "Confirm delete memory" : "Delete memory"}
      >
        <SutaeruIcon name="delete" width={16} height={16} />
      </button>
    </motion.li>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lp-empty">
      <HalftoneRamp columns={7} rows={9} className="lp-empty-mark" />
      <h2 className="lp-empty-title">Nothing remembered yet.</h2>
      <p className="lp-empty-text">
        Store facts, preferences, and context your agent should remember.
      </p>
      <button onClick={onAdd} className="lp-btn">
        Add first memory
      </button>
    </motion.div>
  );
}

// ─── No Results State ─────────────────────────────────────────────────────────
function NoResults({ query }: { query: string }) {
  return (
    <div className="lp-empty">
      <span className="lp-mono">No results</span>
      <p className="lp-empty-text">
        No memories matching &quot;{query}&quot;
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
    <section className="lp-dark">
      <HalftoneRamp columns={8} rows={10} className="lp-dark-ramp" />
      <SutaeruIcon
        name="admin"
        width={30}
        height={30}
        className="lp-dark-icon"
        aria-hidden="true"
      />
      <div className="lp-dark-body">
        <span className="lp-mono">Living memory</span>
        <p className="lp-dark-text">
          {enabled === false
            ? "Off. Sutaeru stops noting new things from your chats. Existing memories stay."
            : "On. After each chat, Sutaeru quietly notes anything worth remembering here."}
        </p>
      </div>
      <Toggle
        checked={enabled !== false}
        onCheckedChange={() => void toggle()}
        disabled={enabled === null || saving}
        label="Living memory"
        className="lp-dark-toggle"
      />
    </section>
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

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="lp-page w-full min-w-0"
      >
        {/* ── Header ── */}
        <header className="lp-head">
          <div className="lp-head-main">
            <PageTitle className="lp-title">Memories</PageTitle>
            <p className="lp-lede">
              What Sutaeru knows about you. Private, editable, yours.
            </p>
          </div>
          <div className="lp-actions">
            <button
              onClick={() => setShowModal(true)}
              className="lp-btn lp-btn-quiet lp-btn-sm"
            >
              <SutaeruIcon name="plus" /> Add Memory
            </button>
          </div>
        </header>

        {/* ── Search + filters ── */}
        <div className="lp-section" style={{ marginTop: 0 }}>
          <div className="lp-search">
            <SutaeruIcon name="search" width={16} height={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories..."
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="lp-icon-btn"
                style={{ width: 32, height: 32 }}
                aria-label="Clear search"
              >
                <SutaeruIcon name="close" width={14} height={14} />
              </button>
            )}
          </div>
          <div className="lp-chips-row">
            <div className="lp-chips lp-chips-scroll" role="group" aria-label="Memory type filter">
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <Chip key={tab} active={isActive} onClick={() => setActiveTab(tab)}>
                  {tab === "all" ? "All" : TYPE_LABELS[tab]}
                </Chip>
              );
            })}
            </div>
            {!isLoading && (
              <span className="lp-mono lp-chips-count lp-num">
                {filtered.length} / {total}
              </span>
            )}
          </div>
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <ul className="lp-rows" aria-label="Loading memories">
            {[0, 1, 2].map((i) => (
              <li key={i} className="lp-row">
                <div className="lp-row-main">
                  <Skeleton w="22%" h={11} />
                  <Skeleton w="86%" h={20} />
                  <Skeleton w="34%" h={14} />
                </div>
              </li>
            ))}
          </ul>
        ) : total === 0 ? (
          <EmptyState onAdd={() => setShowModal(true)} />
        ) : filtered.length === 0 ? (
          <NoResults query={search || activeTab} />
        ) : (
          <motion.ul layout className="lp-rows">
            <AnimatePresence mode="popLayout">
              {filtered.map((memory: any) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        )}

        {/* ── Privacy ── */}
        <div className="lp-section">
          <MemorySwitch />
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
