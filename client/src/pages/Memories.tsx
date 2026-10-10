/**
 * Memories — the container for the shared list pattern.
 *
 * Everything folds: the remembered things sit in one section per kind (only the kinds that
 * have something to show get a row), and the Living-memory switch is a section of its own.
 * The search line and the type chips filter the same list they always did; a folded header
 * says how much is behind it.
 */
import { useState, useMemo, useEffect } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trpc } from "@/lib/trpc";
import { callFunction } from "@/lib/kemmaCloud";
import { motion, AnimatePresence } from "framer-motion";
import SutaeruIcon from "@/components/SutaeruIcon";
import { Chip, HalftoneRamp, Toggle } from "@/components/art";
import type { SutaeruIconName } from "@/components/SutaeruIcon";
import { relativeTime } from "@/lib/relativeTime";
import { ListEmpty, ListFold, ListFolds, ListPage, NoResults, Rows, RowsSkeleton, SearchBar, useListFolds } from "@/components/list";
import { pickArt } from "@/lib/pickArt";
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

/** The tile each kind carries, so a row reads the same everywhere. */
const TYPE_ICONS: Record<MemoryType, SutaeruIconName> = {
  preference: "settings",
  fact: "check",
  project: "plan",
  document: "report",
  interaction: "ask",
};

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

// ─── Memory Row ───────────────────────────────────────────────────────────────
function MemoryRow({ memory }: { memory: any }) {
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

  const type = (memory.type as MemoryType) ?? "fact";
  const source = memory.sourceApp ?? memory.source;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="lst-row"
    >
      <span className="lst-art round" aria-hidden="true">
        <SutaeruIcon name={TYPE_ICONS[type] ?? "memory"} signal={false} />
      </span>
      <div className="lst-main">
        <p className="lst-body clamp" style={{ fontWeight: 600, color: "var(--r-ink)" }}>
          {memory.content}
        </p>
        <p className="mono lst-meta">
          {memory.createdAt ? relativeTime(memory.createdAt) : "recently"}
          {source ? ` · from ${source}` : ""}
        </p>
      </div>
      <div className="lst-side">
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
      </div>
    </motion.li>
  );
}

// ─── Living Memory Switch ─────────────────────────────────────────────────────
function MemorySwitch({ onState }: { onState(next: boolean | null): void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    callFunction<{ enabled: boolean }>("memories", { action: "getSetting" })
      .then((r) => {
        if (cancelled) return;
        setEnabled(r.enabled);
        onState(r.enabled);
      })
      .catch(() => {
        if (cancelled) return;
        setEnabled(true);
        onState(true);
      });
    return () => {
      cancelled = true;
    };
  }, [onState]);

  async function toggle() {
    if (enabled === null || saving) return;
    setSaving(true);
    try {
      const next = !enabled;
      await callFunction("memories", { action: "setSetting", enabled: next });
      setEnabled(next);
      onState(next);
    } catch {
      // keep the previous state
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="lp-dark">
      <HalftoneRamp columns={8} rows={10} className="lp-dark-ramp" />
      <SutaeruIcon name="admin" width={30} height={30} className="lp-dark-icon" aria-hidden="true" />
      <div className="lp-dark-body">
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
  const [living, setLiving] = useState<boolean | null>(null);

  const { data: memories = [], isLoading } = trpc.memories.list.useQuery();

  const filtered = useMemo(() => {
    let result = memories as any[];
    if (activeTab !== "all") {
      result = result.filter((m: any) => m.type === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m: any) => m.content?.toLowerCase().includes(q) || (m.sourceApp ?? m.source)?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [memories, activeTab, search]);

  const tabs = ["all", ...MEMORY_TYPES] as const;
  const total = (memories as any[]).length;

  /** One fold per kind that has something to show, in the order the chips list them. */
  const groups = MEMORY_TYPES.map((type) => ({
    type,
    rows: filtered.filter((m: any) => m.type === type),
  })).filter((group) => group.rows.length > 0);
  const ids = [...groups.map((g) => `kind-${g.type}`), "living"];
  const fold = useListFolds("memories", ids, { first: "living" });

  return (
    <>
      <ListPage
        title="Memories"
        lede="What Sutaeru knows about you. Private, editable, yours."
        fold={fold}
        actions={
          <button onClick={() => setShowModal(true)} className="btn">
            <SutaeruIcon name="plus" className="ico" /> Add Memory
          </button>
        }
      >
        <SearchBar
          value={search}
          onChange={setSearch}
          label="Search memories"
          placeholder="Search memories…"
          count={isLoading ? undefined : `${filtered.length} / ${total}`}
          extra={
            <div className="lp-chips lp-chips-scroll" role="group" aria-label="Memory type filter">
              {tabs.map((tab) => (
                <Chip key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)} small>
                  {tab === "all" ? "All" : TYPE_LABELS[tab]}
                </Chip>
              ))}
            </div>
          }
        />

        {isLoading ? (
          <RowsSkeleton rows={3} />
        ) : total === 0 ? (
          <ListEmpty
            title="Nothing remembered yet."
            text="Store facts, preferences, and context your agent should remember."
            icon="memory"
            action={
              <button onClick={() => setShowModal(true)} className="btn">
                Add first memory
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <NoResults query={search.trim() || TYPE_LABELS[activeTab] || activeTab} onClear={() => setSearch("")} />
        ) : (
          <ListFolds fold={fold}>
            {groups.map((group, i) => (
              <ListFold
                key={group.type}
                id={`kind-${group.type}`}
                index={i + 1}
                fold={fold}
                label={TYPE_LABELS[group.type]}
                pick={`${group.rows.length} ${group.rows.length === 1 ? "note" : "notes"}`}
                mini={pickArt("src-files")}
              >
                <Rows label={TYPE_LABELS[group.type]}>
                  {group.rows.map((memory: any) => (
                    <MemoryRow key={memory.id} memory={memory} />
                  ))}
                </Rows>
              </ListFold>
            ))}

            <ListFold
              id="living"
              index={groups.length + 1}
              fold={fold}
              label="Living memory"
              pick={living === null ? "Checking" : living ? "On" : "Off"}
              mini={pickArt("nav-agent")}
            >
              <MemorySwitch onState={setLiving} />
            </ListFold>
          </ListFolds>
        )}
      </ListPage>

      {/* ── Add Memory Modal ── */}
      <AnimatePresence>
        {showModal && (
          <AddMemoryModal onClose={() => setShowModal(false)} onSuccess={() => setShowModal(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
