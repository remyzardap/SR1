import { useState, useEffect, useRef, useCallback, type RefObject } from "react";
import type { FileUIPart } from "ai";
import { useLocation, useSearch } from "wouter";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { toast } from "sonner";
import { ChatSessionList } from "@/components/ChatSessionList";
import { ChatHeader } from "@/components/ChatHeader";
import { AgentBuilder } from "@/components/agent/AgentBuilder";
import { ChatMessages } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import { ChatErrorBanner } from "@/components/ChatErrorBanner";
import { ChatInsightsDialog } from "@/components/ChatInsightsDialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/authSession";
import { ApprovalCard } from "@/components/chat/ApprovalCard";
import { mergeApprovals } from "@/lib/approvalForm";
import type { ApprovalRequest } from "@/lib/sse";
import { applyHistoryMetadata, type HistoryMetadata } from "@/lib/citations";
import { callFunction } from "@/lib/kemmaCloud";
import { AttachMenu } from "@/components/AttachMenu";
import { FocusBrackets } from "@/components/art";
import { useOnline } from "@/hooks/useAppearance";
import { beginStream, type StreamHandle } from "@/lib/activeStreams";
import { CodeAccessBar, CodeThreadView, rememberCodeSession, storedCodeSession, useCodeThread, type CodeAccess } from "@/components/CodeThread";
import { MAX_FILES, attachmentName, type Attachment } from "@/lib/attachments";
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

import { createSseParser, decodeEvent, type RawSseEvent } from "@/lib/sse";
import { initialStreamState, reduceStream, stepStatusPrefix, type AgentStep, type Source } from "@/lib/streamReducer";

// ─── Types ────────────────────────────────────────────────────────────────────
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

const MODE_META: Record<string, { icon: React.ElementType; label: string; desc: string }> = {
  fast: { icon: Zap, label: "Fast", desc: "Quick answers with search" },
  deep: { icon: Search, label: "Deep Research", desc: "Browse, code, verify" },
  document: { icon: FileText, label: "Document", desc: "Files and generation" },
  image: { icon: ImageIcon, label: "Image", desc: "Image generation" },
};

/** Phone mode picker: one visual card per mode. */
const CHAT_MODE_CARDS: Array<{ key: string; label: string; text: string; icon: "ask" | "research" | "image" | "report" | "code" }> = [
  { key: "fast", label: "Fast", text: "Quick answers, with search", icon: "ask" },
  { key: "deep", label: "Deep research", text: "Browse, read and verify", icon: "research" },
  { key: "image", label: "Image", text: "Draw from a description", icon: "image" },
  { key: "document", label: "Document", text: "Make files and reports", icon: "report" },
  { key: "code", label: "Code mode", text: "Work on your server", icon: "code" },
];

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
  const [lastAttachments, setLastAttachments] = useState<Attachment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [, navigate] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  type ChatWidth = "normal" | "wide" | "full";
  const [chatWidth, setChatWidth] = useState<ChatWidth>(() => {
    try {
      const saved = window.localStorage.getItem("sutaeru.chatWidth");
      return saved === "wide" || saved === "full" ? saved : "normal";
    } catch { return "normal"; }
  });
  const cycleChatWidth = () => setChatWidth((current) => {
    const next: ChatWidth = current === "normal" ? "wide" : current === "wide" ? "full" : "normal";
    try { window.localStorage.setItem("sutaeru.chatWidth", next); } catch { /* storage may be unavailable */ }
    return next;
  });
  // Full width gives the whole screen to the conversation: no side panel, no history drawer.
  const showAgentPanel = agentPanelOpen && chatWidth !== "full";

  // Thread-level settings
  const [mode, setMode] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("mode");
      if (q && (q === "fast" || q === "deep" || q === "code")) return q;
    }
    return "fast";
  });
  const [allowedTools, setAllowedTools] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("mode");
      if (q && q in MODE_DEFAULTS) return MODE_DEFAULTS[q];
    }
    return MODE_DEFAULTS.fast;
  });

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
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  // Approval ids the person already decided or dismissed. The stream reducer only ever appends, so
  // without this its next update would put a card the human has just answered back on screen.
  const decidedApprovals = useRef<Set<string>>(new Set());

  // ─── Connection ─────────────────────────────────────────────────────────────
  // Offline is a visual state only: nothing is queued in the backend, the composer
  // locks and the message that did not reach the server stays on screen as waiting.
  const online = useOnline();
  const onlineRef = useRef(online);
  onlineRef.current = online;
  // Coming back: a waiting question goes back into the composer instead of being
  // sent on its own. Nothing is queued while the device is offline.
  useEffect(() => {
    if (!online) return;
    const waiting = messagesRef.current.filter((message) => message.queued);
    if (waiting.length === 0) return;
    const text = waiting.map((message) => message.content).join("\n\n");
    setMessages((prev) => prev.filter((message) => !message.queued));
    setInput((current) => (current.trim() ? `${current.trim()}\n\n${text}` : text));
  }, [online]);

  // ─── Code mode (admin only): Claude Code on the server, inside this thread ─
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const isAdmin = me.data?.role === "admin";
  const [codeAccess, setCodeAccess] = useState<CodeAccess>("read");
  const [codeTotp, setCodeTotp] = useState("");
  const isCode = mode === "code" && isAdmin;
  const code = useCodeThread(sessionId, isCode);
  // Opening a thread that already has a code session puts it back in Code mode.
  useEffect(() => {
    if (isAdmin && storedCodeSession(sessionId)) setMode("code");
  }, [sessionId, isAdmin]);

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
  // The run currently in flight. Held in a ref so both the `finally` of
  // handleSend and the Stop button can release it; closing twice is harmless
  // because a stream handle ignores repeat calls.
  const streamRef = useRef<StreamHandle | null>(null);
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
    if (nextMode === "code") {
      // Not a saved thread setting: the server only knows the chat modes.
      if (isAdmin) setMode("code");
      return;
    }
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
      setAttachments([]);
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
      // A card belongs to the conversation that raised it. Moving on drops it here, and the restore
      // effect asks for the pending ones of the conversation being entered.
      setPendingApprovals([]);
      decidedApprovals.current.clear();
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
    setAttachments([]);
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
    setPendingApprovals([]);
    decidedApprovals.current.clear();
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
      .then((data: Array<{ role: string; content: string; createdAt: string; model?: string; metadata?: HistoryMetadata }>) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          const saved = data.map((m) =>
            applyHistoryMetadata(
              {
                id: crypto.randomUUID(),
                role: m.role as "user" | "assistant",
                content: m.content,
                model: m.model,
                createdAt: new Date(m.createdAt),
              },
              m.metadata
            )
          );
          // Saved history only fills an empty thread. A fetch that lands after the person has sent
          // a message must not replace the live conversation with the older saved copy.
          setMessages((prev) => (prev.length > 0 ? prev : saved));
        }
        setHistoryState("ready");
      })
      .catch(() => { if (!cancelled) setHistoryState("error"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, historyAttempt, hasPersistedHistory]);

  // ─── Restore an approval that outlived the page ────────────────────────────
  // The approval event is streamed once. Reload the tab, or let a phone sleep through it, and the
  // card disappears while the run behind it keeps waiting for a decision nobody can see any more.
  // So ask what is still pending for this conversation and put those cards back — the list returns
  // the same fields the event carried, so a restored card is not a different kind of card.
  //
  // Only a conversation with saved history can have a card waiting; a fresh one cannot. And a
  // request that fails is swallowed on purpose: the thread still works, the run still waits, and
  // an error banner over a card that merely did not come back would be the worse outcome.
  useEffect(() => {
    if (!hasPersistedHistory) return;
    let cancelled = false;
    const origin = import.meta.env.VITE_SR1_API_ORIGIN || "";
    fetch(`${origin}/api/kemma/approvals?sessionId=${encodeURIComponent(sessionId)}&status=pending`, {
      credentials: "include",
      headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { approvals?: ApprovalRequest[] } | null) => {
        if (cancelled) return;
        const restored = data && Array.isArray(data.approvals) ? data.approvals : [];
        setPendingApprovals((prev) => mergeApprovals(prev, restored));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, hasPersistedHistory]);

  // ─── Send message ─────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (submission?: string | { text: string; files?: FileUIPart[]; attachments?: Attachment[] }) => {
      const messageText = (typeof submission === "string" ? submission : submission?.text ?? input).trim();
      if (!messageText || isStreaming) return;

      // Files dropped on the composer still arrive through the prompt input; they use the same device shape.
      const dropped: Attachment[] = (typeof submission === "object" ? submission.files ?? [] : [])
        .filter((file) => (file.url || "").startsWith("data:"))
        .map((file) => ({
          source: "device" as const,
          filename: file.filename || "attachment",
          mediaType: file.mediaType || "application/octet-stream",
          dataUrl: file.url,
        }));
      const attached = typeof submission === "object" && submission.attachments ? submission.attachments : attachments;
      const sent: Attachment[] = [...attached, ...dropped].slice(0, MAX_FILES);

      // Offline: the question stays on screen as waiting and nothing is sent.
      if (!onlineRef.current) {
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: "user",
          content: messageText,
          createdAt: new Date(),
          references: sent.map(attachmentName),
          queued: true,
        }]);
        setInput("");
        setAttachments([]);
        setError(null);
        return;
      }

      if (isCode) {
        if (code.running || code.busy) return;
        if (codeAccess === "full" && !code.session && codeTotp.length !== 6) {
          toast.error("Enter the 6-digit authenticator code for full access.");
          return;
        }
        const stream = beginStream("code-run");
        streamRef.current = stream;
        try {
          const ok = await code.send(messageText, { access: codeAccess, totp: codeTotp, attachments: sent });
          if (ok) { setInput(""); setAttachments([]); setCodeTotp(""); }
        } finally {
          stream.end();
        }
        return;
      }

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: messageText,
        createdAt: new Date(),
        references: sent.map(attachmentName),
      };

      setMessages((prev) => [...prev, userMsg]);
      sessionStorage.setItem("sutaeru_chat_has_history", "1");
      setHasPersistedHistory(true);
      setInput("");
      setAttachments([]);
      setLastInput(messageText);
      setLastAttachments(sent);
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
      // Opened after the plan-card shortcut, which returns without streaming, and
      // before the try below - its finally is what releases this handle.
      const stream = beginStream("answer");
      streamRef.current = stream;
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
      setPendingApprovals([]);
      let streamState = initialStreamState();

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
            ...(mode === "deep" ? {} : { sessionId, max: false, settings }),
            ...(sent.length > 0 ? { attachments: sent } : {}),
          }),
        });

        if (!response.ok) {
          const errData = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error ?? friendlyStatus(response.status));
        }

        if (!response.body) throw new Error("No response body from server");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser();

        const processRawEvents = (rawEvents: RawSseEvent[]) => {
          for (const raw of rawEvents) {
            const ev = decodeEvent(raw);
            if (!ev) continue;
            const next = reduceStream(streamState, ev);

            if (
              next.content !== streamState.content ||
              next.thinking !== streamState.thinking ||
              next.segments !== streamState.segments
            ) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: next.content,
                        thinking: next.thinking || undefined,
                        segments: next.segments.length > 0 ? next.segments : undefined,
                      }
                    : m
                )
              );
            }
            if (next.sources !== streamState.sources && next.sources !== null) {
              setSources(next.sources);
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, sources: next.sources! } : m))
              );
            }
            if (next.steps !== streamState.steps) {
              setAgentSteps(next.steps);
            }
            if (next.activity !== streamState.activity) {
              setActivity(next.activity);
            }
            if (next.skills !== streamState.skills) {
              setUsedSkills(next.skills);
            }
            if (next.usage !== streamState.usage && next.usage !== null) {
              setUsage(next.usage);
            }
            if (next.currentStep !== streamState.currentStep && next.currentStep !== null) {
              setCurrentStep(next.currentStep);
            }
            if (next.approvals !== streamState.approvals) {
              const fresh = next.approvals.filter((a) => !decidedApprovals.current.has(a.id));
              setPendingApprovals((prev) => mergeApprovals(prev, fresh));
            }

            streamState = next;

            switch (ev.type) {
              case "quota_warn":
                if (ev.message) toast.warning(ev.message);
                break;
              case "error":
                throw new Error(ev.message);
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            processRawEvents(parser.flush());
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          processRawEvents(parser.push(chunk));
        }

        const finalModel = streamState.model;
        const assistantSkills = streamState.skills;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  streaming: false,
                  model: finalModel,
                  skills: assistantSkills.length > 0 ? assistantSkills : undefined,
                  question: mode === "deep" ? messageText : undefined,
                  thinking: streamState.thinking || undefined,
                  segments: streamState.segments.length > 0 ? streamState.segments : undefined,
                  ...(streamState.steps.length > 0 ? { steps: streamState.steps } : {}),
                  ...(streamState.activity.length > 0 ? { activity: streamState.activity } : {}),
                }
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
              .map((m) => `${m.role === "user" ? "User" : "Sutaeru"}: ${m.content}`)
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
        if ((err as Error).name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    streaming: false,
                    ...(streamState.steps.length > 0 ? { steps: streamState.steps } : {}),
                    ...(streamState.activity.length > 0 ? { activity: streamState.activity } : {}),
                  }
                : m
            )
          );
          return;
        }
        const raw = (err as Error).message ?? "";
        // The connection dropped mid-run: the question stays on screen as waiting
        // and the offline banner explains it, so no second error message.
        if (err instanceof TypeError && !onlineRef.current) {
          setMessages((prev) => prev
            .filter((message) => message.id !== assistantId)
            .map((message) => (message.id === userMsg.id ? { ...message, queued: true } : message)));
          return;
        }
        const errMsg = err instanceof TypeError ? "Couldn't reach Sutaeru. Check your connection and retry." : raw || "Something went wrong. Please retry.";
        setError(errMsg);
        // Unchanged on purpose: Retry re-sends the question as a new message, so the failed pair is removed.
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
      } finally {
        setIsStreaming(false);
        setStartedAt(null);
        setCurrentStep("");
        // Every exit lands here - finished answer, Stop, the offline queueing
        // branch, a failed request - so this is what releases the pending update.
        stream.end();
        if (streamRef.current === stream) streamRef.current = null;
      }
    },
    [input, isStreaming, messages, sessionId, mode, messageModel, taggedSkills, attachments, isCode, code, codeAccess, codeTotp]
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

  const retry = () => void handleSend(lastAttachments.length ? { text: lastInput, attachments: lastAttachments } : lastInput);
  const stopRun = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStartedAt(null);
    setCurrentStep("");
    setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));
    // Stop is the user's intent, so the update guard is released here rather than
    // waiting for the aborted fetch to unwind. handleSend's finally ends the same
    // handle afterwards; a second end() is a no-op, unlike the old double decrement.
    streamRef.current?.end();
  };

  const exportThread = useCallback(() => {
    const md = messages
      .map((m) => `**${m.role === "user" ? "You" : "Sutaeru"}:** ${m.content}`)
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
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
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
    <div className="sutaeru-chat" data-chat-width={chatWidth} style={{ ...NEON_PAGE_BG, display: "flex", minHeight: "100vh" }}>
      <div style={NOISE_OVERLAY} />

      {/* Session sidebar */}
      <div
        className={cn(
          "flex-none transition-all duration-200 overflow-hidden flex flex-col",
          sidebarOpen ? "sutaeru-history-open" : "sutaeru-history-closed"
        )}
        style={{ zIndex: 10 }}
      >
        {sidebarOpen && (
          <div style={{ position: "relative", height: "100%" }}>
            <ChatSessionList
              activeSessionId={sessionId}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewChat}
              showCode={isAdmin}
              onSelectCodeSession={(id) => { rememberCodeSession(id, id); handleSelectSession(id); }}
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
          extraModes={isAdmin ? [{ key: "code", label: "Code mode", icon: "make" }] : []}
          onToggleMax={() => handleSetMode(mode === "deep" ? "fast" : "deep")}
          onExport={(format) => void exportThreadFromServer(format)}
          exportPending={exportPending}
          onInsights={() => setInsightsOpen(true)}
          chatWidth={chatWidth}
          onCycleWidth={cycleChatWidth}
          isAgentMode={isAgentMode}
          onSetAgentMode={setIsAgentMode}
        />
        <ChatInsightsDialog
          open={insightsOpen}
          onOpenChange={setInsightsOpen}
          initialConversation={messages.filter((m) => m.content.trim()).map((m) => `${m.role === "user" ? "User" : "Sutaeru"}: ${m.content}`).join("\n\n")}
        />

        <div className="sutaeru-run-status" role="status" aria-live="off">
          <span className={cn("sutaeru-status-dot", isStreaming && "sutaeru-status-active")} />
          <div className="sutaeru-status-copy"><strong>{isStreaming ? "Working" : error ? "Run failed" : "Ready"}</strong><span>{isStreaming ? currentStep || "Thinking…" : error ? "Check the message below" : "Start a conversation"}</span></div>
          <time className="sutaeru-timer" aria-label="Run duration">{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</time>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="flex flex-col flex-1 min-w-0">
            {isAgentMode ? (
              <AgentBuilder
                onCreateTask={(text) => handleSend(text)}
                onOpenStudio={() => navigate("/images")}
                onOpenSession={() => setIsAgentMode(false)}
                isStreaming={isStreaming}
                error={error}
              />
            ) : isCode ? <CodeThreadView code={code} /> : <ChatMessages
              messages={messages}
              isStreaming={isStreaming}
              messagesEndRef={messagesEndRef as RefObject<HTMLDivElement>}
              sources={sources}
              steps={agentSteps}
              activity={activity}
              runLabel={currentStep}
              offline={!online}
              onSelectPlan={handleSelectPlan}
            />}

            {pendingApprovals.length > 0 && (
              <div className="mx-auto w-full max-w-[800px] px-3 sm:px-6">
                {pendingApprovals.map((approval) => (
                  <ApprovalCard
                    key={approval.id}
                    approval={approval}
                    onDecision={(id) => {
                      decidedApprovals.current.add(id);
                      setPendingApprovals((prev) => prev.filter((a) => a.id !== id));
                    }}
                  />
                ))}
              </div>
            )}

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

            {isCode && (
              <CodeAccessBar access={codeAccess} onAccess={setCodeAccess} totp={codeTotp} onTotp={setCodeTotp} fullAvailable={code.fullAvailable} locked={!!code.session} />
            )}
            <div className="sutaeru-run-controls" data-offline={online ? undefined : "true"}>
              {modeSheetOpen && (
                <div className="sk-mode-sheet" role="radiogroup" aria-label="Chat mode">
                  {CHAT_MODE_CARDS.filter((m) => m.key !== "code" || isAdmin).map((m) => (
                    <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} className={`sk-mode-card${mode === m.key ? " is-active" : ""}`} onClick={() => { handleSetMode(m.key); setModeSheetOpen(false); }}>
                      {mode === m.key && <FocusBrackets />}
                      <SutaeruIcon name={m.icon} signal className="sk-mode-card-icon" />
                      <span className="sk-mode-card-title">{m.label}</span>
                      <span className="sk-mode-card-text">{m.text}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="sutaeru-run-actions">
                <Button size="icon" variant="outline" className="sk-chat-mobileonly" onClick={() => setSidebarOpen((o) => !o)} aria-label="Chat history" title="Chat history"><SutaeruIcon name="files" className="h-5 w-5" /></Button>
                <Button size="icon" variant="outline" className="sk-chat-mobileonly" onClick={handleNewChat} aria-label="New chat" title="New chat"><SutaeruIcon name="plus" className="h-5 w-5" /></Button>
                <Button size="icon" variant="outline" className="sk-chat-mobileonly" onClick={() => setModeSheetOpen((o) => !o)} aria-label="Chat mode" aria-expanded={modeSheetOpen} title="Chat mode"><SutaeruIcon name={(CHAT_MODE_CARDS.find((m) => m.key === mode) ?? CHAT_MODE_CARDS[0]).icon} className="h-5 w-5" /></Button>
                <Button size="icon" variant="outline" onClick={() => setSettingsOpen((o) => !o)} aria-label="Run settings" title="Run settings"><SutaeruIcon name="settings" className="h-5 w-5" /></Button>
                <Button size="icon" variant="outline" onClick={() => setMobileDetailsOpen((o) => !o)} aria-label="Run details" title="Run details"><SutaeruIcon name="review" className="h-5 w-5" /></Button>
                <Button size="icon" variant="outline" onClick={exportThread} disabled={messages.length === 0} aria-label="Export conversation" title="Export conversation"><SutaeruIcon name="download" className="h-5 w-5" /></Button>
                {isStreaming && <Button variant="outline" className="sutaeru-stop-run" onClick={stopRun}>Stop run</Button>}
              </div>
              {mobileDetailsOpen && <div className="sutaeru-mobile-details"><strong>Run details</strong><p>{isStreaming ? currentStep || "Thinking…" : error ? "Run failed" : "No active run"}</p>{agentSteps.map(step => <p key={step.id}>{stepStatusPrefix(step)} {step.label}</p>)}{sources.length > 0 && <div className="sutaeru-inline-sources"><strong>Sources</strong>{sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer"><span>{index + 1}. {source.title}</span><ExternalLink size={14} /></a>)}</div>}</div>}
              {!isAgentMode && (
              <div className="sutaeru-run-composer">
              <div className="sutaeru-composer-row mx-auto flex max-w-2xl items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="sk-attach-slot">
                    <AttachMenu attachments={attachments} onChange={setAttachments} disabled={isStreaming} />
                  </div>
                   <ChatInput
                    value={input}
                    isStreaming={isCode ? code.running : isStreaming}
                    onChange={setInput}
                    onKeyDown={handleKeyDown}
                     onSend={(message) => handleSend(message)}
                    onStop={isCode ? () => void code.stop() : stopRun}
                     allowAttachments={false}
                    offline={!online}
                  />
                </div>
              </div>
              </div>
              )}
            </div>
          </div>

          {/* Agent steps / status panel */}
          <div
            className={cn(
              "hidden xl:flex flex-col transition-all duration-200 overflow-hidden",
              showAgentPanel ? "w-72" : "w-0"
            )}
            style={{ borderLeft: showAgentPanel ? "1px solid var(--r-stroke)" : "none", background: "var(--r-panel)" }}
          >
            {showAgentPanel && (
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
                    <div className="sk-mode-tile">
                       <ModeIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ fontFamily: NEON_FD }}>{meta.label}</p>
                      <p className="sk-mode-tile-desc">{meta.desc}</p>
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
      {!agentPanelOpen && chatWidth !== "full" && (
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
