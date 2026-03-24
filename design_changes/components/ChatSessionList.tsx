import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MessageSquare, Plus, Trash2, Pencil, Check, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { F, FM, AMBER } from "@/lib/design";

interface ChatSessionListProps {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
}

export function ChatSessionList({ activeSessionId, onSelectSession, onNewSession }: ChatSessionListProps) {
  const utils = trpc.useUtils();
  const { data: sessions = [], isLoading } = trpc.chat.listSessions.useQuery();

  const deleteSession = trpc.chat.deleteSession.useMutation({
    onSuccess: () => { utils.chat.listSessions.invalidate(); toast.success("Session deleted"); },
    onError: () => toast.error("Failed to delete session"),
  });
  const renameSession = trpc.chat.renameSession.useMutation({
    onSuccess: () => { utils.chat.listSessions.invalidate(); setEditingId(null); },
    onError: () => toast.error("Failed to rename session"),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  function startEdit(id: string, currentTitle: string) {
    setEditingId(id);
    setEditTitle(currentTitle || "Untitled");
  }
  function confirmEdit(sessionId: string) {
    if (!editTitle.trim()) return;
    renameSession.mutate({ sessionId, title: editTitle.trim() });
  }
  function cancelEdit() { setEditingId(null); setEditTitle(""); }

  function formatDate(ts: number | null | undefined): string {
    if (!ts) return "";
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "transparent", position: "relative" }}>
      {/* Logo area */}
      <div className="p-4 flex items-center justify-center">
        <div 
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.18)",
            animation: "logoPulse 3s ease-in-out infinite",
          }}
        >
          <span style={{ color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>S</span>
        </div>
      </div>

      {/* Header */}
      <div className="p-3 pb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
          style={{
            background: `${AMBER}20`,
            border: `1px solid ${AMBER}40`,
            color: "#fff",
            fontFamily: F,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${AMBER}35`;
            e.currentTarget.style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `${AMBER}20`;
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <Plus className="h-4 w-4" />
          New chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "rgba(255,255,255,0.45)" }} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <MessageSquare className="h-7 w-7 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.3)" }} />
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)", fontFamily: F }}>
              No chat history yet
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {sessions.map((session, idx) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={cn(
                  "group flex items-start gap-2 px-2.5 py-2.5 mb-0.5 rounded-xl cursor-pointer transition-all duration-150"
                )}
                style={{
                  background: activeSessionId === session.id ? "rgba(255,255,255,0.2)" : "transparent",
                  border: activeSessionId === session.id ? "1px solid rgba(255,255,255,0.15)" : "1px solid transparent",
                }}
                onClick={() => onSelectSession(session.id)}
                onMouseEnter={(e) => {
                  if (activeSessionId !== session.id) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeSessionId !== session.id) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "rgba(255,255,255,0.45)" }} />

                {editingId === session.id ? (
                  <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmEdit(session.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="flex-1 min-w-0 bg-transparent text-xs outline-none border-b"
                      style={{ color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
                      autoFocus
                    />
                    <button onClick={() => confirmEdit(session.id)} className="p-0.5" style={{ color: "#7abe8e" }}>
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={cancelEdit} className="p-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] truncate leading-snug" style={{ 
                      color: activeSessionId === session.id ? "#fff" : "rgba(255,255,255,0.85)", 
                      fontFamily: F,
                      fontWeight: activeSessionId === session.id ? 600 : 500,
                    }}>
                      {session.title || "Untitled"}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: FM }}>
                      {formatDate(session.lastMessageAt)}
                    </p>
                  </div>
                )}

                {/* Actions - only on hover */}
                {editingId !== session.id && (
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <button
                      className="p-1 rounded-md transition-colors"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#fff")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)")}
                      onClick={(e) => { e.stopPropagation(); startEdit(session.id, session.title || ""); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      className="p-1 rounded-md transition-colors"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#e8913a")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)")}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this chat session?")) {
                          deleteSession.mutate({ sessionId: session.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
