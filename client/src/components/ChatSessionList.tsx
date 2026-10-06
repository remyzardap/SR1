import { useEffect, useState } from "react";
import { codeCall, storedCodeSession, type CodeSession } from "@/components/CodeThread";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { LandingMark } from "@/components/LandingMark";
import { SutaeruIcon } from "@/components/SutaeruIcon";

interface ChatSessionListProps {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onClose?: () => void;
  showCode?: boolean;
  onSelectCodeSession?: (codeSessionId: string) => void;
}

export function ChatSessionList({ activeSessionId, onSelectSession, onNewSession, onClose, showCode = false, onSelectCodeSession }: ChatSessionListProps) {
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

  // Code mode threads live on the server, so they are listed from there, newest first.
  const [codeSessions, setCodeSessions] = useState<CodeSession[]>([]);
  useEffect(() => {
    if (!showCode) return;
    let cancelled = false;
    const load = () => codeCall<{ sessions: CodeSession[] }>("/").then((r) => { if (!cancelled) setCodeSessions(r.sessions.slice(0, 20)); }).catch(() => undefined);
    void load();
    const t = window.setInterval(load, 15000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [showCode]);
  const activeCodeId = activeSessionId ? storedCodeSession(activeSessionId) : null;

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
    <div className="sutaeru-history flex flex-col h-full" style={{ position: "relative" }}>
      <div className="sutaeru-history-mark"><LandingMark className="sutaeru-nav-mark" detail="compact" /><span>SUTAERU</span>{onClose && <Button variant="ghost" size="icon" className="sutaeru-history-close" onClick={onClose} aria-label="Close history" title="Close history"><SutaeruIcon name="close" className="h-5 w-5" /></Button>}</div>

      {/* Header */}
      <div className="sutaeru-history-head">
        <Button
          onClick={onNewSession}
          className="sutaeru-history-new"
        >
          <SutaeruIcon name="plus" className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {showCode && codeSessions.length > 0 && (
          <div className="mb-3">
            <p className="sutaeru-history-kicker">Code mode</p>
            {codeSessions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectCodeSession?.(c.id)}
                className="sutaeru-history-row"
                data-active={activeCodeId === c.id ? "true" : "false"}
              >
                <span className="block truncate">{c.title}</span>
                <span className="sutaeru-history-time">
                  {formatDate(c.updated * 1000)}{c.status === "running" ? " · working" : c.status === "needs_approval" ? " · needs you" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin sutaeru-history-muted" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <SutaeruIcon name="ask" className="h-7 w-7 mx-auto mb-3 sutaeru-history-muted" />
            <p className="sutaeru-history-empty">
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
                className="sutaeru-history-session"
                data-active={activeSessionId === session.id ? "true" : "false"}
                onClick={() => onSelectSession(session.id)}
              >
                <SutaeruIcon name="ask" className="h-4 w-4 mt-0.5 shrink-0 sutaeru-history-muted" />

                {editingId === session.id ? (
                  <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(session.id); if (e.key === "Escape") cancelEdit(); }}
                      className="sutaeru-history-edit"
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => confirmEdit(session.id)} aria-label="Save title"><SutaeruIcon name="check" className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEdit} aria-label="Cancel"><SutaeruIcon name="close" className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="sutaeru-history-title">
                      {session.title || "Untitled"}
                    </p>
                    <p className="sutaeru-history-time">{formatDate(session.lastMessageAt)}</p>
                  </div>
                )}

                {editingId !== session.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); startEdit(session.id, session.title || ""); }} aria-label="Rename chat"
                    >
                      <SutaeruIcon name="edit" className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); if (confirm("Delete this chat session?")) deleteSession.mutate({ sessionId: session.id }); }} aria-label="Delete chat"
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
