import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { SessionView, type SessionViewProps, type SessionStep, type SessionDraft } from "./SessionView";
import { getAuthToken } from "@/lib/authSession";
import { trpc } from "@/lib/trpc";
import type { AgentStep } from "@/lib/streamReducer";

interface SessionContainerProps {
  sessionId: string;
  runId?: string;
  onBack?: () => void;
  onOpenDone?: () => void;
}

function mapAgentStepsToSessionSteps(steps: AgentStep[]): SessionStep[] {
  return steps.map((step, index) => ({
    id: step.id,
    name: step.label,
    detail: step.detail,
    status: step.status === "running" ? "running" : step.status === "done" ? "done" : step.status === "error" ? "stopped" : "queued",
    progress: step.status === "running" ? 0.5 : step.status === "done" ? 1 : 0,
    sourcesTotal: step.detail === "web_search" ? 14 : undefined,
    sourcesDone: step.status === "done" && step.detail === "web_search" ? 14 : step.status === "running" && step.detail === "web_search" ? 7 : undefined,
    pagesTotal: step.detail === "browse" ? 12 : undefined,
    pagesDone: step.status === "done" && step.detail === "browse" ? 12 : step.status === "running" && step.detail === "browse" ? 6 : undefined,
  }));
}

function getDraftForType(type: string): SessionDraft {
  const drafts: Record<string, SessionDraft> = {
    report: {
      eyebrow: "Result · Draft",
      title: "PV module supplier comparison",
      lede: "Three shortlisted suppliers compared on price per Wp, lead time and warranty.",
      rows: [
        { label: "Jinko Tiger Neo 620 W", value: "USD 0.11 / Wp · 6 wks" },
        { label: "LONGi Hi-MO 6 580 W", value: "USD 0.12 / Wp · 4 wks" },
        { label: "Trina Vertex 600 W", value: "USD 0.11 / Wp · 8 wks" },
      ],
    },
    deck: {
      eyebrow: "Deck · Draft",
      title: "Q3 investor update",
      lede: "Ten slides. Revenue first, then margin, then the three risks with owners.",
      rows: [
        { label: "01 Revenue up 12 percent", value: "Bar chart · quarter on quarter" },
        { label: "02 Margin held at 21 percent", value: "Line chart · trailing 4 quarters" },
        { label: "03 Three risks for the board", value: "Table · owner and date" },
      ],
    },
    sheet: {
      eyebrow: "Sheet · Draft",
      title: "Villa BOQ and budget",
      lede: "Six tabs. Quantities link to unit rates, so totals update when a rate changes.",
      rows: [
        { label: "Structure", value: "IDR 1.42 bn" },
        { label: "Finishes", value: "IDR 0.86 bn" },
        { label: "MEP", value: "IDR 0.51 bn" },
      ],
    },
    brief: {
      eyebrow: "Brief · Draft",
      title: "Off grid solar for remote villages",
      lede: "A 120 kWp array with storage delivers power at USD 0.28 to 0.45 per kWh.",
      rows: [
        { label: "Decision 1", value: "Approve a pilot in one village" },
        { label: "Decision 2", value: "Apply for the capital grant" },
        { label: "Risk", value: "Battery prices move the range" },
      ],
    },
    monitor: {
      eyebrow: "Monitor · Baseline",
      title: "PLN tariff watch",
      lede: "Baseline recorded. Sutaeru checks every 6 hours and tells you only when something changes.",
      rows: [
        { label: "R-1 household", value: "IDR 1,444.70 / kWh" },
        { label: "I-3 industry", value: "IDR 1,114.74 / kWh" },
        { label: "Next check", value: "Today 20:00" },
      ],
    },
  };
  return drafts[type] || drafts.report;
}

function getTitleForType(type: string): string {
  const titles: Record<string, string> = {
    report: "Solar PV supplier research",
    deck: "TGWI investor update Q3",
    sheet: "Villa BOQ and budget",
    brief: "Off grid solar board brief",
    monitor: "PLN tariff watch",
    image: "Image generation",
  };
  return titles[type] || "Agent session";
}

export function SessionContainer({ sessionId, runId, onBack, onOpenDone }: SessionContainerProps) {
  const [status, setStatus] = useState<"running" | "stopped" | "done" | "error">("running");
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [estimatedRemainingMs, setEstimatedRemainingMs] = useState<number | undefined>(undefined);
  const [steps, setSteps] = useState<SessionStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [draft, setDraft] = useState<SessionDraft | undefined>(undefined);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [sessionType, setSessionType] = useState("report");
  const [sessionTitle, setSessionTitle] = useState("Agent session");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const token = getAuthToken();

  const { data: sessionSettings } = trpc.kemma.getSessionSettings.useQuery(
    { sessionId },
    { enabled: !!sessionId }
  );

  const fetchSessionData = useCallback(async () => {
    if (!runId) return;
    try {
      const origin = import.meta.env.VITE_SR1_API_ORIGIN || "";
      const res = await fetch(`${origin}/api/kemma/session/${runId}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSessionType(data.type || "report");
        setSessionTitle(getTitleForType(data.type || "report"));
        setDraft(getDraftForType(data.type || "report"));
        setSteps(mapAgentStepsToSessionSteps(data.steps || []));
        setProgress(data.progress || 0);
        setStatus(data.status || "running");
        setStartedAt(data.startedAt ? new Date(data.startedAt).getTime() : Date.now());
        if (data.stoppedAt) setStoppedAt(new Date(data.stoppedAt).getTime());
        if (data.steps && data.steps.length > 0) {
          const runningIndex = data.steps.findIndex((s: AgentStep) => s.status === "running");
          setCurrentStepIndex(runningIndex >= 0 ? runningIndex : data.steps.length - 1);
        }
      }
    } catch {
      // Ignore fetch errors, use defaults
    }
  }, [runId, token]);

  useEffect(() => {
    fetchSessionData();
  }, [fetchSessionData]);

  useEffect(() => {
    if (status === "running" && startedAt) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = now - (startedAt || now);
        setElapsedMs(elapsed);
        const remaining = Math.max(0, 90000 - elapsed);
        setEstimatedRemainingMs(remaining);
        const p = Math.min(1, elapsed / 90000);
        setProgress(p);

        if (p >= 1) {
          setStatus("done");
          setProgress(1);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, startedAt]);

  const handleStop = useCallback(() => {
    if (runId) {
      fetch(`${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/kemma/session/${runId}/stop`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});
    }
    setStatus("stopped");
    setStoppedAt(Date.now());
    setShowStopConfirm(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [runId, token]);

  const handleResume = useCallback(() => {
    if (runId && stoppedAt) {
      fetch(`${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/kemma/session/${runId}/resume`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});
    }
    setStatus("running");
    setShowStopConfirm(false);
    if (startedAt && stoppedAt) {
      const pausedDuration = Date.now() - stoppedAt;
      setStartedAt(startedAt + pausedDuration);
    }
    setStoppedAt(null);
  }, [runId, stoppedAt, startedAt, token]);

  const handleKeepWorking = useCallback(() => {
    setShowStopConfirm(false);
  }, []);

  const handleAskStop = useCallback(() => {
    setShowStopConfirm(true);
  }, []);

  const handleSendMessage = useCallback((text: string) => {
    if (runId) {
      fetch(`${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/kemma/session/${runId}/message`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    }
  }, [runId, token]);

  const handleSkipDemo = useCallback(() => {
    setProgress(Math.max(progress, 0.94));
  }, [progress]);

  const handleConfirmStop = useCallback(() => {
    handleStop();
  }, [handleStop]);

  const viewProps: SessionViewProps = {
    title: sessionTitle,
    progress,
    status,
    elapsedMs,
    estimatedRemainingMs,
    steps,
    currentStepIndex,
    draft,
    showStopConfirm,
    onStop: handleAskStop,
    onResume: handleResume,
    onKeepWorking: handleKeepWorking,
    onSendMessage: handleSendMessage,
    onSkipDemo: handleSkipDemo,
  };

  return <SessionView {...viewProps} />;
}

export default SessionContainer;