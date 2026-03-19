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
import { HoverCard } from "@/components/HoverCard";
import {
  LayoutDashboard, MessageSquare, FileText, BookOpen,
  CheckSquare, Mic, StickyNote, Search,
  Pin, Inbox, GripVertical, Minimize2, Maximize2,
} from "lucide-react";
import {
  F, FD, FM, PAGE_BG, NOISE_OVERLAY, CSS_ANIM,
  card, shineLight, innerGlowLight, edgeHighlight,
  glassCard, TEXT_PRIMARY, TEXT_MUTED, TEXT_SOFT,
  MOCHA, AMBER,
} from "@/lib/design";

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTERS: { id: BlockType | "all"; label: string; icon: React.ElementType; color: string }[] = [
  { id: "all",        label: "All",         icon: LayoutDashboard, color: TEXT_PRIMARY },
  { id: "chat",       label: "Chat",        icon: MessageSquare,   color: TEXT_PRIMARY },
  { id: "atelier",    label: "Atelier",     icon: FileText,        color: "#8a9cc7" },
  { id: "memory",     label: "Memories",    icon: BookOpen,        color: AMBER },
  { id: "task",       label: "Tasks",       icon: CheckSquare,     color: "#5a8a5a" },
  { id: "transcript", label: "Transcripts", icon: Mic,             color: "#d4917a" },
  { id: "note",       label: "Notes",       icon: StickyNote,      color: "#7a9a7a" },
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
    <div style={PAGE_BG}>
      <style>{CSS_ANIM}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div style={NOISE_OVERLAY} />
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col gap-5 p-4 sm:p-6 max-w-5xl mx-auto w-full"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* Header */}
        <div className="flex items-start justify-between" style={{ animation: "fadeSlideIn 0.6s ease-out both" }}>
          <div>
            <h1 style={{
              fontFamily: FD,
              color: TEXT_PRIMARY,
              fontWeight: 400,
              fontSize: 64,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              margin: 0,
            }}>
              Board
            </h1>
            <p style={{ color: TEXT_MUTED, fontSize: 15, marginTop: 10, fontWeight: 500 }}>
              {showingPinned ? "Your pinned blocks" : "All recent blocks"}
              {collapsedBlocks.size > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, color: TEXT_SOFT }}>
                  ({collapsedBlocks.size} collapsed)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Collapse/Expand All */}
            {filtered.length > 0 && (
              <button
                onClick={isAllCollapsed ? expandAll : collapseAll}
                className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full transition-all"
                style={{
                  background: "rgba(255,255,255,0.5)",
                  border: "1px solid rgba(0,0,0,0.06)",
                  color: TEXT_SOFT,
                  backdropFilter: "blur(12px)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.7)";
                  e.currentTarget.style.transform = "scale(1.02)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.5)";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {isAllCollapsed ? (
                  <>
                    <Maximize2 className="w-3 h-3" />
                    Expand All
                  </>
                ) : (
                  <>
                    <Minimize2 className="w-3 h-3" />
                    Collapse All
                  </>
                )}
              </button>
            )}
            <div 
              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full"
              style={{ 
                background: "rgba(255,255,255,0.5)", 
                border: "1px solid rgba(0,0,0,0.06)", 
                color: TEXT_SOFT,
                backdropFilter: "blur(12px)",
              }}
            >
              <Pin className="w-3 h-3" />
              {pinnedBlocks?.length ?? 0} pinned
            </div>
          </div>
        </div>

        {/* Search */}
        <HoverCard delay={0} style={{
          ...glassCard,
          borderRadius: 16,
          padding: "12px 16px",
        }}>
          <div className="relative" style={{ position: "relative" }}>
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: TEXT_SOFT }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blocks…"
              className="w-full pl-8 pr-4 bg-transparent outline-none"
              style={{
                color: TEXT_PRIMARY,
                fontFamily: F,
                fontSize: 14,
              }}
            />
            {/* Keyboard shortcuts hint */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px]" style={{ color: TEXT_SOFT }}>
              <kbd style={{
                fontFamily: FM,
                color: TEXT_SOFT,
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(0,0,0,0.04)",
                padding: "2px 7px",
                borderRadius: 5,
              }}>⌘K</kbd>
            </div>
          </div>
        </HoverCard>

        {/* ── Filter tabs ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ animation: "fadeSlideIn 0.6s ease-out 0.1s both" }}>
          {FILTERS.map(({ id, label, icon: Icon, color }, index) => (
            <button
              key={id}
              onClick={() => setActiveFilter(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-all duration-150 shrink-0"
              style={activeFilter === id
                ? { 
                    background: `${color}15`, 
                    border: `1px solid ${color}30`, 
                    color,
                    boxShadow: `0 2px 8px ${color}20`,
                  }
                : { 
                    background: "rgba(255,255,255,0.4)", 
                    border: "1px solid rgba(0,0,0,0.04)", 
                    color: TEXT_SOFT,
                    backdropFilter: "blur(8px)",
                  }}
              onMouseEnter={(e) => {
                if (activeFilter !== id) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.6)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeFilter !== id) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.4)";
                }
              }}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Block grid ── */}
        {isLoading || allLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <HoverCard key={i} delay={i * 50} style={{ ...card, padding: 20 }}>
                <div style={shineLight} />
                <div style={innerGlowLight} />
                <div style={edgeHighlight} />
                <BlockSkeleton />
              </HoverCard>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4 py-20 text-center"
          >
            <HoverCard delay={0} style={{
              ...card,
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <div style={shineLight} />
              <div style={innerGlowLight} />
              <div style={edgeHighlight} />
              <Inbox className="w-6 h-6" style={{ color: TEXT_SOFT }} />
            </HoverCard>
            <div>
              <p className="text-base font-medium mb-1" style={{ color: TEXT_MUTED }}>
                {search ? "No blocks match your search" : "No blocks yet"}
              </p>
              <p className="text-[13px]" style={{ color: TEXT_SOFT }}>
                {search ? "Try a different search term" : "Pin blocks from Chat, Atelier, or Memories to see them here"}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  <div 
                    className="absolute top-3 left-2 z-10 opacity-0 group-hover/drag:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                    style={{ color: TEXT_SOFT }}
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                  <HoverCard delay={index * 50} style={{
                    ...card,
                    padding: 0,
                    overflow: "hidden",
                  }}>
                    <div style={shineLight} />
                    <div style={innerGlowLight} />
                    <div style={edgeHighlight} />
                    <div style={{ position: "relative" }}>
                      <Block block={block} />
                    </div>
                  </HoverCard>
                </div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
