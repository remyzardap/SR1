/**
 * server/kemma/orchestrator/events.ts
 * Strongly typed observable event system for Kemma Orchestrator.
 *
 * Emits fine-grained lifecycle events for graphs, tasks, tools, models,
 * budgets, and converts them to user-facing ActivityEvents (server/kemma/activity.ts)
 * for seamless SSE streaming.
 */

import { EventEmitter } from "node:events";
import type { TaskNode, GraphSnapshot, BudgetUsage } from "./types";
import type { Source } from "../sources";
import {
  describeToolStart,
  describeToolEnd,
  describePhase,
  type ActivityEvent,
} from "../activity";

export interface OrchestratorEvents {
  "graph:start": (graph: GraphSnapshot) => void;
  "graph:completed": (graph: GraphSnapshot) => void;
  "graph:failed": (error: string, graph: GraphSnapshot) => void;
  "graph:cancelled": (reason: string, graph: GraphSnapshot) => void;

  "task:scheduled": (task: TaskNode) => void;
  "task:start": (task: TaskNode) => void;
  "task:progress": (task: TaskNode, progress: number, message?: string) => void;
  "task:completed": (task: TaskNode, output: unknown) => void;
  "task:failed": (task: TaskNode, error: string) => void;
  "task:skipped": (task: TaskNode) => void;
  "task:retry": (task: TaskNode, attempt: number, error: unknown, delayMs: number) => void;

  "tool:start": (task: TaskNode, tool: string, input: unknown) => void;
  "tool:end": (task: TaskNode, tool: string, result: unknown, durationMs: number) => void;

  "model:route": (task: TaskNode, routeLabel: string, purpose?: string) => void;
  "token:stream": (chunk: string) => void;

  "budget:update": (usage: BudgetUsage) => void;
  "budget:exhausted": (reason: string) => void;

  "source:discovered": (sources: Source[]) => void;
  "notice": (message: string) => void;

  "activity": (event: ActivityEvent) => void;
}

export class OrchestratorEventEmitter extends EventEmitter {
  private activitySeq = 0;
  private activeActivities = new Map<string, string>(); // taskId -> activityId

  constructor() {
    super();
    // Default max listeners
    this.setMaxListeners(50);
  }

  public emitGraphStart(graph: GraphSnapshot): void {
    this.emit("graph:start", graph);
  }

  public emitGraphCompleted(graph: GraphSnapshot): void {
    this.emit("graph:completed", graph);
  }

  public emitGraphFailed(error: string, graph: GraphSnapshot): void {
    this.emit("graph:failed", error, graph);
  }

  public emitGraphCancelled(reason: string, graph: GraphSnapshot): void {
    this.emit("graph:cancelled", reason, graph);
  }

  public emitTaskStart(task: TaskNode): void {
    this.emit("task:start", task);
    // Convert to activity event
    const actId = `task-${++this.activitySeq}`;
    this.activeActivities.set(task.id, actId);

    if (task.kind === "plan") {
      this.emit("activity", describePhase(actId, "think"));
    } else if (task.kind === "tool" && task.toolName) {
      this.emit("activity", describeToolStart(actId, task.toolName, task.toolArgs ?? task.input));
    } else if (task.kind === "subagent") {
      this.emit("activity", {
        id: actId,
        kind: "think",
        status: "running",
        label: task.title || "Researching sub-topic",
        detail: typeof task.input === "string" ? task.input : (task.input?.query ?? ""),
      });
    } else if (task.kind === "verify") {
      this.emit("activity", {
        id: actId,
        kind: "think",
        status: "running",
        label: "Verifying citations",
      });
    } else if (task.kind === "synthesis") {
      this.emit("activity", describePhase(actId, "write"));
    }
  }

  public emitTaskCompleted(task: TaskNode, output: unknown): void {
    this.emit("task:completed", task, output);
    const actId = this.activeActivities.get(task.id);
    if (actId) {
      if (task.kind === "plan") {
        this.emit("activity", describePhase(actId, "think", "done"));
      } else if (task.kind === "tool" && task.toolName) {
        this.emit("activity", describeToolEnd(actId, task.toolName, task.toolArgs ?? task.input, output, task.durationMs ?? 0));
      } else if (task.kind === "subagent" || task.kind === "verify") {
        this.emit("activity", {
          id: actId,
          kind: "think",
          status: "done",
          label: task.title,
          durationMs: task.durationMs,
        });
      } else if (task.kind === "synthesis") {
        this.emit("activity", describePhase(actId, "write", "done"));
      }
      this.activeActivities.delete(task.id);
    }
  }

  public emitTaskFailed(task: TaskNode, error: string): void {
    this.emit("task:failed", task, error);
    const actId = this.activeActivities.get(task.id);
    if (actId) {
      this.emit("activity", {
        id: actId,
        kind: "tool",
        status: "error",
        label: `Task failed: ${task.title}`,
        detail: error.slice(0, 140),
      });
      this.activeActivities.delete(task.id);
    }
  }

  public emitTaskSkipped(task: TaskNode): void {
    this.emit("task:skipped", task);
  }

  public emitTaskRetry(task: TaskNode, attempt: number, error: unknown, delayMs: number): void {
    this.emit("task:retry", task, attempt, error, delayMs);
    this.emitNotice(`Retrying "${task.title}" (attempt ${attempt}) after ${delayMs}ms...`);
  }

  public emitToolStart(task: TaskNode, tool: string, input: unknown): void {
    this.emit("tool:start", task, tool, input);
  }

  public emitToolEnd(task: TaskNode, tool: string, result: unknown, durationMs: number): void {
    this.emit("tool:end", task, tool, result, durationMs);
  }

  public emitModelRoute(task: TaskNode, routeLabel: string, purpose?: string): void {
    this.emit("model:route", task, routeLabel, purpose);
  }

  public emitTokenStream(chunk: string): void {
    this.emit("token:stream", chunk);
  }

  public emitBudgetUpdate(usage: BudgetUsage): void {
    this.emit("budget:update", usage);
  }

  public emitBudgetExhausted(reason: string): void {
    this.emit("budget:exhausted", reason);
  }

  public emitSourcesDiscovered(sources: Source[]): void {
    if (sources.length > 0) {
      this.emit("source:discovered", sources);
    }
  }

  public emitNotice(message: string): void {
    this.emit("notice", message);
  }
}
