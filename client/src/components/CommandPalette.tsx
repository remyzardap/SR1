import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Search, LayoutDashboard, MessageSquare, Brain, Zap, FolderOpen,
  Layers, Rss, LayoutGrid, Receipt, CheckSquare, ShoppingCart, BarChart3,
  TrendingUp, Image, Phone, Plug, Sparkles, Plus, ArrowRight,
} from "lucide-react";

const PAGES = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Chat", path: "/chat", icon: MessageSquare },
  { label: "Memories", path: "/memories", icon: Brain },
  { label: "Skills", path: "/skills", icon: Zap },
  { label: "Identity", path: "/identity", icon: Sparkles },
  { label: "Files", path: "/files", icon: FolderOpen },
  { label: "Atelier", path: "/atelier", icon: Layers },
  { label: "Hub / Feed", path: "/feed", icon: Rss },
  { label: "Board", path: "/board", icon: LayoutGrid },
  { label: "Workflows", path: "/workflow", icon: Zap },
  { label: "HER Settings", path: "/her-settings", icon: Phone },
  { label: "Connections", path: "/connections", icon: Plug },
  { label: "Receipts", path: "/receipts", icon: Receipt },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Tasks", path: "/tasks", icon: CheckSquare },
  { label: "Procurement", path: "/procurement", icon: ShoppingCart },
  { label: "KPIs", path: "/kpis", icon: TrendingUp },
  { label: "Image Gen", path: "/image-gen", icon: Image },
];

const QUICK_ACTIONS = [
  { label: "New Memory", icon: Plus, action: (nav: (p: string) => void) => nav("/memories?new=1") },
  { label: "New Skill", icon: Plus, action: (nav: (p: string) => void) => nav("/skills?new=1") },
  { label: "New Chat Session", icon: Plus, action: (nav: (p: string) => void) => nav("/chat?new=1") },
  { label: "Upload File", icon: Plus, action: (nav: (p: string) => void) => nav("/files?upload=1") },
];

function fuzzy(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: skillsData } = trpc.skills.list.useQuery(undefined, { enabled: open });
  const skills = skillsData ?? [];

  const filteredPages = query
    ? PAGES.filter((p) => fuzzy(query, p.label))
    : PAGES.slice(0, 6);

  const filteredSkills = query
    ? skills.filter((s: { name: string; description?: string | null }) =>
        fuzzy(query, s.name) || (s.description ? fuzzy(query, s.description) : false)
      ).slice(0, 4)
    : [];

  const isS1Query = query.length > 3 && !filteredPages.length && !filteredSkills.length;

  const allItems = [
    ...filteredPages.map((p) => ({ type: "page" as const, ...p, skillId: "" })),
    ...filteredSkills.map((s: { id: number; name: string; description?: string | null }) => ({
      type: "skill" as const,
      label: s.name,
      path: "",
      icon: Zap,
      skillId: String(s.id),
      description: s.description ?? "",
    })),
    ...(!query ? QUICK_ACTIONS.map((a) => ({ type: "action" as const, ...a, path: "", skillId: "" })) : []),
  ];

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSelect = useCallback((item: typeof allItems[number]) => {
    if (item.type === "action") {
      (item as { action: (nav: (p: string) => void) => void }).action(navigate);
    } else if (item.type === "skill") {
      navigate(`/chat?q=${encodeURIComponent(`Use my skill: ${item.label}`)}`);
    } else {
      navigate(item.path);
    }
    onClose();
  }, [navigate, onClose]);

  const handleS1 = useCallback(() => {
    navigate(`/chat?q=${encodeURIComponent(query)}`);
    onClose();
  }, [query, navigate, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, allItems.length - 1 + (isS1Query ? 1 : 0))); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter") {
        e.preventDefault();
        if (isS1Query) { handleS1(); return; }
        const item = allItems[selected];
        if (item) handleSelect(item);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, selected, allItems, isS1Query, handleS1, handleSelect, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={onClose} />

          <motion.div initial={{ opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }} transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg"
            style={{ padding: "0 16px" }}>
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "var(--glass-bg, rgba(12,12,20,0.95))", border: "1px solid var(--glass-border, rgba(255,255,255,0.1))", boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)" }}>

              <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <Search className="w-4 h-4 shrink-0" style={{ color: "rgba(242,242,242,0.3)" }} />
                <input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                  placeholder="Search pages, ask S1…" className="flex-1 bg-transparent outline-none text-[14px]"
                  style={{ color: "#f2f2f2", fontFamily: "'Inter', sans-serif" }} />
                <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(242,242,242,0.3)" }}>ESC</kbd>
              </div>

              <div className="py-2 max-h-80 overflow-y-auto">
                {filteredPages.length > 0 && (
                  <>
                    <div className="px-4 py-1.5">
                      <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "rgba(242,242,242,0.25)", fontFamily: "'Syne', sans-serif" }}>Navigate</span>
                    </div>
                    {filteredPages.map((page, i) => {
                      const Icon = page.icon;
                      const isSelected = i === selected;
                      return (
                        <button key={page.path} onClick={() => handleSelect({ type: "page", ...page })}
                          onMouseEnter={() => setSelected(i)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                          style={{ background: isSelected ? "rgba(255,255,255,0.06)" : "transparent", color: isSelected ? "#f2f2f2" : "rgba(242,242,242,0.6)" }}>
                          <Icon className="w-4 h-4 shrink-0" style={{ color: isSelected ? "var(--accent-color, #a78bfa)" : "rgba(242,242,242,0.3)" }} />
                          <span className="text-[13px]">{page.label}</span>
                          {isSelected && <ArrowRight className="w-3.5 h-3.5 ml-auto" style={{ color: "rgba(242,242,242,0.3)" }} />}
                        </button>
                      );
                    })}
                  </>
                )}

                {filteredSkills.length > 0 && (
                  <>
                    <div className="px-4 py-1.5 mt-1" style={{ borderTop: filteredPages.length > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
                      <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "rgba(242,242,242,0.25)", fontFamily: "'Syne', sans-serif" }}>Skills</span>
                    </div>
                    {filteredSkills.map((skill: { id: number; name: string; description?: string | null }, i: number) => {
                      const idx = filteredPages.length + i;
                      const isSelected = idx === selected;
                      return (
                        <button key={skill.id}
                          onClick={() => handleSelect({ type: "skill", label: skill.name, path: "", icon: Zap, skillId: String(skill.id), description: skill.description ?? "" })}
                          onMouseEnter={() => setSelected(idx)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                          style={{ background: isSelected ? "rgba(167,139,250,0.08)" : "transparent", color: isSelected ? "#f2f2f2" : "rgba(242,242,242,0.6)" }}>
                          <Zap className="w-4 h-4 shrink-0" style={{ color: isSelected ? "#a78bfa" : "rgba(242,242,242,0.3)" }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] block truncate">{skill.name}</span>
                            {skill.description && (
                              <span className="text-[11px] truncate block" style={{ color: "rgba(242,242,242,0.35)" }}>{skill.description}</span>
                            )}
                          </div>
                          {isSelected && <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(242,242,242,0.3)" }} />}
                        </button>
                      );
                    })}
                  </>
                )}

                {isS1Query && (
                  <>
                    <div className="px-4 py-1.5">
                      <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "rgba(242,242,242,0.25)", fontFamily: "'Syne', sans-serif" }}>Ask S1</span>
                    </div>
                    <button onClick={handleS1} className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                      style={{ background: selected === 0 ? "rgba(167,139,250,0.08)" : "transparent", border: "none" }}>
                      <Sparkles className="w-4 h-4 shrink-0" style={{ color: "#a78bfa" }} />
                      <span className="text-[13px]" style={{ color: "rgba(242,242,242,0.8)" }}>Ask S1: "<span style={{ color: "#a78bfa" }}>{query}</span>"</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-auto" style={{ color: "rgba(242,242,242,0.3)" }} />
                    </button>
                  </>
                )}

                {!query && (
                  <>
                    <div className="px-4 py-1.5 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "rgba(242,242,242,0.25)", fontFamily: "'Syne', sans-serif" }}>Quick Actions</span>
                    </div>
                    {QUICK_ACTIONS.map((action, i) => {
                      const idx = filteredPages.length + i;
                      const isSelected = idx === selected;
                      return (
                        <button key={action.label} onClick={() => action.action(navigate)}
                          onMouseEnter={() => setSelected(idx)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                          style={{ background: isSelected ? "rgba(255,255,255,0.06)" : "transparent", color: isSelected ? "#f2f2f2" : "rgba(242,242,242,0.5)" }}>
                          <Plus className="w-4 h-4 shrink-0" style={{ color: "rgba(242,242,242,0.3)" }} />
                          <span className="text-[13px]">{action.label}</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>

              <div className="px-4 py-2.5 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {[["↑↓", "navigate"], ["↵", "select"], ["esc", "close"]].map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(242,242,242,0.3)" }}>{key}</kbd>
                    <span className="text-[10px]" style={{ color: "rgba(242,242,242,0.2)" }}>{label}</span>
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
