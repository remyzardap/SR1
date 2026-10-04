/**
 * server/kemma/orchestrator/graph.ts
 * Coherent Execution Graph and Task State Machine.
 *
 * Implements a Directed Acyclic Graph (DAG) of TaskNodes with:
 * - Topological sorting & cycle detection (Kahn's algorithm)
 * - State management (pending -> ready -> running -> completed/failed/cancelled/skipped)
 * - Dynamic addition of tasks at runtime (e.g., planner expanding into subtasks)
 * - Data propagation from ancestor outputs to downstream inputs
 * - Snapshotting for telemetry & events
 */

import type { TaskNode, TaskStatus, GraphSnapshot, BudgetUsage } from "./types";

export class GraphCycleError extends Error {
  constructor(message = "Cycle detected in execution graph") {
    super(message);
    this.name = "GraphCycleError";
  }
}

export class MissingDependencyError extends Error {
  constructor(taskId: string, missingDepId: string) {
    super(`Task "${taskId}" depends on non-existent task "${missingDepId}"`);
    this.name = "MissingDependencyError";
  }
}

export class ExecutionGraph {
  private nodes = new Map<string, TaskNode>();
  private status: "idle" | "running" | "completed" | "failed" | "cancelled" = "idle";
  private startedAt?: number;
  private completedAt?: number;

  constructor(initialNodes?: TaskNode[]) {
    if (initialNodes) {
      for (const node of initialNodes) {
        this.addTask(node);
      }
    }
  }

  /**
   * Adds a task to the execution graph.
   * If dependencies are not yet in the graph, it will still allow addition
   * but validate() will enforce referential integrity and acyclicity.
   */
  public addTask(node: TaskNode): this {
    if (this.nodes.has(node.id)) {
      throw new Error(`Task with id "${node.id}" already exists in the graph.`);
    }
    // New nodes start pending unless they have 0 dependencies and are marked ready
    const initialStatus: TaskStatus = node.status ?? (node.dependencies.length === 0 ? "ready" : "pending");
    this.nodes.set(node.id, {
      ...node,
      status: initialStatus,
      dependencies: [...node.dependencies],
    });
    return this;
  }

  public getTask(id: string): TaskNode | undefined {
    return this.nodes.get(id);
  }

  public getAllTasks(): TaskNode[] {
    return Array.from(this.nodes.values());
  }

  public getStatus(): "idle" | "running" | "completed" | "failed" | "cancelled" {
    return this.status;
  }

  public setStatus(status: "idle" | "running" | "completed" | "failed" | "cancelled"): void {
    this.status = status;
    if (status === "running" && !this.startedAt) {
      this.startedAt = Date.now();
    }
    if ((status === "completed" || status === "failed" || status === "cancelled") && !this.completedAt) {
      this.completedAt = Date.now();
    }
  }

  /**
   * Validates that the graph is a Directed Acyclic Graph (DAG) with no missing dependencies.
   * Throws MissingDependencyError or GraphCycleError if invalid.
   */
  public validate(): void {
    for (const [id, node] of this.nodes) {
      for (const depId of node.dependencies) {
        if (!this.nodes.has(depId)) {
          throw new MissingDependencyError(id, depId);
        }
      }
    }

    // Kahn's algorithm for cycle detection
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const id of this.nodes.keys()) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }

    for (const [id, node] of this.nodes) {
      for (const depId of node.dependencies) {
        adj.get(depId)!.push(id);
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visitedCount++;
      for (const neighbor of adj.get(current)!) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    if (visitedCount !== this.nodes.size) {
      throw new GraphCycleError();
    }
  }

  /**
   * Returns tasks in topological order.
   */
  public getTopologicalOrder(): TaskNode[] {
    this.validate();

    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const id of this.nodes.keys()) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }

    for (const [id, node] of this.nodes) {
      for (const depId of node.dependencies) {
        adj.get(depId)!.push(id);
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const order: TaskNode[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(this.nodes.get(current)!);
      for (const neighbor of adj.get(current)!) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    return order;
  }

  /**
   * Retrieves all tasks currently eligible to be executed ("ready").
   * Sorted by priority (highest first) if specified.
   */
  public getReadyTasks(): TaskNode[] {
    const ready: TaskNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.status === "ready") {
        ready.push(node);
      } else if (node.status === "pending") {
        // Check if all dependencies are completed
        const deps = node.dependencies.map((id) => this.nodes.get(id));
        const allCompleted = deps.every((d) => d && d.status === "completed");
        if (allCompleted) {
          node.status = "ready";
          ready.push(node);
        }
      }
    }
    return ready.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Mark a task as running.
   */
  public markRunning(id: string): TaskNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Task ${id} not found`);
    node.status = "running";
    node.startedAt = Date.now();
    return node;
  }

  /**
   * Mark a task as completed with output and usage metrics.
   * Updates dependent tasks: if all dependencies of a dependent task are completed,
   * transitions dependent task to "ready".
   */
  public markCompleted(
    id: string,
    output?: unknown,
    metrics?: {
      tokensUsed?: { input: number; output: number; total: number; cachedInput?: number };
      durationMs?: number;
    }
  ): { node: TaskNode; newReadyNodes: TaskNode[] } {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Task ${id} not found`);
    node.status = "completed";
    node.completedAt = Date.now();
    node.durationMs = metrics?.durationMs ?? (node.startedAt ? node.completedAt - node.startedAt : 0);
    if (output !== undefined) node.output = output;
    if (metrics?.tokensUsed) node.tokensUsed = metrics.tokensUsed;

    const newReadyNodes: TaskNode[] = [];

    // Find all direct dependents
    for (const candidate of this.nodes.values()) {
      if (candidate.status === "pending" && candidate.dependencies.includes(id)) {
        const deps = candidate.dependencies.map((depId) => this.nodes.get(depId));
        const allCompleted = deps.every((d) => d && d.status === "completed");
        if (allCompleted) {
          candidate.status = "ready";
          newReadyNodes.push(candidate);
        }
      }
    }

    return { node, newReadyNodes };
  }

  /**
   * Mark a task as failed.
   * Transitive dependents that cannot run will be marked as "skipped".
   */
  public markFailed(id: string, error: string): { node: TaskNode; skippedNodes: TaskNode[] } {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Task ${id} not found`);
    node.status = "failed";
    node.completedAt = Date.now();
    node.error = error;
    node.durationMs = node.startedAt ? node.completedAt - node.startedAt : 0;

    const skippedNodes: TaskNode[] = [];
    const skipQueue = [id];

    while (skipQueue.length > 0) {
      const failedId = skipQueue.shift()!;
      for (const candidate of this.nodes.values()) {
        if ((candidate.status === "pending" || candidate.status === "ready") && candidate.dependencies.includes(failedId)) {
          candidate.status = "skipped";
          candidate.completedAt = Date.now();
          skippedNodes.push(candidate);
          skipQueue.push(candidate.id);
        }
      }
    }

    return { node, skippedNodes };
  }

  /**
   * Mark a task as cancelled.
   */
  public markCancelled(id: string): TaskNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Task ${id} not found`);
    node.status = "cancelled";
    node.completedAt = Date.now();
    node.durationMs = node.startedAt ? node.completedAt - node.startedAt : 0;
    return node;
  }

  /**
   * Cancels all remaining pending or ready tasks in the graph.
   */
  public cancelRemaining(): TaskNode[] {
    const cancelled: TaskNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.status === "pending" || node.status === "ready") {
        node.status = "cancelled";
        node.completedAt = Date.now();
        cancelled.push(node);
      }
    }
    return cancelled;
  }

  /**
   * Checks if all tasks in the graph have reached a terminal status
   * (completed, failed, cancelled, skipped).
   */
  public isFinished(): boolean {
    if (this.nodes.size === 0) return true;
    for (const node of this.nodes.values()) {
      if (node.status === "pending" || node.status === "ready" || node.status === "running") {
        return false;
      }
    }
    return true;
  }

  /**
   * Collects outputs from direct dependencies of a task to pass as context.
   */
  public getDependencyOutputs(taskId: string): Record<string, unknown> {
    const node = this.nodes.get(taskId);
    if (!node) return {};
    const outputs: Record<string, unknown> = {};
    for (const depId of node.dependencies) {
      const depNode = this.nodes.get(depId);
      if (depNode && depNode.output !== undefined) {
        outputs[depId] = depNode.output;
      }
    }
    return outputs;
  }

  /**
   * Produces an immutable snapshot of graph state for observable events or debugging.
   */
  public snapshot(budgetUsage?: BudgetUsage): GraphSnapshot {
    return {
      status: this.status,
      nodes: Array.from(this.nodes.values()).map((n) => ({ ...n })),
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      durationMs: this.startedAt ? (this.completedAt ?? Date.now()) - this.startedAt : 0,
      budgetUsage: budgetUsage ?? {
        toolCalls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        steps: 0,
        durationMs: 0,
        costUsd: 0,
      },
    };
  }
}
