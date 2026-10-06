/**
 * Typed engine and SSE stream events.
 *
 * Discriminated union of all events emitted by the Kemma engine, tool runtime,
 * and SSE streaming endpoints.
 *
 * @module kemma/events
 * @see docs/spec/PHASE-1.md "P1-03 Stream every turn, plus thinking and segment events"
 */

import type { Source } from "./sources";

export type SegmentKind = "narration" | "answer";

export interface MetaEvent {
  type: "meta";
  protocol: number;
  runId: string;
  sessionId?: string;
}

export interface TokenEvent {
  type: "token";
  text: string;
}

export interface ThinkingEvent {
  type: "thinking";
  text: string;
}

export interface SegmentEvent {
  type: "segment";
  kind: SegmentKind;
}

export interface AgentEvent {
  type: "agent";
  agentic?: boolean;
}

export interface ModelEvent {
  type: "model";
  step: number;
  label: string;
}

export interface ToolStartEvent {
  type: "tool_start";
  id?: string;
  tool: string;
  input: unknown;
}

export interface ToolEndEvent {
  type: "tool_end";
  id?: string;
  tool: string;
  input?: unknown;
  output?: unknown;
  durationMs?: number;
  step?: number;
  ok?: boolean;
}

export interface ActivityEvent {
  type: "activity";
  item?: unknown;
  [key: string]: unknown;
}

export interface SkillEvent {
  type: "skill";
  skill: { id: number; name: string };
}

export interface QuotaWarnEvent {
  type: "quota_warn";
  message?: string;
}

export interface NoticeEvent {
  type: "notice";
  message?: string;
}

export interface SourcesEvent {
  type: "sources";
  sources: Source[] | unknown[];
}

export interface UsageEvent {
  type: "usage";
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface DoneEvent {
  type: "done";
  model?: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export interface FileEvent {
  type: "file";
  [key: string]: unknown;
}

export interface ImageEvent {
  type: "image";
  [key: string]: unknown;
}

export interface JobEvent {
  type: "job";
  [key: string]: unknown;
}

export interface ApprovalRequestEvent {
  type: "approval_request";
  [key: string]: unknown;
}

export interface GenericEngineEvent {
  type: string;
  [key: string]: unknown;
}

export type EngineEvent =
  | MetaEvent
  | TokenEvent
  | ThinkingEvent
  | SegmentEvent
  | AgentEvent
  | ModelEvent
  | ToolStartEvent
  | ToolEndEvent
  | ActivityEvent
  | SkillEvent
  | QuotaWarnEvent
  | NoticeEvent
  | SourcesEvent
  | UsageEvent
  | DoneEvent
  | ErrorEvent
  | FileEvent
  | ImageEvent
  | JobEvent
  | ApprovalRequestEvent
  | GenericEngineEvent;
