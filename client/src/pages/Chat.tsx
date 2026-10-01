import { useState, useEffect, useRef, useCallback, type RefObject } from "react";
import type { FileUIPart } from "ai";
import { useSearch } from "wouter";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { toast } from "sonner";
import { ChatSessionList } from "@/components/ChatSessionList";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import { ChatErrorBanner } from "@/components/ChatErrorBanner";
import { ChatInsightsDialog } from "@/components/ChatInsightsDialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/authSession";
import { callFunction } from "@/lib/kemmaCloud";
import { NEON_PAGE_BG, NOISE_OVERLAY, NEON, NEON_FD, NEON_FM } from "@/lib/design";
import { Settings, X, Cpu, Wrench, Download, PanelRightOpen, PanelRightClose, Zap, Search, FileText, Image as ImageIcon, ExternalLink } from "lucide-react";
import { Sparkles } from "@/components/brandIcons";
import { Button } from "@/components/ui/button";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import type { ActivityItem } from "@/components/ActivityFeed";
import type { ChatMessageData as Message, PlanDirection } from "@/types/chat";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────
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

const PLAN_REQUEST = /\b(design|build|create|make|redesign|website|page|screen|interface|dashboard|brand|visual|layout|app)\b/i;
const PLAN_SKIP = /\b(fix|bug|error|broken|not working|change the text|rename)\b/i;

function createPlanDirections(prompt: string): PlanDirection[] {
  const subject = prompt.replace(/\s+/g, " ").trim().slice(0, 92);
  return [
    { id: "editorial", title: "Editorial Signal", concept: `A calm, publication-led approach to ${subject}, with decisive hierarchy and generous breathing room.`, emphasis: "Clarity first", palette: ["#F7F6F2", "#242320", "#F4511E"], tags: ["Editorial", "Precise", "Quiet motion"], recommended: true },
    { id: "technical", title: "Technical Field", concept: `A denser, instrument-like direction for ${subject}, pairing compact data with annotated visual details.`, emphasis: "Information rich", palette: ["#ECEAE4", "#171715", "#B6BBC3"], tags: ["Technical", "Structured", "Interactive"] },
    { id: "cinematic", title: "Cinematic Object", concept: `A bolder presentation of ${subject}, led by one memorable object, dramatic scale, and controlled transitions.`, emphasis: "High impact", palette: ["#171715", "#F7F6F2", "#F4511E"], tags: ["Immersive", "Focused", "Expressive"] },
  ];
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

function friendlyStatus(status: number) {
  if (status === 401 || status === 403) return "Your session has expired. Sign in again to continue.";
  if (status === 402) return "AI credits have run out. Ask the workspace owner to top up.";
  if (status === 429) return "Too many requests right now. Wait a moment, then retry.";
  if (status >= 500) return "Sutaeru is having trouble right now. Please retry shortly.";
  return `Request failed (${status}).`;
}

// ─── Main Chat page ───────────────────────────────────────────────────────
export default function Chat() {
  useSeoMeta({ title: "Chat", path: "/chat" });

  // ─── State ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState("");
  const [lastFiles, setLastFiles] = useState<FileUIPart[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => {
    const stored = sessionStorage.getItem("sutaeru_chat_session");
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem("sutaeru_chat_session", id);
    return id;
  });
  const [hasPersistedHistory, setHasPersistedHistory] = useState(() => sessionStorage.getItem("sutaeru_chat_has_history") === "1");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);

  // Thread-level settings
  const [mode, setMode] = useState<string>("fast");
  const [allowedTools, setAllowedTools] = useState<string[]>(MODE_DEFAULTS.fast);

  // Message-level settings
  const [messageModel, setMessageModel] = useState<string>("auto");
  const [taggedSkills, setTaggedSkills] = useState<number[]>([]);

  // Agent run state
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
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

  useEffect(() => {
    const showAttachmentError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (message) toast.error(message);
    };
    window.addEventListener("sutaeru:attachment-error", showAttachmentError);
    return () => window.removeEventListener("sutaeru:attachment-error", showAttachmentError);
  }, []);

  // ─── Refs ──────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const createMemoryMutation = trpc.memories.create.useMutation();

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
      sessionStorage.setItem("sutaeru_chat_has_history", "1");
      setHasPersistedHistory(true);
      setSessionId(sid);
      setMessages([]);
      setInput("");
      setError(null);
      setSidebarOpen(false);
      setMode("fast");
      setAllowedTools(MODE_DEFAULTS.fast);
      setMessageModel("auto");
      setTaggedSkills([]);
      setAgentSteps([]);
      setActivity([]);
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
    sessionStorage.setItem("sutaeru_chat_has_history", "0");
    setHasPersistedHistory(false);
    setSessionId(newId);
    setMessages([]);
    setInput("");
    setError(null);
    setSidebarOpen(false);
    setMode("fast");
    setAllowedTools(MODE_DEFAULTS.fast);
    setMessageModel("auto");
    setTaggedSkills([]);
    setAgentSteps([]);
      setActivity([]);
    setUsedSkills([]);
    setUsage(null);
    setSources([]);
  }, [isStreaming]);

  // ─── Load persisted history on mount ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!hasPersistedHistory) {
      setHistoryState("ready");
      return () => { cancelled = true; };
    }
    setHistoryState("loading");
    fetch(`${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/chat/history?sessionId=${sessionId}`, { credentials: "include", headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {} })
      .then((r) => {
        if (r.status === 404) return [];
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data: Array<{ role: string; content: string; createdAt: string; model?: string }>) => {
        if (cancelled) return;
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
        setHistoryState("ready");
      })
      .catch(() => { if (!cancelled) setHistoryState("error"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, historyAttempt, hasPersistedHistory]);

  // ─── Send message ─────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (submission?: string | { text: string; files: FileUIPart[] }) => {
      const messageText = (typeof submission === "string" ? submission : submission?.text ?? input).trim();
      const attachedFiles = typeof submission === "object" ? submission.files : [];
      if (!messageText || isStreaming) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: messageText,
        createdAt: new Date(),
        references: attachedFiles.map((file) => file.filename || "Reference file"),
      };

      setMessages((prev) => [...prev, userMsg]);
      sessionStorage.setItem("sutaeru_chat_has_history", "1");
      setHasPersistedHistory(true);
      setInput("");
      setLastInput(messageText);
      setLastFiles(attachedFiles);
      setError(null);
      setIsStreaming(true);
      setElapsed(0);
      setStartedAt(Date.now());
      setAgentSteps([]);
      setActivity([]);
      setUsedSkills([]);
      setUsage(null);
      setSources([]);

      if (PLAN_REQUEST.test(messageText) && !PLAN_SKIP.test(messageText)) {
        const planMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I’ve translated your brief into three distinct visual directions. Each keeps Sutaeru’s core language while changing the emphasis.",
          createdAt: new Date(),
          planOptions: createPlanDirections(messageText),
        };
        setMessages((prev) => [...prev, planMessage]);
        setIsStreaming(false);
        setStartedAt(null);
        return;
      }

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
        const apiOrigin = import.meta.env.VITE_SR1_API_ORIGIN || "";
        const requestUrl = mode === "deep" ? `${apiOrigin}/api/fn/research` : `${apiOrigin}/api/kemma/stream`;
        const response = await fetch(requestUrl, {
          method: "POST",
           headers: { "Content-Type": "application/json", ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}) },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            messages: conversationSoFar.map((m) => ({ role: m.role, content: m.content })),
            ...(mode === "deep" ? { files: attachedFiles.map((file) => ({ filename: file.filename || "reference", mediaType: file.mediaType, url: file.url })) } : { sessionId, max: false, settings }),
          }),
        });

        if (!response.ok) {
          const errData = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error ?? friendlyStatus(response.status));
        }

        if (!response.body) throw new Error("No response body from server");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";
        let finalModel: string | undefined;
        const assistantSkills: Array<{ id: number; name: string }> = [];
        const assistantSteps: AgentStep[] = [];
        const assistantActivity: ActivityItem[] = [];

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
               setCurrentStep("Working on your request…");
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
            } else if (event === "activity") {
              try {
                const item = JSON.parse(data) as ActivityItem;
                const at = assistantActivity.findIndex((existing) => existing.id === item.id);
                if (at >= 0) assistantActivity[at] = { ...assistantActivity[at], ...item };
                else assistantActivity.push(item);
                setActivity([...assistantActivity]);
                if (item.status === "running" && item.kind !== "write") setCurrentStep(item.detail ? `${item.label}: ${item.detail}` : item.label);
              } catch { /* ignore malformed activity */ }
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
              const nextSources = Array.isArray(parsed) ? parsed : [];
              setSources(nextSources);
              setMessages((prev) => prev.map((message) => message.id === assistantId ? { ...message, sources: nextSources } : message));
            } else if (event === "usage") {
              const parsed = JSON.parse(data) as { inputTokens?: number; outputTokens?: number; totalTokens?: number };
              setUsage({
                inputTokens: parsed.inputTokens ?? 0,
                outputTokens: parsed.outputTokens ?? 0,
                totalTokens: parsed.totalTokens ?? 0,
              });
            } else if (event === "done") {
              try {
                const result: unknown = JSON.parse(data);
                if (typeof result === "string") finalModel = result;
                else if (result && typeof result === "object" && "model" in result && typeof result.model === "string") finalModel = result.model;
              } catch { /* completion may contain no model */ }
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
              ? { ...m, streaming: false, model: finalModel, skills: assistantSkills, question: mode === "deep" ? messageText : undefined }
              : m
          )
        );

        // Living memory: quietly extract anything worth remembering (honors the
        // Memories page master switch; the Cloud function only proposes items).
        void (async () => {
          try {
            const latest = messagesRef.current;
            const assistantText = latest.find((m) => m.id === assistantId)?.content ?? "";
            if (!assistantText.trim()) return;
            const conversation = [...latest.filter((m) => m.id !== assistantId), { role: "assistant" as const, content: assistantText }]
              .slice(-8)
              .map((m) => `${m.role === "user" ? "User" : "Kemma"}: ${m.content}`)
              .join("\n\n")
              .slice(0, 30000);
            const result = await callFunction<{ memories: Array<{ type: string; content: string }> }>("memories", { action: "extract", conversation, source: "chat" });
            for (const item of result.memories ?? []) {
              await createMemoryMutation.mutateAsync({ type: item.type as never, content: item.content, sourceApp: "kemma-auto" }).catch(() => undefined);
            }
          } catch {
            // Memory extraction is best-effort; never disturb the chat.
          }
        })();
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const raw = (err as Error).message ?? "";
        const errMsg = err instanceof TypeError ? "Couldn't reach Sutaeru. Check your connection and retry." : raw || "Something went wrong. Please retry.";
        setError(errMsg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
      } finally {
        setIsStreaming(false);
        setStartedAt(null);
        setCurrentStep("");
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

  const handleSelectPlan = useCallback((messageId: string, option: PlanDirection) => {
    setMessages((prev) => prev.map((message) => message.id === messageId ? { ...message, selectedOptionId: option.id } : message));
    setInput(`Use “${option.title}” for this build. Keep the ${option.emphasis.toLowerCase()} emphasis and these qualities: ${option.tags.join(", ")}.`);
    toast.success(`${option.title} selected`);
  }, []);

  const retry = () => void handleSend(lastFiles.length ? { text: lastInput, files: lastFiles } : lastInput);
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

  const [exportPending, setExportPending] = useState(false);
  const exportThreadFromServer = useCallback(async (format: "md" | "pdf") => {
    setExportPending(true);
    try {
      const origin = import.meta.env.VITE_SR1_API_ORIGIN || "";
      const res = await fetch(`${origin}/api/export/thread/${encodeURIComponent(sessionId)}?format=${format}`, {
        credentials: "include",
        headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
      });
      if (!res.ok) throw new Error(friendlyStatus(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-${sessionId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Thread export failed:", err);
      // Fall back to the local Markdown export so the user still gets a file.
      if (format === "md") {
        exportThread();
        toast.message("Server export unavailable — downloaded a local copy instead.");
      } else {
        toast.error(`PDF export failed: ${(err as Error).message}`, {
          action: { label: "Retry", onClick: () => void exportThreadFromServerRef.current?.(format) },
        });
      }
    } finally {
      setExportPending(false);
    }
  }, [sessionId, exportThread]);
  const exportThreadFromServerRef = useRef(exportThreadFromServer);
  exportThreadFromServerRef.current = exportThreadFromServer;

  const meta = MODE_META[mode] ?? MODE_META.fast;
  const ModeIcon = meta.icon;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="sutaeru-chat" style={{ ...NEON_PAGE_BG, display: "flex", minHeight: "100vh" }}>
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
          onExport={(format) => void exportThreadFromServer(format)}
          exportPending={exportPending}
          onInsights={() => setInsightsOpen(true)}
        />
        <ChatInsightsDialog
          open={insightsOpen}
          onOpenChange={setInsightsOpen}
          initialConversation={messages.filter((m) => m.content.trim()).map((m) => `${m.role === "user" ? "User" : "Kemma"}: ${m.content}`).join("\n\n")}
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
              sources={sources}
              steps={agentSteps}
              activity={activity}
              onSelectPlan={handleSelectPlan}
            />

            {historyState === "loading" && messages.length === 0 && (
              <div role="status" className="flex-none mx-3 sm:mx-6 mb-3 text-center text-xs text-muted-foreground">Loading conversation…</div>
            )}
            <ChatErrorBanner
              error={historyState === "error" && !error ? "Couldn't load this conversation's history." : null}
              onRetry={() => setHistoryAttempt((n) => n + 1)}
              onDismiss={() => setHistoryState("ready")}
              retryLabel="Reload"
            />
            <ChatErrorBanner error={error} onRetry={retry} retrying={isStreaming} onDismiss={() => setError(null)} />

            {/* Settings panel */}
            {settingsOpen && (
              <div className="flex-none px-4 pb-2">
                <div className="neon-card mx-auto max-w-2xl p-4 relative">
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
                        <Cpu className="h-3 w-3" /> Model
                      </label>
                      <Select value={messageModel} onValueChange={setMessageModel}>
                        <SelectTrigger className="w-full rounded-xl border-black/10 bg-white">
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
                         <Button
                          key={tool.id}
                          onClick={() => toggleTool(tool.id)}
                           aria-pressed={allowedTools.includes(tool.id)}
                          className={cn(
                            "neon-pill text-[11px]",
                            allowedTools.includes(tool.id) ? "neon-pill-active" : ""
                          )}
                        >
                          {tool.label}
                         </Button>
                      ))}
                    </div>
                  </div>

                  {approvedSkills.length > 0 && (
                    <div className="mt-4">
                      <label className="neon-label mb-2">Tag skills for this message</label>
                      <div className="flex flex-wrap gap-2">
                        {approvedSkills.map((skill) => (
                           <Button
                            key={skill.id}
                             variant={taggedSkills.includes(skill.id) ? "default" : "outline"}
                             aria-pressed={taggedSkills.includes(skill.id)}
                            className={cn(
                               "cursor-pointer rounded-full text-[10px]",
                               taggedSkills.includes(skill.id) ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground"
                            )}
                            onClick={() =>
                              setTaggedSkills((prev) =>
                                prev.includes(skill.id) ? prev.filter((id) => id !== skill.id) : [...prev, skill.id]
                              )
                            }
                          >
                            {skill.name}
                           </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="sutaeru-run-controls">
              <div className="sutaeru-run-actions">
                <Button size="icon" variant="outline" onClick={() => setSettingsOpen((o) => !o)} aria-label="Run settings" title="Run settings"><SutaeruIcon name="settings" className="h-5 w-5" /></Button>
                <Button size="icon" variant="outline" onClick={() => setMobileDetailsOpen((o) => !o)} aria-label="Run details" title="Run details"><SutaeruIcon name="review" className="h-5 w-5" /></Button>
                <Button size="icon" variant="outline" onClick={exportThread} disabled={messages.length === 0} aria-label="Export conversation" title="Export conversation"><SutaeruIcon name="download" className="h-5 w-5" /></Button>
                {isStreaming && <Button variant="outline" className="sutaeru-stop-run" onClick={stopRun}>Stop run</Button>}
              </div>
              {mobileDetailsOpen && <div className="sutaeru-mobile-details"><strong>Run details</strong><p>{isStreaming ? currentStep || "Thinking…" : error ? "Run failed" : "No active run"}</p>{agentSteps.map(step => <p key={step.id}>{step.label}</p>)}{sources.length > 0 && <div className="sutaeru-inline-sources"><strong>Sources</strong>{sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer"><span>{index + 1}. {source.title}</span><ExternalLink size={14} /></a>)}</div>}</div>}
              <div className="sutaeru-run-composer">
              <div className="mx-auto flex max-w-2xl items-center gap-2">
                <div className="flex-1">
                   <ChatInput
                    value={input}
                    isStreaming={isStreaming}
                    onChange={setInput}
                    onKeyDown={handleKeyDown}
                     onSend={(message) => handleSend(message)}
                    onStop={stopRun}
                     allowAttachments={mode === "deep"}
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
                   <Button size="icon" variant="ghost" aria-label="Hide run details"
                    onClick={() => setAgentPanelOpen(false)}
                     className="rounded-full"
                  >
                    <PanelRightClose className="h-4 w-4" style={{ color: NEON.muted }} />
                   </Button>
                </div>

                {/* Current mode card */}
                <div className="neon-panel p-4 relative">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: NEON.orange }}>
                       <ModeIcon className="h-5 w-5" style={{ color: "var(--neon-orange-ink)" }} />
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
         <Button
          onClick={() => setAgentPanelOpen(true)}
           variant="outline"
           className="hidden xl:flex fixed right-4 top-20 z-20 items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm"
        >
          <PanelRightOpen className="h-4 w-4" />
          <span className="text-[11px] font-semibold" style={{ fontFamily: NEON_FD }}>Status</span>
         </Button>
      )}
    </div>
  );
}
