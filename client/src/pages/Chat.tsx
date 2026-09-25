import { useState, useEffect, useRef, useCallback, type RefObject } from "react";
import { useSearch } from "wouter";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { toast } from "sonner";
import { ChatSessionList } from "@/components/ChatSessionList";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import { ChatErrorBanner } from "@/components/ChatErrorBanner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  F, FD, PAGE_BG, NOISE_OVERLAY, CSS_ANIM,
  innerGlowStrong, MOCHA, MOCHA_DARK,
} from "@/lib/design";
import { Settings, X, Cpu, Wrench, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  streaming?: boolean;
  skills?: Array<{ id: number; name: string }>;
  createdAt: Date;
}

interface StreamSettings {
  model?: string;
  taggedSkills?: number[];
}

const ALL_TOOLS = [
  { id: "web_search", label: "Search" },
  { id: "browse", label: "Browse" },
  { id: "run_code", label: "Sandbox" },
  { id: "safe_files", label: "Files" },
  { id: "generate_file", label: "Documents" },
];

const MODE_DEFAULTS: Record<string, string[]> = {
  fast: ["web_search"],
  deep: ["web_search", "browse", "run_code"],
  document: ["safe_files", "generate_file"],
  image: ["generate_file"],
};

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
  useSeoMeta({ title: "Chat", path: "/chat" });

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
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Thread-level settings
  const [mode, setMode] = useState<string>("fast");
  const [allowedTools, setAllowedTools] = useState<string[]>(MODE_DEFAULTS.fast);

  // Message-level settings
  const [messageModel, setMessageModel] = useState<string>("auto");
  const [taggedSkills, setTaggedSkills] = useState<number[]>([]);

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const { data: availableModels = [] } = trpc.kemma.availableModels.useQuery();
  const { data: approvedSkills = [] } = trpc.kemma.approvedSkills.useQuery();
  const { data: sessionSettings = {} } = trpc.kemma.getSessionSettings.useQuery(
    { sessionId },
    { enabled: !!sessionId }
  );
  const updateSessionSettings = trpc.kemma.updateSessionSettings.useMutation({
    onSuccess: () => utils.kemma.getSessionSettings.invalidate({ sessionId }),
  });

  // ─── Load thread settings ─────────────────────────────────────────────────
  useEffect(() => {
    const s = sessionSettings as { mode?: string; allowedTools?: string[] };
    if (s?.mode) {
      setMode(s.mode);
      setAllowedTools(s.allowedTools ?? MODE_DEFAULTS[s.mode] ?? MODE_DEFAULTS.fast);
    }
  }, [sessionSettings]);

  // ─── Persist thread settings when changed ─────────────────────────────────
  const persistMode = useCallback((nextMode: string, nextTools: string[]) => {
    updateSessionSettings.mutate({
      sessionId,
      settings: { mode: nextMode as any, allowedTools: nextTools },
    });
  }, [sessionId, updateSessionSettings]);

  const handleSetMode = (nextMode: string) => {
    setMode(nextMode);
    const tools = MODE_DEFAULTS[nextMode] ?? MODE_DEFAULTS.fast;
    setAllowedTools(tools);
    persistMode(nextMode, tools);
  };

  const toggleTool = (toolId: string) => {
    const next = allowedTools.includes(toolId)
      ? allowedTools.filter((t) => t !== toolId)
      : [...allowedTools, toolId];
    setAllowedTools(next);
    persistMode(mode, next);
  };

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
      setMode("fast");
      setAllowedTools(MODE_DEFAULTS.fast);
      setMessageModel("auto");
      setTaggedSkills([]);
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
    setMode("fast");
    setAllowedTools(MODE_DEFAULTS.fast);
    setMessageModel("auto");
    setTaggedSkills([]);
  }, [isStreaming]);

  // ─── Load persisted history on mount ───────────────────────────────────────
  useEffect(() => {
    fetch(`/api/chat/history?sessionId=${sessionId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: Array<{ role: string; content: string; createdAt: string; model?: string }>) => {
        if (Array.isArray(data) && data.length > 0) {
          setMessages(
            data.map((m) => ({
              id: crypto.randomUUID(),
              role: m.role as "user" | "assistant",
              content: m.content,
              model: m.model,
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
      setIsAgentActive(false);

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
      const settings: StreamSettings = {
        model: messageModel === "auto" ? undefined : messageModel,
        taggedSkills: taggedSkills.length > 0 ? taggedSkills : undefined,
      };

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/kemma/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            messages: conversationSoFar.map((m) => ({ role: m.role, content: m.content })),
            sessionId,
            max: mode === "deep",
            settings,
          }),
        });

        if (!response.ok) {
          const errData = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error ?? `Server error ${response.status}`);
        }

        if (!response.body) throw new Error("No response body from server");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";
        let finalModel: string | undefined;
        const usedSkills: Array<{ id: number; name: string }> = [];

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
                  m.id === assistantId ? { ...m, content: m.content + token } : m
                )
              );
            } else if (event === "agent") {
              setIsAgentActive(true);
            } else if (event === "model") {
              const parsed = JSON.parse(data) as { label?: string };
              finalModel = parsed.label ?? finalModel;
            } else if (event === "skill") {
              const parsed = JSON.parse(data) as { id: number; name: string };
              usedSkills.push(parsed);
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
              ? { ...m, streaming: false, model: finalModel, skills: usedSkills }
              : m
          )
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const errMsg = (err as Error).message ?? "Something went wrong";
        setError(errMsg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setIsStreaming(false);
      }
    },
    [input, isStreaming, messages, sessionId, mode, messageModel, taggedSkills]
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

      {/* Session sidebar */}
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

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ position: "relative", zIndex: 1 }}>
        <ChatHeader
          isStreaming={isStreaming}
          sidebarOpen={sidebarOpen}
          max={mode === "deep"}
          onNewChat={handleNewChat}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onToggleMax={() => handleSetMode(mode === "deep" ? "fast" : "deep")}
        />

        <ChatMessages
          messages={messages}
          isStreaming={isStreaming}
          messagesEndRef={messagesEndRef as RefObject<HTMLDivElement>}
          onSuggestion={(s) => void handleSend(s)}
        />

        <ChatErrorBanner error={error} onRetry={retry} />

        {/* Settings panel */}
        {settingsOpen && (
          <div className="flex-none px-4 pb-2">
            <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Settings className="h-4 w-4" /> Message & thread settings
                </h3>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSettingsOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Model picker */}
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Cpu className="h-3 w-3" /> Model
                  </label>
                  <Select value={messageModel} onValueChange={setMessageModel}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (router picks)</SelectItem>
                      {availableModels
                        .filter((m) => m.id !== "auto" && m.hasKey)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label} · {m.tier}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Mode picker */}
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3 w-3" /> Mode
                  </label>
                  <Select value={mode} onValueChange={handleSetMode}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fast">Fast</SelectItem>
                      <SelectItem value="deep">Deep Research</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="image">Image</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tool toggles */}
              <div className="mt-4">
                <label className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Wrench className="h-3 w-3" /> Tools for this thread
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_TOOLS.map((tool) => (
                    <Button
                      key={tool.id}
                      size="sm"
                      variant={allowedTools.includes(tool.id) ? "default" : "outline"}
                      onClick={() => toggleTool(tool.id)}
                    >
                      {tool.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Skill tags */}
              {approvedSkills.length > 0 && (
                <div className="mt-4">
                  <label className="mb-2 text-xs font-medium text-muted-foreground">Tag skills for this message</label>
                  <div className="flex flex-wrap gap-2">
                    {approvedSkills.map((skill) => (
                      <Badge
                        key={skill.id}
                        variant={taggedSkills.includes(skill.id) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() =>
                          setTaggedSkills((prev) =>
                            prev.includes(skill.id) ? prev.filter((id) => id !== skill.id) : [...prev, skill.id]
                          )
                        }
                      >
                        {skill.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-none px-3 sm:px-4 pb-4 pt-2">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSettingsOpen((o) => !o)}
              className={cn("shrink-0", settingsOpen && "bg-accent")}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <ChatInput
                value={input}
                isStreaming={isStreaming}
                onChange={setInput}
                onKeyDown={handleKeyDown}
                onSend={() => void handleSend()}
                onStop={() => { abortRef.current?.abort(); setIsStreaming(false); }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
