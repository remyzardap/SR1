/**
 * Command Palette — ⌘K Global Navigation
 * 
 * Mocha Design System:
 * - White card, 560px wide, borderRadius 22
 * - Soft shadow, blur backdrop
 * - Inter font, mocha accents
 * - Fuzzy search with keyboard navigation
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Search, LayoutDashboard, MessageSquare, Brain, Zap, FolderOpen,
  Layers, Rss, LayoutGrid, Receipt, CheckSquare, ShoppingCart, BarChart3,
  TrendingUp, Image, Phone, Plug, Sparkles, Plus, ArrowRight,
  FileText, BookOpen, Mic, StickyNote, X,
} from "lucide-react";
import { F, FM, MOCHA, AMBER, TEXT_PRIMARY, TEXT_MUTED, TEXT_SOFT } from "@/lib/design";
import type { BlockData } from "@/components/Block";

// ─── Navigation Items ─────────────────────────────────────────────────────────

const PAGES = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, category: "Pages" },
  { label: "Chat", path: "/chat", icon: MessageSquare, category: "Pages" },
  { label: "Memories", path: "/memories", icon: Brain, category: "Pages" },
  { label: "Skills", path: "/skills", icon: Zap, category: "Pages" },
  { label: "Files", path: "/files", icon: FolderOpen, category: "Pages" },
  { label: "Board", path: "/board", icon: LayoutGrid, category: "Pages" },
  { label: "Atelier", path: "/atelier", icon: Layers, category: "Pages" },
  { label: "Feed", path: "/feed", icon: Rss, category: "Pages" },
  { label: "Workflows", path: "/workflow", icon: Zap, category: "Pages" },
  { label: "Connections", path: "/connections", icon: Plug, category: "Pages" },
  { label: "Receipts", path: "/receipts", icon: Receipt, category: "Pages" },
  { label: "Reports", path: "/reports", icon: BarChart3, category: "Pages" },
  { label: "Tasks", path: "/tasks", icon: CheckSquare, category: "Pages" },
  { label: "Procurement", path: "/procurement", icon: ShoppingCart, category: "Pages" },
  { label: "KPIs", path: "/kpis", icon: TrendingUp, category: "Pages" },
  { label: "Image Gen", path: "/image-gen", icon: Image, category: "Pages" },
  { label: "HER Settings", path: "/her-settings", icon: Phone, category: "Pages" },
];

const QUICK_ACTIONS = [
  { label: "New Memory", icon: Plus, action: (nav: (p: string) => void) => nav("/memories?new=1"), category: "Actions" },
  { label: "New Skill", icon: Plus, action: (nav: (p: string) => void) => nav("/skills?new=1"), category: "Actions" },
  { label: "New Chat Session", icon: Plus, action: (nav: (p: string) => void) => nav("/chat?new=1"), category: "Actions" },
  { label: "Upload File", icon: Plus, action: (nav: (p: string) => void) => nav("/files?upload=1"), category: "Actions" },
];

const BLOCK_TYPE_ICONS: Record<string, React.ElementType> = {
  chat: MessageSquare,
  atelier: FileText,
  memory: BookOpen,
  task: CheckSquare,
  transcript: Mic,
  note: StickyNote,
  widget: LayoutGrid,
};

// ─── Fuzzy Search ─────────────────────────────────────────────────────────────

function fuzzy(query: string, text: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase().replace(/\s+/g, "");
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  
  // Exact match gets highest score
  if (t === q) return 1000;
  
  // Starts with query gets high score
  if (t.startsWith(q)) return 500;
  
  // Contains query as substring
  if (t.includes(q)) return 300;
  
  // Fuzzy match score based on how many characters matched
  let score = 0;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 10;
      // Bonus for consecutive matches
      if (i > 0 && t[i - 1] === q[qi - 1]) score += 5;
      qi++;
    }
  }
  
  return qi === q.length ? score : 0;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface SearchResult {
  id: string;
  type: "page" | "action" | "skill" | "block";
  label: string;
  icon: React.ElementType;
  category: string;
  action?: () => void;
  path?: string;
  description?: string;
  shortcut?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch skills and blocks for search
  const { data: skillsData } = trpc.skills.list.useQuery(undefined, { enabled: open });
  const { data: blocksData } = trpc.blocks.list.useQuery({ archived: false, limit: 50 }, { enabled: open });
  
  const skills = skillsData ?? [];
  const blocks = blocksData ?? [];

  // Build search results
  const results: SearchResult[] = useMemo(() => {
    const items: SearchResult[] = [];
    
    if (!query.trim()) {
      // Default view: show recent pages and quick actions
      items.push(...PAGES.slice(0, 6).map(p => ({
        id: `page-${p.path}`,
        type: "page" as const,
        label: p.label,
        icon: p.icon,
        category: "Recent",
        path: p.path,
      })));
      
      items.push(...QUICK_ACTIONS.map(a => ({
        id: `action-${a.label}`,
        type: "action" as const,
        label: a.label,
        icon: a.icon,
        category: "Actions",
        action: () => a.action(navigate),
      })));
      
      return items.slice(0, 8);
    }
    
    // Search mode: fuzzy match across all sources
    const scored: Array<SearchResult & { score: number }> = [];
    
    // Pages
    PAGES.forEach(page => {
      const score = fuzzyScore(query, page.label);
      if (score > 0) {
        scored.push({
          id: `page-${page.path}`,
          type: "page",
          label: page.label,
          icon: page.icon,
          category: "Pages",
          path: page.path,
          score,
        });
      }
    });
    
    // Skills
    skills.forEach((skill: { id: number; name: string; description?: string | null }) => {
      const nameScore = fuzzyScore(query, skill.name);
      const descScore = skill.description ? fuzzyScore(query, skill.description) * 0.5 : 0;
      const score = Math.max(nameScore, descScore);
      
      if (score > 0) {
        scored.push({
          id: `skill-${skill.id}`,
          type: "skill",
          label: skill.name,
          icon: Zap,
          category: "Skills",
          path: `/chat?q=${encodeURIComponent(`Use my skill: ${skill.name}`)}`,
          description: skill.description ?? undefined,
          score,
        });
      }
    });
    
    // Blocks
    blocks.forEach((block: BlockData) => {
      const titleScore = block.title ? fuzzyScore(query, block.title) : 0;
      const contentText = JSON.stringify(block.content);
      const contentScore = fuzzyScore(query, contentText) * 0.3;
      const score = Math.max(titleScore, contentScore);
      
      if (score > 0) {
        const Icon = BLOCK_TYPE_ICONS[block.type] || FileText;
        scored.push({
          id: `block-${block.id}`,
          type: "block",
          label: block.title || `${block.type} block`,
          icon: Icon,
          category: "Blocks",
          path: `/block/${block.id}`,
          description: new Date(block.createdAt).toLocaleDateString(),
          score,
        });
      }
    });
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, 8).map(({ score, ...rest }) => rest);
  }, [query, skills, blocks, navigate]);

  // Reset selection when results change
  useEffect(() => {
    setSelected(0);
  }, [results.length]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Handle selection
  const handleSelect = useCallback((item: SearchResult) => {
    if (item.action) {
      item.action();
    } else if (item.path) {
      navigate(item.path);
    }
    onClose();
  }, [navigate, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected(s => Math.min(s + 1, results.length - 1));
      }
      
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(s => Math.max(s - 1, 0));
      }
      
      if (e.key === "Enter") {
        e.preventDefault();
        const item = results[selected];
        if (item) handleSelect(item);
      }
    };
    
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, results, selected, handleSelect, onClose]);

  // Scroll selected into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const selectedEl = container.querySelector(`[data-index="${selected}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selected]);

  // Group results by category
  const grouped = results.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const categories = Object.keys(grouped);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50"
            style={{ 
              background: "rgba(0,0,0,0.4)", 
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -20 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-full"
            style={{ maxWidth: 560, padding: "0 16px" }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 22,
                boxShadow: "0 24px 64px rgba(0,0,0,0.15), 0 12px 32px rgba(0,0,0,0.1)",
                border: "1px solid rgba(0,0,0,0.06)",
                overflow: "hidden",
              }}
            >
              {/* Search Input */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "16px 20px",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <Search 
                  className="w-5 h-5 shrink-0" 
                  style={{ color: TEXT_MUTED }} 
                />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages, blocks, skills..."
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    fontFamily: F,
                    fontSize: 18,
                    color: TEXT_PRIMARY,
                  }}
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0,0,0,0.05)",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <X className="w-3.5 h-3.5" style={{ color: TEXT_SOFT }} />
                  </button>
                )}
                <kbd
                  style={{
                    fontFamily: FM,
                    fontSize: 11,
                    fontWeight: 600,
                    color: TEXT_SOFT,
                    background: "rgba(0,0,0,0.04)",
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div
                ref={containerRef}
                style={{
                  maxHeight: 400,
                  overflowY: "auto",
                  padding: "8px 0",
                }}
              >
                {results.length === 0 ? (
                  <div
                    style={{
                      padding: "40px 20px",
                      textAlign: "center",
                      color: TEXT_MUTED,
                    }}
                  >
                    <p style={{ fontSize: 14, margin: 0 }}>No results found</p>
                    <p style={{ fontSize: 12, margin: "8px 0 0", color: TEXT_SOFT }}>
                      Try a different search term
                    </p>
                  </div>
                ) : (
                  categories.map((category, catIndex) => (
                    <div key={category}>
                      {/* Category Header */}
                      <div
                        style={{
                          padding: "8px 20px 4px",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: TEXT_SOFT,
                        }}
                      >
                        {category}
                      </div>
                      
                      {/* Category Items */}
                      {grouped[category].map((item, itemIndex) => {
                        const globalIndex = categories
                          .slice(0, catIndex)
                          .reduce((sum, cat) => sum + grouped[cat].length, 0) + itemIndex;
                        const isSelected = globalIndex === selected;
                        const Icon = item.icon;
                        
                        return (
                          <button
                            key={item.id}
                            data-index={globalIndex}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setSelected(globalIndex)}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "10px 20px",
                              textAlign: "left",
                              border: "none",
                              background: isSelected ? "#f0e8e0" : "transparent",
                              cursor: "pointer",
                              transition: "background 0.15s ease",
                            }}
                          >
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: isSelected ? `${MOCHA}15` : "rgba(0,0,0,0.04)",
                              }}
                            >
                              <Icon 
                                className="w-4 h-4" 
                                style={{ color: isSelected ? MOCHA : TEXT_MUTED }} 
                              />
                            </div>
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 500,
                                  color: isSelected ? TEXT_PRIMARY : TEXT_PRIMARY,
                                  margin: 0,
                                }}
                              >
                                {item.label}
                              </div>
                              {item.description && (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: TEXT_SOFT,
                                    marginTop: 2,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {item.description}
                                </div>
                              )}
                            </div>
                            
                            {isSelected && (
                              <ArrowRight 
                                className="w-4 h-4" 
                                style={{ color: MOCHA }} 
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "10px 20px",
                  borderTop: "1px solid rgba(0,0,0,0.06)",
                  background: "rgba(0,0,0,0.02)",
                }}
              >
                {[
                  ["↑↓", "Navigate"],
                  ["↵", "Select"],
                  ["esc", "Close"],
                ].map(([key, label]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <kbd
                      style={{
                        fontFamily: FM,
                        fontSize: 10,
                        fontWeight: 600,
                        color: TEXT_SOFT,
                        background: "rgba(0,0,0,0.05)",
                        padding: "3px 6px",
                        borderRadius: 4,
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      {key}
                    </kbd>
                    <span style={{ fontSize: 11, color: TEXT_SOFT }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hook for global command palette
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  
  return { open, setOpen };
}

export default CommandPalette;
