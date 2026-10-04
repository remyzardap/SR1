/**
 * server/kemma/orchestrator/scheduler.ts
 * Concurrent task scheduler for the Kemma Orchestrator.
 *
 * Runs ready tasks concurrently up to maxConcurrency (respecting KEMMA_MAX_SUBAGENTS).
 * Prioritizes tasks by priority score.
 * Reacts to completed/failed tasks by scheduling newly-ready dependent tasks.
 */

import { ExecutionGraph } from "./graph";
import type { TaskNode } from "./types";
import { OrchestratorEventEmitter } from "./events";
import { CancellationController } from "./cancellation";

export interface SchedulerOptions {
  maxConcurrency?: number;
  events?: OrchestratorEventEmitter;
  cancellation?: CancellationController;
}

export class Scheduler {
  private maxConcurrency: number;
  private runningTasks = new Map<string, Promise<void>>();
  private events?: OrchestratorEventEmitter;
  private cancellation?: CancellationController;

  constructor(options: SchedulerOptions = {}) {
    const envMax = Number(process.env.KEMMA_MAX_SUBAGENTS ?? "3");
    const defaultMax = Number.isFinite(envMax) && envMax >= 1 ? Math.min(envMax, 5) : 3;
    this.maxConcurrency = options.maxConcurrency ?? defaultMax;
    this.events = options.events;
    this.cancellation = options.cancellation;
  }

  public get activeCount(): number {
    return this.runningTasks.size;
  }

  public get concurrencyLimit(): number {
    return this.maxConcurrency;
  }

  /**
   * Executes the entire graph to completion or until cancelled/failed.
   * Dispatches tasks to taskExecutor whenever concurrency slots open up.
   */
  public async runGraph(
    graph: ExecutionGraph,
    taskExecutor: (task: TaskNode) => Promise<unknown>
  ): Promise<void> {
    graph.setStatus("running");
    if (this.events) {
      this.events.emitGraphStart(graph.snapshot());
    }

    const checkAborted = () => {
      if (this.cancellation?.aborted) {
        const reason = this.cancellation.reason || "Execution cancelled";
        graph.setStatus("cancelled");
        graph.cancelRemaining();
        if (this.events) {
          this.events.emitGraphCancelled(reason, graph.snapshot());
        }
        return true;
      }
      return false;
    };

    if (checkAborted()) return;

    try {
      while (!graph.isFinished()) {
        if (checkAborted()) break;

        // Drain ready tasks up to concurrency capacity
        const ready = graph.getReadyTasks();

        if (ready.length === 0 && this.runningTasks.size === 0) {
          // No tasks ready and none running, but graph is not finished:
          // Must be unreachable or remaining tasks skipped
          break;
        }

        while (ready.length > 0 && this.runningTasks.size < this.maxConcurrency) {
          if (checkAborted()) break;

          const task = ready.shift()!;
          const taskId = task.id;

          // Mark task as running
          graph.markRunning(taskId);
          this.events?.emitTaskStart(task);

          // Launch async runner
          const taskPromise = (async () => {
            try {
              if (this.cancellation?.aborted) {
                graph.markCancelled(taskId);
                return;
              }

              const output = await taskExecutor(task);

              if (this.cancellation?.aborted) {
                graph.markCancelled(taskId);
                return;
              }

              const { newReadyNodes } = graph.markCompleted(taskId, output);
              this.events?.emitTaskCompleted(task, output);
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              if (this.cancellation?.aborted) {
                graph.markCancelled(taskId);
              } else {
                const { skippedNodes } = graph.markFailed(taskId, errMsg);
                this.events?.emitTaskFailed(task, errMsg);
                for (const skipped of skippedNodes) {
                  this.events?.emitTaskSkipped(skipped);
                }
              }
            } finally {
              this.runningTasks.delete(taskId);
            }
          })();

          this.runningTasks.set(taskId, taskPromise);
        }

        if (this.runningTasks.size > 0) {
          // Wait for at least one running task to complete before next loop iteration
          await Promise.race(this.runningTasks.values());
        }
      }

      // Await any remaining stragglers
      if (this.runningTasks.size > 0) {
        await Promise.all(this.runningTasks.values());
      }

      if (graph.getStatus() === "running") {
        const hasFailures = graph.getAllTasks().some((t) => t.status === "failed");
        if (hasFailures) {
          graph.setStatus("failed");
          this.events?.emitGraphFailed("One or more tasks failed", graph.snapshot());
        } else {
          graph.setStatus("completed");
          this.events?.emitGraphCompleted(graph.snapshot());
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      graph.setStatus("failed");
      this.events?.emitGraphFailed(msg, graph.snapshot());
      throw err;
    }
  }
}
