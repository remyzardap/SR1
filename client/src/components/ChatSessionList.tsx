import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { NEON, NEON_FD, NEON_FM } from "@/lib/design";
import { LandingMark } from "@/components/LandingMark";
import { SutaeruIcon } from "@/components/SutaeruIcon";

interface ChatSessionListProps {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onClose?: () => void;
}

export function ChatSessionList({ activeSessionId, onSelectSession, onNewSession, onClose }: ChatSessionListProps) {
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
      <div className="sutaeru-history-mark"><LandingMark className="sutaeru-nav-mark" /><span>SUTAERU</span>{onClose && <Button variant="ghost" size="icon" className="sutaeru-history-close" onClick={onClose} aria-label="Close history" title="Close history"><SutaeruIcon name="close" className="h-5 w-5" /></Button>}</div>

      {/* Header */}
      <div className="p-3 pb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
        <Button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-sm text-sm font-semibold"
        >
          <SutaeruIcon name="plus" className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "rgba(255,255,255,0.55)" }} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <SutaeruIcon name="ask" className="h-7 w-7 mx-auto mb-3 text-background/40" />
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)", fontFamily: NEON_FD }}>
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
                className="group flex items-start gap-2 px-2.5 py-2.5 mb-0.5 rounded-xl cursor-pointer transition-all duration-150"
                style={{
                  background: activeSessionId === session.id ? "rgba(255,255,255,0.14)" : "transparent",
                  border: activeSessionId === session.id ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                }}
                onClick={() => onSelectSession(session.id)}
                onMouseEnter={(e) => { if (activeSessionId !== session.id) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={(e) => { if (activeSessionId !== session.id) e.currentTarget.style.background = "transparent"; }}
              >
                <SutaeruIcon name="ask" className="h-4 w-4 mt-0.5 shrink-0 text-background/55" />

                {editingId === session.id ? (
                  <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(session.id); if (e.key === "Escape") cancelEdit(); }}
                      className="flex-1 min-w-0 bg-transparent text-xs outline-none border-b text-background border-background/30"
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" onClick={() => confirmEdit(session.id)} className="h-6 w-6 text-background"><SutaeruIcon name="check" className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" onClick={cancelEdit} className="h-6 w-6 text-background/50"><SutaeruIcon name="close" className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[13px] truncate leading-snug text-background/85", activeSessionId === session.id && "text-background font-bold")} style={{ fontFamily: NEON_FD }}>
                      {session.title || "Untitled"}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)", fontFamily: NEON_FM }}>
                      {formatDate(session.lastMessageAt)}
                    </p>
                  </div>
                )}

                {editingId !== session.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-background/45 hover:text-background"
                      onClick={(e) => { e.stopPropagation(); startEdit(session.id, session.title || ""); }}
                    >
                      <SutaeruIcon name="edit" className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-background/45 hover:text-[var(--neon-orange)]"
                      onClick={(e) => { e.stopPropagation(); if (confirm("Delete this chat session?")) deleteSession.mutate({ sessionId: session.id }); }}
                    >
                      <SutaeruIcon name="delete" className="h-3 w-3" />
                    </Button>
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
