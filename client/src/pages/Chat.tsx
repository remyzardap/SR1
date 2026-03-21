import { useState, useEffect, useRef, useCallback, type RefObject } from "react";
import { useSearch } from "wouter";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { toast } from "sonner";
import { ChatSessionList } from "@/components/ChatSessionList";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import { ChatErrorBanner } from "@/components/ChatErrorBanner";
import { SaveMemoryDialog } from "@/components/SaveMemoryDialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  F, FD, PAGE_BG, NOISE_OVERLAY, CSS_ANIM,
  innerGlowStrong, MOCHA, MOCHA_DARK,
} from "@/lib/design";

// ─── Types ────────────────────────────────────────────────────────────────────
type MemoryType = "preference" | "project" | "document" | "interaction" | "fact";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  streaming?: boolean;
  createdAt: Date;
}

// ─── SSE parser ───────────────────────────────────────────────────────────
function parseSseChunk(
  raw: string
): { events: Array<{ event: string; data: string }>; remainder: string } {
  const events: Array<{ event: string; data: string }> = [];
  const blocks = raw.split("\n\n");
  const remainder = blocks.pop() ?? "";
  for (const block of blocks) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (data) events.push({ event, data });
  }
  return { events, remainder };
}

// ─── Main Chat page ───────────────────────────────────────────────────────
export default function Chat() {
  const search = useSearch();
  const agentParam = new URLSearchParams(search).get("agent") ?? null;
  const agentHandle = agentParam;

  useSeoMeta({
    title: agentParam ? `Chat with @${agentParam}` : "Chat",
    path: agentParam ? `/chat?agent=${agentParam}` : "/chat",
  });

  // ─── State ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isAgentActive, setIsAgentActive] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState("");
  const [sessionId, setSessionId] = useState<string>(() => {
    const stored = sessionStorage.getItem("sutaeru_chat_session");
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem("sutaeru_chat_session", id);
    return id;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [max, setMax] = useState(false);

  // Save-memory dialog
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveContent, setSaveContent] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [saveType, setSaveType] = useState<MemoryType>("interaction");

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const { data: agentCtx } = trpc.agent.context.useQuery();
  const chatWithDOMutation = trpc.agent.connections.chatWithDO.useMutation();
  const saveMemoryMutation = trpc.agent.saveMemoryFromChat.useMutation({
    onSuccess: () => {
      toast.success("Saved to memory");
      setSaveDialogOpen(false);
      setSaveTitle("");
      void utils.agent.context.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Session management ────────────────────────────────────────────────────
  const handleSelectSession = useCallback(
    (sid: string) => {
      if (isStreaming) return;
      abortRef.current?.abort();
      sessionStorage.setItem("sutaeru_chat_session", sid);
      setSessionId(sid);
      setMessages([]);
      setInput("");
      setError(null);
      setSidebarOpen(false);
    },
    [isStreaming]
  );

  const handleNewChat = useCallback(() => {
    if (isStreaming) return;
    abortRef.current?.abort();
    const newId = crypto.randomUUID();
    sessionStorage.setItem("sutaeru_chat_session", newId);
    setSessionId(newId);
    setMessages([]);
    setInput("");
    setError(null);
  }, [isStreaming]);

  // ─── Load persisted history on mount ───────────────────────────────────────
  useEffect(() => {
    fetch(`/api/chat/history?sessionId=${sessionId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: Array<{ role: string; content: string; createdAt: string }>) => {
        if (Array.isArray(data) && data.length > 0) {
          setMessages(
            data.map((m) => ({
              id: crypto.randomUUID(),
              role: m.role as "user" | "assistant",
              content: m.content,
              createdAt: new Date(m.createdAt),
            }))
          );
        }
      })
      .catch(() => {
        /* non-fatal */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ─── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // ─── Save memory ──────────────────────────────────────────────────────────
  const openSaveDialog = useCallback((content: string) => {
    setSaveContent(content);
    setSaveDialogOpen(true);
  }, []);

  // ─── Send message ─────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text?: string) => {
      const messageText = (text ?? input).trim();
      if (!messageText || isStreaming) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: messageText,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLastInput(messageText);
      setError(null);
      setIsStreaming(true);

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          streaming: true,
          createdAt: new Date(),
        },
      ]);

      const conversationSoFar = [...messages, userMsg];

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // ─── S1 streaming path ────────────────────────────────────────────────
        {
          const response = await fetch("/api/chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            signal: controller.signal,
            body: JSON.stringify({
              messages: conversationSoFar.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              sessionId,
              max,
            }),
          });

          if (!response.ok) {
            const errData = (await response.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(errData.error ?? `Server error ${response.status}`);
          }

          if (!response.body) throw new Error("No response body from server");

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = "";
          let finalModel: string | undefined;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });
            const { events, remainder } = parseSseChunk(sseBuffer);
            sseBuffer = remainder;

            for (const { event, data } of events) {
              if (event === "token") {
                let token: string;
                try {
                  token = JSON.parse(data) as string;
                } catch {
                  token = data;
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + token }
                      : m
                  )
                );
              } else if (event === "agent") {
                setIsAgentActive(true);
              } else if (event === "done") {
                try {
                  finalModel = JSON.parse(data) as string;
                } catch {
                  finalModel = data;
                }
              } else if (event === "error") {
                let errMsg: string;
                try {
                  errMsg = JSON.parse(data) as string;
                } catch {
                  errMsg = data;
                }
                throw new Error(errMsg);
              }
            }
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, streaming: false, model: finalModel }
                : m
            )
          );
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const errMsg = (err as Error).message ?? "Something went wrong";
        setError(errMsg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setIsStreaming(false);
      }
    },
    [input, isStreaming, messages, agentCtx?.connections, chatWithDOMutation]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const retry = () => void handleSend(lastInput);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...PAGE_BG, display: "flex", minHeight: "100vh" }}>
      <style>{CSS_ANIM}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div style={NOISE_OVERLAY} />
      
      {/* Session sidebar with Mocha gradient */}
      {!agentHandle && (
        <div
          className={cn(
            "flex-none transition-all duration-200 overflow-hidden flex flex-col",
            sidebarOpen ? "w-64" : "w-0"
          )}
          style={{
            background: `linear-gradient(180deg, ${MOCHA} 0%, ${MOCHA_DARK} 100%)`,
            position: "relative",
            zIndex: 10,
          }}
        >
          <div style={innerGlowStrong} />
          {sidebarOpen && (
            <div style={{ position: "relative", height: "100%" }}>
              <ChatSessionList
                activeSessionId={sessionId}
                onSelectSession={handleSelectSession}
                onNewSession={handleNewChat}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ position: "relative", zIndex: 1 }}>
        <ChatHeader
          agentHandle={agentHandle}
          agentName={agentCtx?.identity?.displayName ?? undefined}
          memoryCount={agentCtx?.memoryCount}
          skillCount={agentCtx?.skillCount}
          isStreaming={isStreaming}
          sidebarOpen={sidebarOpen}
          max={max}
          onNewChat={handleNewChat}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onToggleMax={() => setMax((s) => !s)}
        />

        <ChatMessages
          messages={messages}
          isStreaming={isStreaming}
          agentName={agentCtx?.identity?.displayName ?? undefined}
          messagesEndRef={messagesEndRef as RefObject<HTMLDivElement>}
          onSaveMemory={openSaveDialog}
          onSuggestion={(s) => void handleSend(s)}
        />

        <ChatErrorBanner error={error} onRetry={retry} />

        <ChatInput
          value={input}
          isStreaming={isStreaming}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          onSend={() => void handleSend()}
          onStop={() => { abortRef.current?.abort(); setIsStreaming(false); }}
        />

        <SaveMemoryDialog
          open={saveDialogOpen}
          content={saveContent}
          title={saveTitle}
          type={saveType}
          isPending={saveMemoryMutation.isPending}
          onOpenChange={setSaveDialogOpen}
          onTitleChange={setSaveTitle}
          onTypeChange={setSaveType}
          onSave={() =>
            saveMemoryMutation.mutate({
              content: saveContent,
              title: saveTitle || undefined,
              type: saveType,
            })
          }
        />
      </div>
    </div>
  );
}
