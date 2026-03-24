/**
 * Block Board — Sutaeru's freeform pinboard
 * All pinned blocks from any module in one place.
 * Filter by type, search, drag-to-reorder.
 * 
 * ✨ UI Innovations:
 * - Smart Collapse with Content Preview
 * - Peek Preview on Hover
 * - Context-Aware Block Suggestions
 * - Command Palette (⌘K)
 */

import { useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trpc } from "@/lib/trpc";
import { Block, BlockSkeleton, type BlockData, type BlockType } from "@/components/Block";
import { HoverCard } from "@/components/HoverCard";
import { CommandPalette } from "@/components/CommandPalette";
import {
  LayoutDashboard, MessageSquare, FileText, BookOpen,
  CheckSquare, Mic, StickyNote, Search, Sparkles,
  Pin, Inbox, GripVertical, Minimize2, Maximize2,
  Lightbulb, ArrowRight, Clock, Zap,
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

// ─── Smart Suggestions Generator ──────────────────────────────────────────────

interface Suggestion {
  id: string;
  text: string;
  icon: React.ElementType;
  action: "search" | "navigate" | "filter";
  value?: string;
  filterType?: BlockType;
}

function generateSmartSuggestions(blocks: BlockData[], pinnedCount: number): Suggestion[] {
  const suggestions: Suggestion[] = [];
  
  // Count by type
  const typeCounts = blocks.reduce((acc, b) => {
    acc[b.type] = (acc[b.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Pending tasks
  const pendingTasks = blocks.filter(b => 
    b.type === "task" && 
    (b.content.status !== "done" && b.content.status !== "completed")
  ).length;
  
  // Recent memories (last 24h)
  const recentMemories = blocks.filter(b => {
    if (b.type !== "memory") return false;
    const created = new Date(b.createdAt);
    const hoursAgo = (Date.now() - created.getTime()) / (1000 * 60 * 60);
    return hoursAgo < 24;
  }).length;
  
  // Has transcripts
  const hasTranscripts = typeCounts["transcript"] && typeCounts["transcript"] > 0;
  
  // Generate contextual suggestions
  if (pendingTasks > 0) {
    suggestions.push({
      id: "pending-tasks",
      text: `Review ${pendingTasks} pending task${pendingTasks > 1 ? "s" : ""}`,
      icon: CheckSquare,
      action: "filter",
      filterType: "task",
    });
  }
  
  if (recentMemories > 0) {
    suggestions.push({
      id: "recent-memories",
      text: `Explore ${recentMemories} new memory${recentMemories > 1 ? "ies" : ""}`,
      icon: Sparkles,
      action: "filter",
      filterType: "memory",
    });
  }
  
  if (hasTranscripts) {
    suggestions.push({
      id: "transcripts",
      text: "Review recent calls",
      icon: Mic,
      action: "filter",
      filterType: "transcript",
    });
  }
  
  if (pinnedCount > 0) {
    suggestions.push({
      id: "pinned",
      text: `Focus on ${pinnedCount} pinned`,
      icon: Pin,
      action: "search",
      value: "pinned:true",
    });
  }
  
  // Time-based suggestion
  const hour = new Date().getHours();
  if (hour >= 9 && hour < 12) {
    suggestions.push({
      id: "morning",
      text: "Start today's work",
      icon: Lightbulb,
      action: "navigate",
      value: "/chat",
    });
  } else if (hour >= 14 && hour < 17) {
    suggestions.push({
      id: "afternoon",
      text: "Continue where you left off",
      icon: Clock,
      action: "navigate",
      value: "/chat",
    });
  }
  
  // Default suggestion if few options
  if (suggestions.length < 3) {
    suggestions.push({
      id: "explore",
      text: "Explore all blocks",
      icon: Zap,
      action: "filter",
    });
  }
  
  return suggestions.slice(0, 4);
}

// ─── Board page ───────────────────────────────────────────────────────────────

export default function Board() {
  useSeoMeta({ title: "Board", path: "/board" });

  const [activeFilter, setActiveFilter] = useState<BlockType | "all">("all");
  const [search, setSearch] = useState("");
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const [isAllCollapsed, setIsAllCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
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

  // Generate smart suggestions
  const suggestions = useMemo(() => {
    return generateSmartSuggestions(sorted, pinnedBlocks?.length ?? 0);
  }, [sorted, pinnedBlocks?.length]);

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

  const handleSuggestionClick = (suggestion: Suggestion) => {
    switch (suggestion.action) {
      case "filter":
        if (suggestion.filterType) {
          setActiveFilter(suggestion.filterType);
        } else {
          setActiveFilter("all");
        }
        break;
      case "search":
        setSearch(suggestion.value || "");
        break;
      case "navigate":
        if (suggestion.value) {
          window.location.href = suggestion.value;
        }
        break;
    }
  };

  const showingPinned = pinnedBlocks && pinnedBlocks.length > 0;

  // Keyboard shortcut for command palette
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCommandPaletteOpen(true);
    }
  }, []);

  // Add keyboard listener
  useState(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div style={PAGE_BG}>
      <style>{CSS_ANIM}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div style={NOISE_OVERLAY} />
      
      {/* Command Palette */}
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      
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
            <div 
              className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] cursor-pointer"
              style={{ color: TEXT_SOFT }}
              onClick={() => setCommandPaletteOpen(true)}
            >
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

        {/* ─── Smart Suggestions Bar ─────────────────────────────────────────── */}
        {!search && (
          <motion.div 
            className="flex flex-wrap gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.icon;
              return (
                <motion.button
                  key={suggestion.id}
                  onClick={() => handleSuggestionClick(suggestion)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    delay: 0.2 + index * 0.05, 
                    duration: 0.3, 
                    ease: [0.4, 0, 0.2, 1] 
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.4)",
                    border: "1px solid rgba(0,0,0,0.04)",
                    color: TEXT_SOFT,
                    backdropFilter: "blur(8px)",
                  }}
                  whileHover={{ 
                    scale: 1.02, 
                    background: "rgba(255,255,255,0.7)",
                    borderColor: AMBER + "40",
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Icon className="w-3 h-3" style={{ color: AMBER }} />
                  {suggestion.text}
                  <ArrowRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 transition-opacity" />
                </motion.button>
              );
            })}
          </motion.div>
        )}

        {/* ─── Filter tabs ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ animation: "fadeSlideIn 0.6s ease-out 0.1s both" }}>
          {FILTERS.map(({ id, label, icon: Icon, color }) => (
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

        {/* ─── Block grid ── */}
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
