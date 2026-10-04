/**
 * server/kemma/orchestrator/types.ts
 * Type definitions for Kemma Orchestrator:
 * Execution Graph, Task State Machine, Budgeting, Routing, and Events.
 */

import type { RouteConfig, Tier } from "../../core/kemmaRouter";
import type { Source } from "../sources";
import type { ToolExecution } from "../engine";

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

export type TaskKind =
  | "plan"
  | "reason"
  | "tool"
  | "subagent"
  | "verify"
  | "synthesis"
  | "custom";

export interface RetryPolicy {
  /** Maximum number of retry attempts after initial failure. Default 2. */
  maxRetries: number;
  /** Initial delay in ms before first retry. Default 500. */
  initialDelayMs: number;
  /** Maximum backoff delay in ms. Default 10000. */
  maxDelayMs: number;
  /** Multiplier for exponential backoff. Default 2. */
  backoffFactor: number;
  /** Custom filter to decide if an error is retryable. */
  isRetryable?: (error: unknown) => boolean;
}

export interface TaskNode<TInput = any, TOutput = any> {
  id: string;
  kind: TaskKind;
  title: string;
  description?: string;
  /** IDs of predecessor tasks that must complete successfully before this task can run. */
  dependencies: string[];
  status: TaskStatus;
  priority?: number;
  input: TInput;
  output?: TOutput;
  error?: string;
  /** Specific tool name if this is a tool task. */
  toolName?: string;
  /** Tool arguments if this is a tool task. */
  toolArgs?: unknown;
  /** Model override or chosen model label for this task. (NO Claude allowed) */
  model?: string;
  /** Custom retry policy for this task. */
  retryPolicy?: RetryPolicy;
  /** Timeout in ms for this specific task. */
  timeoutMs?: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  tokensUsed?: { input: number; output: number; total: number; cachedInput?: number };
  metadata?: Record<string, unknown>;
}

export interface BudgetConfig {
  maxToolCalls?: number;
  maxTokens?: number;
  maxSteps?: number;
  maxDurationMs?: number;
  maxCostUsd?: number;
}

export interface BudgetUsage {
  toolCalls: number;
  tokens: { input: number; output: number; total: number; cachedInput?: number };
  steps: number;
  durationMs: number;
  costUsd: number;
}

export interface GraphSnapshot {
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  nodes: TaskNode[];
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  budgetUsage: BudgetUsage;
}

export interface OrchestratorContext {
  userId: number;
  userName?: string;
  sessionId?: string;
  reportId?: string;
  tier: Tier;
  isThinking: boolean;
  isVoice?: boolean;
  allowedTools?: string[];
  modelOverride?: string;
  signal?: AbortSignal;
}

export interface SubAgentTaskOutput {
  query: string;
  response: string;
  sources: Source[];
  toolCalls: ToolExecution[];
  tokensUsed: { input: number; output: number; total: number };
  modelsUsed: string[];
  durationMs: number;
}

export interface OrchestratorResult {
  response: string;
  graph: GraphSnapshot;
  toolCalls: ToolExecution[];
  sources: Source[];
  tokensUsed: { input: number; output: number; total: number; cachedInput?: number };
  modelsUsed: string[];
  stepsUsed: number;
  durationMs: number;
  isAgentic: boolean;
  isError?: boolean;
}
