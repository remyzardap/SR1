/**
 * Stream state reducer for Sutaeru chat and agent runs.
 *
 * Pure functions maintaining conversational streaming state across
 * token, tool, activity, skill, and system events.
 */

import type { ActivityItem } from "@/components/ActivityFeed";
import type { ApprovalRequest, StreamEvent, StreamUsage } from "./sse";

export interface AgentStep {
  id: string;
  label: string;
  detail?: string;
  active?: boolean;
  status?: "running" | "done" | "error";
  durationMs?: number;
}

export interface Source {
  title: string;
  url: string;
  /** Stable source id from the server (P1-07). Absent on older payloads. */
  id?: number;
  /** Short quote the server sent alongside the source, when it has one. */
  snippet?: string;
}

export interface StreamSegment {
  kind: "narration" | "answer";
  end: number;
}

export interface StreamMeta {
  protocol: number;
  runId: string;
  sessionId?: string;
}

export interface StreamState {
  content: string;
  segments: StreamSegment[];
  thinking: string;
  steps: AgentStep[];
  activity: ActivityItem[];
  skills: Array<{ id: number; name: string }>;
  sources: Source[] | null;
  usage: StreamUsage | null;
  model?: string;
  meta?: StreamMeta;
  approvals: ApprovalRequest[];
  currentStep: string | null;
  error: string | null;
  done: boolean;
  stepCounter: number;
}

export function initialStreamState(): StreamState {
  return {
    content: "",
    segments: [],
    thinking: "",
    steps: [],
    activity: [],
    skills: [],
    sources: null,
    usage: null,
    approvals: [],
    currentStep: null,
    error: null,
    done: false,
    stepCounter: 0,
  };
}

export function reduceStream(state: StreamState, event: StreamEvent): StreamState {
  switch (event.type) {
    case "token": {
      if (!event.text) return state;
      return {
        ...state,
        content: state.content + event.text,
      };
    }

    case "agent": {
      const nextStep = "Working on your request…";
      if (state.currentStep === nextStep) return state;
      return {
        ...state,
        currentStep: nextStep,
      };
    }

    case "model": {
      const nextStep = "Working on your request…";
      const nextModel = event.label !== undefined ? event.label : state.model;
      if (state.currentStep === nextStep && state.model === nextModel) return state;
      return {
        ...state,
        currentStep: nextStep,
        ...(nextModel !== undefined ? { model: nextModel } : {}),
      };
    }

    case "tool_start": {
      const nextCounter = state.stepCounter + 1;
      const id = event.id ?? `step-${nextCounter}`;
      const label = `Run ${event.tool}`;
      const newStep: AgentStep = {
        id,
        label,
        detail: event.tool,
        status: "running",
        active: true,
      };
      return {
        ...state,
        stepCounter: nextCounter,
        steps: [...state.steps, newStep],
        currentStep: label,
      };
    }

    case "activity": {
      const at = state.activity.findIndex((existing) => existing.id === event.item.id);
      let newActivity: ActivityItem[];
      if (at >= 0) {
        newActivity = [...state.activity];
        newActivity[at] = { ...state.activity[at], ...event.item };
      } else {
        newActivity = [...state.activity, event.item];
      }

      let nextStep = state.currentStep;
      if (event.item.status === "running" && event.item.kind !== "write") {
        nextStep = event.item.detail ? `${event.item.label}: ${event.item.detail}` : event.item.label;
      }

      return {
        ...state,
        activity: newActivity,
        currentStep: nextStep,
      };
    }

    case "skill": {
      return {
        ...state,
        skills: [...state.skills, event.skill],
      };
    }

    case "notice": {
      if (!event.message) return state;
      const nextCounter = state.stepCounter + 1;
      const id = `step-${nextCounter}`;
      const newStep: AgentStep = {
        id,
        label: event.message,
        status: "done",
        active: false,
      };
      return {
        ...state,
        stepCounter: nextCounter,
        steps: [...state.steps, newStep],
      };
    }

    case "sources": {
      return {
        ...state,
        sources: event.sources,
      };
    }

    case "usage": {
      return {
        ...state,
        usage: event.usage,
      };
    }

    case "done": {
      const nextModel = event.model ?? state.model;
      let stepsChanged = false;
      const nextSteps = state.steps.map((s) => {
        const isRunning = s.status ? s.status === "running" : s.active !== false;
        if (isRunning) {
          stepsChanged = true;
          return {
            ...s,
            status: "done" as const,
            active: false,
          };
        }
        return s;
      });

      if (state.done && state.model === nextModel && !stepsChanged) return state;
      return {
        ...state,
        done: true,
        steps: stepsChanged ? nextSteps : state.steps,
        ...(nextModel !== undefined ? { model: nextModel } : {}),
      };
    }

    case "error": {
      let stepsChanged = false;
      const nextSteps = state.steps.map((s) => {
        const isRunning = s.status ? s.status === "running" : s.active !== false;
        if (isRunning) {
          stepsChanged = true;
          return {
            ...s,
            status: "error" as const,
            active: false,
          };
        }
        return s;
      });

      if (state.error === event.message && !stepsChanged) return state;
      return {
        ...state,
        error: event.message,
        steps: stepsChanged ? nextSteps : state.steps,
      };
    }

    case "quota_warn": {
      return state;
    }

    case "meta": {
      const nextMeta: StreamMeta = {
        protocol: event.protocol,
        runId: event.runId,
        ...(event.sessionId !== undefined ? { sessionId: event.sessionId } : {}),
      };
      return {
        ...state,
        meta: nextMeta,
      };
    }

    case "thinking": {
      if (!event.text || state.thinking.length >= 20000) return state;
      const nextThinking = (state.thinking + event.text).slice(0, 20000);
      if (nextThinking === state.thinking) return state;
      return {
        ...state,
        thinking: nextThinking,
      };
    }

    case "segment": {
      return {
        ...state,
        segments: [...state.segments, { kind: event.kind, end: state.content.length }],
      };
    }

    case "tool_end": {
      let matchIndex = -1;
      if (event.id) {
        matchIndex = state.steps.findIndex((s) => s.id === event.id);
      }
      if (matchIndex === -1 && event.tool) {
        for (let i = state.steps.length - 1; i >= 0; i--) {
          const s = state.steps[i];
          const isRunning = s.status ? s.status === "running" : s.active !== false;
          if (s.detail === event.tool && isRunning) {
            matchIndex = i;
            break;
          }
        }
      }
      if (matchIndex === -1) return state;

      const targetStep = state.steps[matchIndex];
      const isRunning = targetStep.status ? targetStep.status === "running" : targetStep.active !== false;
      if (!isRunning) return state;

      const nextStatus = event.ok === false ? "error" : "done";
      const nextDuration = typeof event.durationMs === "number" ? event.durationMs : undefined;

      const newStep: AgentStep = {
        ...targetStep,
        status: nextStatus,
        active: false,
        ...(nextDuration !== undefined ? { durationMs: nextDuration } : {}),
      };

      const newSteps = [...state.steps];
      newSteps[matchIndex] = newStep;
      return {
        ...state,
        steps: newSteps,
      };
    }

    case "approval_request": {
      return {
        ...state,
        approvals: [...state.approvals, event.approval],
      };
    }

    default:
      return state;
  }
}

export type ToolHeaderState = "input-available" | "output-available" | "output-error";

export function toolState(step: AgentStep, isRunning?: boolean): ToolHeaderState {
  if (step.status === "running") return "input-available";
  if (step.status === "done") return "output-available";
  if (step.status === "error") return "output-error";
  return isRunning ? "input-available" : "output-available";
}

export function formatDuration(durationMs: number): string {
  const ms = Math.max(0, durationMs);
  if (ms < 10000) {
    return `${(ms / 1000).toFixed(1)} s`;
  }
  return `${Math.round(ms / 1000)} s`;
}

export function stepStatusPrefix(step: AgentStep): string {
  if (step.status === "done") return "✓";
  if (step.status === "error") return "✕";
  if (step.status === "running") return "…";
  return step.active === false ? "✓" : "…";
}

