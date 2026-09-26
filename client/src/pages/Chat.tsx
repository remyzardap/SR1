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
import { NEON_PAGE_BG, NEON_GRID, NOISE_OVERLAY, NEON, NEON_FD, NEON_FM } from "@/lib/design";
import { Settings, X, Wrench, Sparkles, Download, PanelRightOpen, PanelRightClose, Zap, Search, FileText, Image as ImageIcon } from "lucide-react";
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

interface AgentStep {
  id: string;
  label: string;
  detail?: string;
  active?: boolean;
}

interface Source {
  title: string;
  url: string;
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

const MODE_META: Record<string, { icon: React.ElementType; label: string; desc: string }> = {
  fast: { icon: Zap, label: "Fast", desc: "Quick answers with search" },
  deep: { icon: Search, label: "Deep Research", desc: "Browse, code, verify" },
  document: { icon: FileText, label: "Document", desc: "Files and generation" },
  image: { icon: ImageIcon, label: "Image", desc: "Image generation" },
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
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
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
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);

  // Thread-level settings
  const [mode, setMode] = useState<string>("fast");
  const [allowedTools, setAllowedTools] = useState<string[]>(MODE_DEFAULTS.fast);

  // Message-level settings
  const [taggedSkills, setTaggedSkills] = useState<number[]>([]);

  // Agent run state
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [usedSkills, setUsedSkills] = useState<Array<{ id: number; name: string }>>([]);
  const [usage, setUsage] = useState<{ inputTokens: number; outputTokens: number; totalTokens: number } | null>(null);
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    if (!isStreaming || startedAt === null) return;
    const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const clock = window.setInterval(update, 1000);
    return () => window.clearInterval(clock);
  }, [isStreaming, startedAt]);

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
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
      setTaggedSkills([]);
      setAgentSteps([]);
      setUsedSkills([]);
      setUsage(null);
      setSources([]);
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
    setSidebarOpen(false);
    setMode("fast");
    setAllowedTools(MODE_DEFAULTS.fast);
    setTaggedSkills([]);
    setAgentSteps([]);
    setUsedSkills([]);
    setUsage(null);
    setSources([]);
  }, [isStreaming]);

  // ─── Load persisted history on mount ───────────────────────────────────────
  useEffect(() => {
    fetch(`${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/chat/history?sessionId=${sessionId}`, { credentials: "include" })
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
      .catch(() => { /* non-fatal */ });
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
      setElapsed(0);
      setStartedAt(Date.now());
      setIsAgentActive(false);
      setAgentSteps([]);
      setUsedSkills([]);
      setUsage(null);
      setSources([]);

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
        taggedSkills: taggedSkills.length > 0 ? taggedSkills : undefined,
      };

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/kemma/stream`, {
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
        const assistantSkills: Array<{ id: number; name: string }> = [];
        const assistantSteps: AgentStep[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const { events, remainder } = parseSseChunk(sseBuffer);
          sseBuffer = remainder;

          for (const { event, data } of events) {
            if (event === "token") {
              let token: string;
              try { token = JSON.parse(data) as string; } catch { token = data; }
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m))
              );
            } else if (event === "agent") {
              setIsAgentActive(true);
            } else if (event === "model") {
              const parsed = JSON.parse(data) as { step?: number; label?: string };
              finalModel = parsed.label ?? finalModel;
              const label = parsed.label ?? "Kemma";
              assistantSteps.push({ id: crypto.randomUUID(), label });
              setAgentSteps([...assistantSteps]);
              setCurrentStep(label);
            } else if (event === "tool_start") {
              const parsed = JSON.parse(data) as { tool?: string };
              const label = parsed.tool ?? "tool";
              assistantSteps.push({ id: crypto.randomUUID(), label: `Run ${label}`, detail: label });
              setAgentSteps([...assistantSteps]);
              setCurrentStep(`Run ${label}`);
            } else if (event === "skill") {
              const parsed = JSON.parse(data) as { id: number; name: string };
              assistantSkills.push(parsed);
              setUsedSkills([...assistantSkills]);
            } else if (event === "notice") {
              const parsed = JSON.parse(data) as { message?: string };
              if (parsed.message) {
                assistantSteps.push({ id: crypto.randomUUID(), label: parsed.message });
                setAgentSteps([...assistantSteps]);
              }
            } else if (event === "sources") {
              const parsed = JSON.parse(data) as Source[];
              setSources(Array.isArray(parsed) ? parsed : []);
            } else if (event === "usage") {
              const parsed = JSON.parse(data) as { inputTokens?: number; outputTokens?: number; totalTokens?: number };
              setUsage({
                inputTokens: parsed.inputTokens ?? 0,
                outputTokens: parsed.outputTokens ?? 0,
                totalTokens: parsed.totalTokens ?? 0,
              });
            } else if (event === "done") {
              try { finalModel = JSON.parse(data) as string; } catch { finalModel = data; }
            } else if (event === "error") {
              let errMsg: string;
              try { errMsg = JSON.parse(data) as string; } catch { errMsg = data; }
              throw new Error(errMsg);
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, model: finalModel, skills: assistantSkills }
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
        setStartedAt(null);
        setCurrentStep("");
      }
    },
    [input, isStreaming, messages, sessionId, mode, taggedSkills]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const retry = () => void handleSend(lastInput);
  const stopRun = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStartedAt(null);
    setCurrentStep("");
    setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));
  };

  const exportThread = useCallback(() => {
    const md = messages
      .map((m) => `**${m.role === "user" ? "You" : "Kemma"}:** ${m.content}`)
      .join("\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${sessionId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, sessionId]);

  const meta = MODE_META[mode] ?? MODE_META.fast;
  const ModeIcon = meta.icon;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="sutaeru-chat" style={{ ...NEON_PAGE_BG, display: "flex", minHeight: "100vh" }}>
      <div style={NEON_GRID} />
      <div style={NOISE_OVERLAY} />

      {/* Session sidebar */}
      <div
        className={cn(
          "flex-none transition-all duration-200 overflow-hidden flex flex-col",
          sidebarOpen ? "sutaeru-history-open" : "sutaeru-history-closed"
        )}
        style={{
          background: NEON.black,
          zIndex: 10,
        }}
      >
        {sidebarOpen && (
          <div style={{ position: "relative", height: "100%" }}>
            <ChatSessionList
              activeSessionId={sessionId}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewChat}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden" style={{ position: "relative", zIndex: 1 }}>
        <ChatHeader
          isStreaming={isStreaming}
          sidebarOpen={sidebarOpen}
          mode={mode}
          max={mode === "deep"}
          onNewChat={handleNewChat}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onSetMode={handleSetMode}
          onToggleMax={() => handleSetMode(mode === "deep" ? "fast" : "deep")}
        />

        <div className="sutaeru-run-status" role="status" aria-live="off">
          <span className={cn("sutaeru-status-dot", isStreaming && "sutaeru-status-active")} />
          <div className="sutaeru-status-copy"><strong>{isStreaming ? "Working" : error ? "Run failed" : "Ready"}</strong><span>{isStreaming ? currentStep || "Thinking…" : error ? "Check the message below" : "Start a conversation"}</span></div>
          <time className="sutaeru-timer" aria-label="Run duration">{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</time>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="flex flex-col flex-1 min-w-0">
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
                <div className="neon-card mx-auto max-w-2xl p-4 relative">
                  <span className="neon-crosshair neon-crosshair-tl" />
                  <span className="neon-crosshair neon-crosshair-tr" />
                  <span className="neon-crosshair neon-crosshair-bl" />
                  <span className="neon-crosshair neon-crosshair-br" />
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: NEON.ink, fontFamily: NEON_FD }}>
                      <Settings className="h-4 w-4" /> Message & thread settings
                    </h3>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSettingsOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="neon-label mb-1 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Mode
                      </label>
                      <Select value={mode} onValueChange={handleSetMode}>
                        <SelectTrigger className="w-full rounded-xl border-black/10 bg-white">
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

                  <div className="mt-4">
                    <label className="neon-label mb-2 flex items-center gap-1">
                      <Wrench className="h-3 w-3" /> Tools for this thread
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_TOOLS.map((tool) => (
                        <button
                          key={tool.id}
                          onClick={() => toggleTool(tool.id)}
                          className={cn(
                            "neon-pill text-[11px]",
                            allowedTools.includes(tool.id) ? "neon-pill-active" : ""
                          )}
                        >
                          {tool.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {approvedSkills.length > 0 && (
                    <div className="mt-4">
                      <label className="neon-label mb-2">Tag skills for this message</label>
                      <div className="flex flex-wrap gap-2">
                        {approvedSkills.map((skill) => (
                          <Badge
                            key={skill.id}
                            variant={taggedSkills.includes(skill.id) ? "default" : "outline"}
                            className={cn(
                              "cursor-pointer rounded-full text-[10px]",
                              taggedSkills.includes(skill.id) ? "bg-black text-cream border-black" : "border-black/10 text-ink"
                            )}
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

            <div className="sutaeru-run-controls">
              <div className="sutaeru-run-actions">
                <Button size="icon" variant="outline" onClick={() => setSettingsOpen((o) => !o)} aria-label="Run settings" title="Run settings"><Settings className="h-5 w-5" /></Button>
                <Button size="icon" variant="outline" onClick={() => setMobileDetailsOpen((o) => !o)} aria-label="Run details" title="Run details"><PanelRightOpen className="h-5 w-5" /></Button>
                <Button size="icon" variant="outline" onClick={exportThread} disabled={messages.length === 0} aria-label="Export conversation" title="Export conversation"><Download className="h-5 w-5" /></Button>
                {isStreaming && <Button variant="outline" className="sutaeru-stop-run" onClick={stopRun}>Stop run</Button>}
              </div>
              {mobileDetailsOpen && <div className="sutaeru-mobile-details"><strong>Run details</strong><p>{isStreaming ? currentStep || "Thinking…" : error ? "Run failed" : "No active run"}</p>{agentSteps.map(step => <p key={step.id}>{step.label}</p>)}</div>}
              <div className="sutaeru-run-composer">
              <div className="mx-auto flex max-w-2xl items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSettingsOpen((o) => !o)}
                  className={cn("shrink-0 rounded-full", settingsOpen && "bg-black/10")}
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={exportThread}
                  disabled={messages.length === 0}
                  className="shrink-0 rounded-full"
                  title="Export thread to Markdown"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  <ChatInput
                    value={input}
                    isStreaming={isStreaming}
                    onChange={setInput}
                    onKeyDown={handleKeyDown}
                    onSend={() => void handleSend()}
                    onStop={stopRun}
                  />
                </div>
              </div>
              </div>
            </div>
          </div>

          {/* Agent steps / status panel */}
          <div
            className={cn(
              "hidden xl:flex flex-col transition-all duration-200 overflow-hidden",
              agentPanelOpen ? "w-72" : "w-0"
            )}
            style={{ borderLeft: agentPanelOpen ? "1px solid rgba(10,10,10,0.06)" : "none", background: "rgba(255,255,255,0.35)" }}
          >
            {agentPanelOpen && (
              <div className="flex flex-col h-full p-4 gap-4">
                <div className="flex items-center justify-between">
                  <span className="neon-label">Agent status</span>
                  <button
                    onClick={() => setAgentPanelOpen(false)}
                    className="p-1 rounded-full hover:bg-black/5"
                  >
                    <PanelRightClose className="h-4 w-4" style={{ color: NEON.muted }} />
                  </button>
                </div>

                {/* Current mode card */}
                <div className="neon-panel p-4 relative">
                  <span className="neon-crosshair neon-crosshair-tl" />
                  <span className="neon-crosshair neon-crosshair-tr" />
                  <span className="neon-crosshair neon-crosshair-bl" />
                  <span className="neon-crosshair neon-crosshair-br" />
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: NEON.orange }}>
                      <ModeIcon className="h-5 w-5" style={{ color: "#fff" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ fontFamily: NEON_FD }}>{meta.label}</p>
                      <p className="text-[10px]" style={{ color: "rgba(245,240,232,0.55)", fontFamily: NEON_FM }}>{meta.desc}</p>
                    </div>
                  </div>
                </div>

                {/* Active step */}
                <div className="neon-card p-4">
                  <span className="neon-label mb-2 block">Active step</span>
                  <div className="flex items-center gap-2">
                    {isStreaming && <span className="neon-dot neon-dot-pulse" />}
                    <span className="text-sm font-medium" style={{ color: NEON.ink, fontFamily: NEON_FD }}>
                      {isStreaming ? (currentStep || "Thinking…") : "Idle"}
                    </span>
                  </div>
                </div>

                {/* Steps list */}
                {agentSteps.length > 0 && (
                  <div className="flex-1 overflow-y-auto">
                    <span className="neon-label mb-2 block">Steps</span>
                    <div className="space-y-2">
                      {agentSteps.map((step, idx) => (
                        <div key={step.id} className="flex items-start gap-2 text-[12px]">
                          <span className="neon-citation mt-0.5">{idx + 1}</span>
                          <span style={{ color: NEON.ink, fontFamily: NEON_FD }}>{step.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills used */}
                {usedSkills.length > 0 && (
                  <div>
                    <span className="neon-label mb-2 block">Skills used</span>
                    <div className="flex flex-wrap gap-1.5">
                      {usedSkills.map((s) => (
                        <span key={`${s.id}-${s.name}`} className="neon-tag neon-tag-blue">
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {sources.length > 0 && (
                  <div className="flex-1 overflow-y-auto">
                    <span className="neon-label mb-2 block">Sources</span>
                    <div className="space-y-2">
                      {sources.map((s, idx) => (
                        <a
                          key={idx}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="neon-source-card block text-[11px] hover:shadow-md transition-shadow"
                        >
                          <span className="neon-citation mr-1">{idx + 1}</span>
                          <span className="font-medium" style={{ fontFamily: NEON_FD }}>{s.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Usage */}
                {usage && (
                  <div className="neon-card p-3">
                    <span className="neon-label mb-2 block">Usage</span>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-xs font-semibold" style={{ fontFamily: NEON_FD }}>{usage.inputTokens.toLocaleString()}</div>
                        <div className="text-[9px] uppercase tracking-wide" style={{ color: NEON.muted, fontFamily: NEON_FM }}>in</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold" style={{ fontFamily: NEON_FD }}>{usage.outputTokens.toLocaleString()}</div>
                        <div className="text-[9px] uppercase tracking-wide" style={{ color: NEON.muted, fontFamily: NEON_FM }}>out</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold" style={{ fontFamily: NEON_FD }}>{usage.totalTokens.toLocaleString()}</div>
                        <div className="text-[9px] uppercase tracking-wide" style={{ color: NEON.muted, fontFamily: NEON_FM }}>total</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating toggle for agent panel when collapsed */}
      {!agentPanelOpen && (
        <button
          onClick={() => setAgentPanelOpen(true)}
          className="hidden xl:flex fixed right-4 top-20 z-20 items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm"
          style={{ background: "#ffffff", border: "1px solid rgba(10,10,10,0.06)", color: NEON.ink }}
        >
          <PanelRightOpen className="h-4 w-4" />
          <span className="text-[11px] font-semibold" style={{ fontFamily: NEON_FD }}>Status</span>
        </button>
      )}
    </div>
  );
}
