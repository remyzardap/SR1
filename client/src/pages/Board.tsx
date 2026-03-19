/**
 * Block Board — Sutaeru's freeform pinboard
 * All pinned blocks from any module in one place.
 * Filter by type, search, drag-to-reorder.
 */

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trpc } from "@/lib/trpc";
import { Block, BlockSkeleton, type BlockData, type BlockType } from "@/components/Block";
import {
  LayoutDashboard, MessageSquare, FileText, BookOpen,
  CheckSquare, Mic, StickyNote, Play, Search,
  Pin, Inbox, GripVertical, ChevronDown, ChevronUp,
  Minimize2, Maximize2,
} from "lucide-react";

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTERS: { id: BlockType | "all"; label: string; icon: React.ElementType; color: string }[] = [
  { id: "all",        label: "All",         icon: LayoutDashboard, color: "#f2f2f2"  },
  { id: "chat",       label: "Chat",        icon: MessageSquare,   color: "#f2f2f2"  },
  { id: "atelier",    label: "Atelier",     icon: FileText,        color: "#a78bfa"  },
  { id: "memory",     label: "Memories",    icon: BookOpen,        color: "#f59e0b"  },
  { id: "task",       label: "Tasks",       icon: CheckSquare,     color: "#2dd4bf"  },
  { id: "transcript", label: "Transcripts", icon: Mic,             color: "#f43f5e"  },
  { id: "note",       label: "Notes",       icon: StickyNote,      color: "#84cc16"  },
];

// ─── Board page ───────────────────────────────────────────────────────────────

export default function Board() {
  useSeoMeta({ title: "Board", path: "/board" });

  const [activeFilter, setActiveFilter] = useState<BlockType | "all">("all");
  const [search, setSearch] = useState("");
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const [isAllCollapsed, setIsAllCollapsed] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  // Collapse/expand all
  const collapseAll = useCallback(() => {
    const allIds = filtered.map((b) => b.id);
    setCollapsedBlocks(new Set(allIds));
    setIsAllCollapsed(true);
  }, [filtered]);

  const expandAll = useCallback(() => {
    setCollapsedBlocks(new Set());
    setIsAllCollapsed(false);
  }, []);

  const toggleBlockCollapse = useCallback((blockId: string) => {
    setCollapsedBlocks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(blockId)) {
        newSet.delete(blockId);
      } else {
        newSet.add(blockId);
      }
      setIsAllCollapsed(newSet.size === filtered.length);
      return newSet;
    });
  }, [filtered.length]);

  const { data: pinnedBlocks, isLoading } = trpc.blocks.pinned.useQuery(undefined, {
    onSuccess: (data) => {
      if (orderedIds.length === 0) setOrderedIds(data.map((b: { id: string }) => b.id));
    },
  });
  const { data: allBlocks, isLoading: allLoading } = trpc.blocks.list.useQuery({ archived: false, limit: 100 });
  const reorderMutation = trpc.blocks.reorder.useMutation();

  const sourceBlocks = pinnedBlocks && pinnedBlocks.length > 0 ? pinnedBlocks : (allBlocks ?? []);

  const sorted = orderedIds.length > 0
    ? [...(sourceBlocks as unknown as BlockData[])].sort((a, b) => {
        const ai = orderedIds.indexOf(a.id);
        const bi = orderedIds.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
    : (sourceBlocks as unknown as BlockData[]);

  const filtered = sorted.filter((b) => {
    const matchType = activeFilter === "all" || b.type === activeFilter;
    const matchSearch = !search.trim() ||
      b.title?.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(b.content).toLowerCase().includes(search.toLowerCase()) ||
      (Array.isArray(b.tags) && (b.tags as string[]).some((t) => t.toLowerCase().includes(search.toLowerCase())));
    return matchType && matchSearch;
  });

  const handleDragStart = (index: number) => { dragItem.current = index; };
  const handleDragEnter = (index: number) => { dragOver.current = index; };
  const handleDragEnd = useCallback(() => {
    if (dragItem.current === null || dragOver.current === null) return;
    const newOrder = [...filtered];
    const [moved] = newOrder.splice(dragItem.current, 1);
    newOrder.splice(dragOver.current, 0, moved);
    const newIds = newOrder.map((b) => b.id);
    setOrderedIds(newIds);
    dragItem.current = null;
    dragOver.current = null;
    reorderMutation.mutate({ items: newIds.map((id, position) => ({ id, position })) });
  }, [filtered, reorderMutation]);

  const showingPinned = pinnedBlocks && pinnedBlocks.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-5 p-4 sm:p-6 max-w-5xl mx-auto w-full"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#f2f2f2", fontFamily: "'Syne', sans-serif" }}>
            Board
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(242,242,242,0.35)" }}>
            {showingPinned ? "Your pinned blocks" : "All recent blocks"}
            {collapsedBlocks.size > 0 && (
              <span className="ml-2 text-[12px]" style={{ color: "rgba(242,242,242,0.25)" }}>
                ({collapsedBlocks.size} collapsed)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Collapse/Expand All */}
          {filtered.length > 0 && (
            <motion.button
              onClick={isAllCollapsed ? expandAll : collapseAll}
              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(242,242,242,0.5)",
              }}
              whileHover={{ scale: 1.02, background: "rgba(255,255,255,0.06)" }}
              whileTap={{ scale: 0.98 }}
            >
              {isAllCollapsed ? (
                <>
                  <Maximize2 className="w-3 h-3" />
                  Expand All
                </>
              ) : (
                <>
                  <Minus2 className="w-3 h-3" />
                  Collapse All
                </>
              )}
            </motion.button>
          )}
          <div className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(242,242,242,0.4)" }}>
            <Pin className="w-3 h-3" />
            {pinnedBlocks?.length ?? 0} pinned
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "rgba(242,242,242,0.25)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search blocks…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[13px] bg-transparent outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#f2f2f2",
            fontFamily: "'DM Sans', sans-serif",
          }}
        />
        {/* Keyboard shortcuts hint */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px]" style={{ color: "rgba(242,242,242,0.2)" }}>
          <kbd className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>⌘K</kbd>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map(({ id, label, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => setActiveFilter(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-all duration-150 shrink-0"
            style={activeFilter === id
              ? { background: `${color}15`, border: `1px solid ${color}30`, color }
              : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(242,242,242,0.35)" }}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Block grid ── */}
      {isLoading || allLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <BlockSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4 py-20 text-center"
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <Inbox className="w-5 h-5" style={{ color: "rgba(242,242,242,0.2)" }} />
          </div>
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: "rgba(242,242,242,0.5)" }}>
              {search ? "No blocks match your search" : "No blocks yet"}
            </p>
            <p className="text-[13px]" style={{ color: "rgba(242,242,242,0.25)" }}>
              {search ? "Try a different search term" : "Pin blocks from Chat, Atelier, or Memories to see them here"}
            </p>
          </div>
        </motion.div>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence>
            {filtered.map((block, index) => (
              <div
                key={block.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="relative group/drag"
              >
                <div className="absolute top-3 left-2 z-10 opacity-0 group-hover/drag:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                  style={{ color: "rgba(242,242,242,0.2)" }}>
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                <Block block={block} />
              </div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  );
}
