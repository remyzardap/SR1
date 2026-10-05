import { cn } from "@/lib/utils";
import { Loader2, Maximize2, Minimize2, MoveHorizontal } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";

interface ChatHeaderProps {
  agentHandle?: string | null;
  agentName?: string;
  memoryCount?: number;
  skillCount?: number;
  isStreaming: boolean;
  sidebarOpen: boolean;
  mode?: string;
  max?: boolean;
  onNewChat: () => void;
  onToggleSidebar: () => void;
  onSetMode?: (mode: string) => void;
  onToggleMax?: () => void;
  onExport?: (format: "md" | "pdf") => void;
  exportPending?: boolean;
  onInsights?: () => void;
  chatWidth?: "normal" | "wide" | "full";
  onCycleWidth?: () => void;
  isAgentMode?: boolean;
  onSetAgentMode?: (isAgent: boolean) => void;
}

export function ChatHeader({
  mode,
  onSetMode,
  agentHandle,
  isStreaming,
  sidebarOpen,
  onNewChat,
  onToggleSidebar,
  onExport,
  exportPending,
  onInsights,
  isAgentMode,
  onSetAgentMode
}: ChatHeaderProps) {
  const reduceMotion = useReducedMotion();

  return (
    <>
      <header className="flex items-center justify-between h-[var(--height-topbar)] px-4 md:px-[var(--gutter-desktop)] shrink-0 bg-sutaeru-paper relative z-20">
        {/* Left: Logo & Sidebar Toggle */}
        <div className="flex items-center gap-4">
          <button onClick={onToggleSidebar} className="text-sutaeru-quiet hover:text-sutaeru-ink transition-colors md:hidden">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>

          <div className="flex items-center gap-2 cursor-pointer" onClick={onToggleSidebar}>
            <svg className="h-7 w-auto" viewBox="0 0 144 76" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Sutaeru">
              <path d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" stroke="var(--color-ink)" strokeWidth="8" strokeLinejoin="round"/>
              <g stroke="var(--color-ink)" strokeLinecap="round" strokeLinejoin="round">
                <path d="M93 28h30" strokeWidth="4.5"/>
                <path d="M96 32v25M120 32v25" strokeWidth="4.5"/>
                <path d="M91 35h34" strokeWidth="3.5"/>
                <path d="M101 38v19M115 38v19" strokeWidth="3"/>
              </g>
              <circle cx="108" cy="46" r="6.5" fill="var(--color-accent)"/>
            </svg>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 2l4 4-4 4" stroke="var(--color-quiet)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* Center: Chat | Agent Switch */}
        {onSetAgentMode && (
          <nav className="flex items-center p-[3px] rounded-full border border-sutaeru-stroke-card bg-sutaeru-panel absolute left-1/2 -translate-x-1/2">
            <button
              onClick={() => onSetAgentMode(false)}
              className={cn(
                "w-[90px] md:w-[120px] h-[36px] md:h-[44px] rounded-full font-body text-sm md:text-[15px] font-medium transition-all flex items-center justify-center",
                !isAgentMode ? "bg-sutaeru-card text-sutaeru-ink shadow-sm" : "text-sutaeru-quiet hover:text-sutaeru-ink"
              )}
            >
              Chat
            </button>
            <button
              onClick={() => onSetAgentMode(true)}
              className={cn(
                "w-[90px] md:w-[120px] h-[36px] md:h-[44px] rounded-full font-body text-sm md:text-[15px] font-medium transition-all flex items-center justify-center",
                isAgentMode ? "bg-sutaeru-card text-sutaeru-ink shadow-sm" : "text-sutaeru-quiet hover:text-sutaeru-ink"
              )}
            >
              Agent
            </button>
          </nav>
        )}


        {/* Modes (Preserved Functionality) */}
        {!isAgentMode && onSetMode && (
          <div className="hidden md:flex items-center gap-1">
            {[
              { key: "fast", label: "Fast" },
              { key: "deep", label: "Deep" },
              { key: "image", label: "Image" },
              { key: "document", label: "Docs" }
            ].map(m => (
              <button
                key={m.key}
                onClick={() => onSetMode(m.key)}
                className={cn(
                  "px-3 py-1 rounded-full text-[11px] font-semibold transition-all font-body",
                  mode === m.key ? "bg-sutaeru-card border-sutaeru-ink text-sutaeru-ink border shadow-sm" : "text-sutaeru-quiet hover:text-sutaeru-ink"
                )}
              >
                {mode === m.key && <span className="inline-block w-1.5 h-1.5 rounded-full bg-sutaeru-accent mr-1.5 mb-[1px]"></span>}
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={isStreaming ? "active" : "idle"}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
              className="hidden md:flex items-center gap-2"
            >
              <span className="font-mono text-[11px] font-semibold tracking-wide uppercase" style={{ color: isStreaming ? "var(--color-accent)" : "var(--color-quiet)" }}>
                {isStreaming ? "Working" : "Ready"}
              </span>
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                animate={isStreaming && !reduceMotion ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
                transition={{ duration: 1.2, repeat: isStreaming && !reduceMotion ? Infinity : 0 }}
                style={{ background: isStreaming ? "var(--color-accent)" : "var(--color-quiet)" }}
              />
            </motion.div>
          </AnimatePresence>

          {onInsights && (
            <button
              title="Review conversation"
              onClick={onInsights}
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-full border border-sutaeru-stroke-card bg-sutaeru-panel text-sutaeru-ink hover:bg-sutaeru-card transition-colors"
            >
              <SutaeruIcon name="review" className="h-4 w-4" />
            </button>
          )}

          <button
            onClick={onNewChat}
            disabled={isStreaming}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-sutaeru-stroke-card bg-sutaeru-panel text-sutaeru-ink hover:bg-sutaeru-card transition-colors disabled:opacity-50"
          >
            <SutaeruIcon name="plus" className="h-4 w-4" />
          </button>

          <div className="w-8 h-8 rounded-full bg-sutaeru-rule flex items-center justify-center text-sutaeru-paper font-title font-bold text-sm">
            R
          </div>
        </div>
      </header>

      {agentHandle && (
        <div className="flex-none px-4 py-2.5 flex items-center gap-2.5 text-sm bg-[rgba(244,81,30,0.1)] border-b border-[rgba(244,81,30,0.25)] text-sutaeru-accent font-body">
          <SutaeruIcon name="ask" className="h-4 w-4 shrink-0" />
          <span>Chatting with <span className="font-semibold">@{agentHandle}</span>'s agent</span>
        </div>
      )}
    </>
  );
}
