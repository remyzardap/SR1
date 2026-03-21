import { cn } from "@/lib/utils";
import { SquarePen, PanelLeftOpen, PanelLeftClose, MessageSquare, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { F, FM, glassCard, MOCHA, TEXT_PRIMARY, TEXT_MUTED, TEXT_SOFT } from "@/lib/design";

interface ChatHeaderProps {
  agentHandle: string | null;
  agentName?: string;
  memoryCount?: number;
  skillCount?: number;
  isStreaming: boolean;
  sidebarOpen: boolean;
  max?: boolean;
  onNewChat: () => void;
  onToggleSidebar: () => void;
  onToggleMax?: () => void;
}

export function ChatHeader({
  agentHandle,
  agentName,
  memoryCount,
  skillCount,
  isStreaming,
  sidebarOpen,
  max = false,
  onNewChat,
  onToggleSidebar,
  onToggleMax,
}: ChatHeaderProps) {
  return (
    <>
      <div
        className="flex-none px-3 sm:px-5 py-3 flex items-center justify-between gap-2 min-w-0"
        style={{
          background: "rgba(255,255,255,0.5)",
          backdropFilter: "blur(28px)",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {!agentHandle && (
            <button
              onClick={onToggleSidebar}
              title={sidebarOpen ? "Hide history" : "Show history"}
              className="flex items-center rounded-lg p-1.5 transition-all"
              style={{ color: TEXT_SOFT }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = TEXT_PRIMARY;
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = TEXT_SOFT;
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
          )}
          <motion.div
            className={cn("w-2 h-2 rounded-full shrink-0 transition-all duration-500", isStreaming ? "animate-pulse scale-125" : "")}
            style={{
              background: isStreaming ? MOCHA : "#5a8a5a",
              boxShadow: isStreaming ? `0 0 8px ${MOCHA}80` : "none",
            }}
          />
          <div className="min-w-0">
            <span className="text-sm font-semibold truncate block" style={{ color: TEXT_PRIMARY, fontFamily: F, fontWeight: 700 }}>
              {agentHandle ? `@${agentHandle}'s Agent` : agentName ? `${agentName} · S1` : "Kemma"}
            </span>
            {agentHandle ? (
              <p className="text-[11px] truncate" style={{ color: TEXT_SOFT }}>Public agent</p>
            ) : memoryCount !== undefined && skillCount !== undefined ? (
              <p className="text-[11px] truncate" style={{ color: TEXT_SOFT }}>
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
                  ? { 
                      background: `${MOCHA}15`, 
                      border: `1px solid ${MOCHA}40`, 
                      boxShadow: `0 0 12px ${MOCHA}30`,
                    }
                  : { 
                      background: "rgba(255,255,255,0.5)", 
                      border: "1px solid rgba(0,0,0,0.06)",
                      backdropFilter: "blur(8px)",
                    }
                }
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  animate={isStreaming ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
                  transition={{ duration: 0.9, repeat: isStreaming ? Infinity : 0 }}
                  style={{ background: isStreaming ? MOCHA : TEXT_SOFT }}
                />
                <span
                  className="text-[11px] font-semibold tracking-wide"
                  style={{ color: isStreaming ? MOCHA : TEXT_SOFT, fontFamily: F }}
                >
                  S1
                </span>
              </motion.div>
            </AnimatePresence>
          )}

          {!agentHandle && onToggleMax && (
            <button
              onClick={onToggleMax}
              title={max ? "Max Mode on — click to disable" : "Enable Max Mode"}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-all duration-200"
              style={max
                ? {
                    background: `${MOCHA}15`,
                    border: `1px solid ${MOCHA}40`,
                    color: MOCHA,
                    boxShadow: `0 0 10px ${MOCHA}25`,
                  }
                : {
                    background: "rgba(255,255,255,0.5)",
                    border: "1px solid rgba(0,0,0,0.06)",
                    color: TEXT_SOFT,
                    backdropFilter: "blur(8px)",
                  }
              }
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <Zap className={cn("h-3 w-3", max ? "fill-current" : "")} />
              <span className="hidden sm:inline">Max</span>
            </button>
          )}

          <button
            onClick={onNewChat}
            title="New chat"
            disabled={isStreaming}
            className="flex items-center gap-1.5 rounded-lg px-2 sm:px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-30"
            style={{ color: TEXT_SOFT }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = TEXT_PRIMARY;
              e.currentTarget.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = TEXT_SOFT;
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <SquarePen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>
      </div>

      {agentHandle && (
        <div
          className="flex-none px-4 py-2.5 flex items-center gap-2.5 text-sm"
          style={{ 
            background: `${MOCHA}10`, 
            borderBottom: `1px solid ${MOCHA}20`, 
            color: MOCHA,
          }}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span>Chatting with <span className="font-semibold">@{agentHandle}</span>'s agent</span>
        </div>
      )}
    </>
  );
}
