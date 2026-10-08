import { cn } from "@/lib/utils";
import { Loader2, Maximize2, Minimize2, MoveHorizontal } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { NEON, NEON_FD, NEON_FM } from "@/lib/design";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";

const MODES: Array<{ key: string; label: string; icon: SutaeruIconName }> = [
  { key: "fast", label: "Fast", icon: "ask" },
  { key: "deep", label: "Deep Research", icon: "research" },
  { key: "image", label: "Image", icon: "image" },
  { key: "document", label: "Document", icon: "report" },
] as const;

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
  extraModes?: Array<{ key: string; label: string; icon: SutaeruIconName }>;
  isAgentMode?: boolean;
  onSetAgentMode?: (isAgent: boolean) => void;
}

export function ChatHeader({
  agentHandle = null,
  agentName,
  memoryCount,
  skillCount,
  isStreaming,
  sidebarOpen,
  mode = "fast",
  max = false,
  onNewChat,
  onToggleSidebar,
  onSetMode,
  onToggleMax,
  onExport,
  exportPending = false,
  onInsights,
  chatWidth = "normal",
  onCycleWidth,
  extraModes = [],
  isAgentMode = false,
  onSetAgentMode,
}: ChatHeaderProps) {
  const modes = [...MODES, ...extraModes];
  const reduceMotion = useReducedMotion();
  return (
    <>
       <div
         className="sutaeru-chat-header flex-none px-3 sm:px-5 py-3 flex items-center justify-between gap-3 min-w-0 safe-area-top"
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(28px)",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {!agentHandle && (
             <Button
               variant="ghost"
               size="icon"
              onClick={onToggleSidebar}
              title={sidebarOpen ? "Hide history" : "Show history"}
               aria-label={sidebarOpen ? "Hide history" : "Show history"}
               className="flex items-center rounded-full p-2 transition-all"
              style={{ background: "rgba(10,10,10,0.05)", color: NEON.ink }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(10,10,10,0.10)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(10,10,10,0.05)"; }}
            >
              <SutaeruIcon name={sidebarOpen ? "close" : "files"} className="h-4 w-4" />
             </Button>
          )}

          <motion.div
            className={cn("w-2 h-2 rounded-full shrink-0 transition-all duration-500", isStreaming ? "scale-125" : "")}
            style={{
              background: isStreaming ? NEON.orange : NEON.muted,
              boxShadow: isStreaming ? `0 0 10px ${NEON.orange}80` : "none",
            }}
          />

          <div className="min-w-0">
            <span className="text-sm font-semibold truncate block" style={{ color: NEON.ink, fontFamily: NEON_FD, fontWeight: 700 }}>
              {agentHandle ? `@${agentHandle}'s Agent` : agentName ? `${agentName} · Sutaeru` : "Sutaeru"}
            </span>
            {agentHandle ? (
              <p className="text-[11px] truncate" style={{ color: NEON.muted, fontFamily: NEON_FM }}>Public agent</p>
            ) : memoryCount !== undefined && skillCount !== undefined ? (
              <p className="text-[11px] truncate" style={{ color: NEON.muted, fontFamily: NEON_FM }}>
                {memoryCount} memories · {skillCount} skills
              </p>
            ) : null}
          </div>
        </div>

        {/* Chat | Agent switch */}
        {!agentHandle && onSetAgentMode && (
          <nav className="flex items-center shrink-0 p-[3px] rounded-full" style={{ background: "rgba(10,10,10,0.05)" }} aria-label="Chat or agent mode">
            <Button
              variant="ghost"
              onClick={() => onSetAgentMode(false)}
              aria-pressed={!isAgentMode}
              className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
              style={!isAgentMode ? { background: NEON.cream, color: NEON.ink } : { color: NEON.muted }}
            >
              Chat
            </Button>
            <Button
              variant="ghost"
              onClick={() => onSetAgentMode(true)}
              aria-pressed={isAgentMode}
              className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
              style={isAgentMode ? { background: NEON.cream, color: NEON.ink } : { color: NEON.muted }}
            >
              Agent
            </Button>
          </nav>
        )}

        {/* Mode pills */}
        {!agentHandle && !isAgentMode && onSetMode && (
          <div className="hidden md:flex items-center gap-1 p-1 rounded-full" style={{ background: "rgba(10,10,10,0.05)" }}>
            {modes.map((m) => (
             <Button
               variant="ghost"
                key={m.key}
                onClick={() => onSetMode(m.key)}
               aria-pressed={mode === m.key}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all",
                  mode === m.key ? "neon-pill-active" : "neon-pill"
                )}
                style={{ fontFamily: NEON_FD }}
              >
                {m.label}
             </Button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {!agentHandle && (
            <AnimatePresence mode="wait">
              <motion.div
                key={isStreaming ? "active" : "idle"}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={isStreaming
                  ? { background: NEON.orangeDim, border: `1px solid ${NEON.orange}40` }
                  : { background: "rgba(10,10,10,0.05)", border: "1px solid rgba(10,10,10,0.06)" }
                }
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  animate={isStreaming && !reduceMotion ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
                  transition={{ duration: 1.2, repeat: isStreaming && !reduceMotion ? Infinity : 0 }}
                  style={{ background: isStreaming ? NEON.orange : NEON.muted }}
                />
                <span className="text-[11px] font-semibold tracking-wide" style={{ color: isStreaming ? NEON.orange : NEON.muted, fontFamily: NEON_FD }}>
                  {isStreaming ? "Working" : "Idle"}
                </span>
              </motion.div>
            </AnimatePresence>
          )}

          {!agentHandle && !isAgentMode && onToggleMax && (
             <Button
               variant="ghost"
              onClick={onToggleMax}
              title={max ? "Max Mode on — click to disable" : "Enable Max Mode"}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200"
              style={max
                ? { background: NEON.orangeDim, border: `1px solid ${NEON.orange}40`, color: NEON.orange }
                : { background: "rgba(10,10,10,0.05)", border: "1px solid rgba(10,10,10,0.06)", color: NEON.muted }
              }
            >
              <SutaeruIcon name="research" className="h-4 w-4" />
              <span className="hidden 2xl:inline">Max</span>
             </Button>
          )}

          {!agentHandle && onCycleWidth && (
            <Button
              variant="ghost"
              title={`Chat width: ${chatWidth}. Click to change (normal, wide, full).`}
              aria-label={`Chat width: ${chatWidth}. Click to change`}
              onClick={onCycleWidth}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200"
              style={{ background: "rgba(10,10,10,0.05)", border: "1px solid rgba(10,10,10,0.06)", color: NEON.muted }}
            >
              {chatWidth === "full" ? <Minimize2 className="h-4 w-4" /> : chatWidth === "wide" ? <Maximize2 className="h-4 w-4" /> : <MoveHorizontal className="h-4 w-4" />}
              <span className="hidden 2xl:inline">{chatWidth === "full" ? "Full" : chatWidth === "wide" ? "Wide" : "Width"}</span>
            </Button>
          )}

          {!agentHandle && onInsights && (
            <Button
              variant="ghost"
              title="Decisions, open questions and missing info"
              aria-label="Review conversation"
              onClick={onInsights}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200"
              style={{ background: "rgba(10,10,10,0.05)", border: "1px solid rgba(10,10,10,0.06)", color: NEON.muted }}
            >
              <SutaeruIcon name="review" className="h-4 w-4" />
              <span className="hidden 2xl:inline">Review</span>
            </Button>
          )}

          {!agentHandle && onExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  title="Export this chat"
                  aria-label="Export this chat"
                  disabled={exportPending}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200"
                  style={{ background: "rgba(10,10,10,0.05)", border: "1px solid rgba(10,10,10,0.06)", color: NEON.muted }}
                >
                  {exportPending ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : <SutaeruIcon name="download" className="h-4 w-4" />}
                  <span className="hidden 2xl:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onExport("md")}>
                  <SutaeruIcon name="report" className="mr-2 h-4 w-4" /> Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onExport("pdf")}>
                  <SutaeruIcon name="download" className="mr-2 h-4 w-4" /> PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

           <Button
             variant="default"
            onClick={onNewChat}
            title="New chat"
            disabled={isStreaming}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-30"
            style={{ background: NEON.black, color: NEON.cream }}
          >
            <SutaeruIcon name="plus" className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
           </Button>
        </div>

       </div>

       {!agentHandle && !isAgentMode && onSetMode && (
          <nav className="sutaeru-chat-mobile-modes" aria-label="Chat mode">
           <div className="sutaeru-chat-mobile-heading">
             <span className="sutaeru-chat-mobile-title">Sutaeru</span>
             <span className="sutaeru-chat-mobile-subtitle">{(() => { const label = modes.find((item) => item.key === mode)?.label ?? "Fast"; return /mode$/i.test(label) ? label : `${label} mode`; })()}</span>
       </div>
           <div className="sutaeru-chat-mobile-mode-actions">
             {modes.map((item) => (
               <Button key={item.key} type="button" size="icon" variant="outline"
                 onClick={() => onSetMode(item.key)}
                 aria-label={`${item.label} mode`} title={`${item.label} mode`}
                 aria-pressed={mode === item.key}
                 className="sutaeru-chat-mode-icon"
                 ><SutaeruIcon name={item.icon} className="h-5 w-5" /></Button>
             ))}
           </div>
         </nav>
       )}
      {agentHandle && (
        <div
          className="flex-none px-4 py-2.5 flex items-center gap-2.5 text-sm"
          style={{ background: NEON.orangeDim, borderBottom: `1px solid ${NEON.orange}25`, color: NEON.orange }}
        >
          <SutaeruIcon name="ask" className="h-4 w-4 shrink-0" />
          <span>Chatting with <span className="font-semibold">@{agentHandle}</span>'s agent</span>
        </div>
      )}
    </>
  );
}
