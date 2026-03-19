import { cn } from "@/lib/utils";
import { SquarePen, PanelLeftOpen, PanelLeftClose, MessageSquare, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatHeaderProps {
  agentHandle: string | null;
  agentName?: string;
  memoryCount?: number;
  skillCount?: number;
  isStreaming: boolean;
  sidebarOpen: boolean;
  smart?: boolean;
  onNewChat: () => void;
  onToggleSidebar: () => void;
  onToggleSmart?: () => void;
}

export function ChatHeader({
  agentHandle,
  agentName,
  memoryCount,
  skillCount,
  isStreaming,
  sidebarOpen,
  smart = false,
  onNewChat,
  onToggleSidebar,
  onToggleSmart,
}: ChatHeaderProps) {
  return (
    <>
      <div
        className="flex-none px-3 sm:px-5 py-3 flex items-center justify-between gap-2 min-w-0"
        style={{
          background: "rgba(5,5,5,0.88)",
          backdropFilter: "blur(28px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {!agentHandle && (
            <button
              onClick={onToggleSidebar}
              title={sidebarOpen ? "Hide history" : "Show history"}
              className="flex items-center rounded-lg p-1.5 transition-colors"
              style={{ color: "rgba(242,242,242,0.3)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(242,242,242,0.8)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(242,242,242,0.3)")}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
          )}
          <motion.div
            className={cn("w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-500", isStreaming ? "animate-pulse scale-125" : "")}
            style={{
              background: isStreaming ? "#E8442A" : "rgba(242,242,242,0.35)",
              boxShadow: isStreaming ? "0 0 8px rgba(232,68,42,0.45)" : "none",
            }}
          />
          <div className="min-w-0">
            <span className="text-sm font-semibold truncate block" style={{ color: "#f2f2f2", fontFamily: "'Syne', sans-serif" }}>
              {agentHandle ? `@${agentHandle}'s Agent` : agentName ? `${agentName} · S1` : "S1"}
            </span>
            {agentHandle ? (
              <p className="text-[11px] truncate" style={{ color: "rgba(242,242,242,0.3)" }}>Public agent</p>
            ) : memoryCount !== undefined && skillCount !== undefined ? (
              <p className="text-[11px] truncate" style={{ color: "rgba(242,242,242,0.3)" }}>
                {memoryCount} memories · {skillCount} skills
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!agentHandle && (
            <AnimatePresence mode="wait">
              <motion.div
                key={isStreaming ? "active" : "idle"}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={isStreaming
                  ? { background: "rgba(232,68,42,0.10)", border: "1px solid rgba(232,68,42,0.30)", boxShadow: "0 0 12px rgba(232,68,42,0.25)" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  animate={isStreaming ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
                  transition={{ duration: 0.9, repeat: isStreaming ? Infinity : 0 }}
                  style={{ background: isStreaming ? "#E8442A" : "rgba(255,255,255,0.18)" }}
                />
                <span
                  className="text-[11px] font-semibold tracking-wide"
                  style={{ color: isStreaming ? "#E8442A" : "rgba(242,242,242,0.3)", fontFamily: "'Syne', sans-serif" }}
                >
                  S1
                </span>
              </motion.div>
            </AnimatePresence>
          )}

          {!agentHandle && onToggleSmart && (
            <button
              onClick={onToggleSmart}
              title={smart ? "Smart Mode on — click to disable" : "Enable Smart Mode"}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-all duration-200"
              style={smart
                ? { background: "rgba(232,68,42,0.12)", border: "1px solid rgba(232,68,42,0.3)", color: "#E8442A", boxShadow: "0 0 10px rgba(232,68,42,0.2)" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(242,242,242,0.3)" }
              }
            >
              <Zap className={cn("h-3 w-3", smart ? "fill-current" : "")} />
              <span className="hidden sm:inline">Smart</span>
            </button>
          )}

          <button
            onClick={onNewChat}
            title="New chat"
            disabled={isStreaming}
            className="flex items-center gap-1.5 rounded-lg px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-30"
            style={{ color: "rgba(242,242,242,0.3)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(242,242,242,0.85)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(242,242,242,0.3)")}
          >
            <SquarePen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>
      </div>

      {agentHandle && (
        <div
          className="flex-none px-4 py-2.5 flex items-center gap-2.5 text-sm"
          style={{ background: "var(--accent-dim)", borderBottom: "1px solid var(--accent-border)", color: "var(--accent-light)" }}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span>Chatting with <span className="font-semibold">@{agentHandle}</span>'s agent</span>
        </div>
      )}
    </>
  );
}
