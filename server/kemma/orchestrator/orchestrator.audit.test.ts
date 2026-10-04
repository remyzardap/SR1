/**
 * server/kemma/orchestrator/orchestrator.audit.test.ts
 * Comprehensive audit tests for the Kemma Orchestrator:
 * - Execution graph DAG validation, cycles, and task states
 * - Scheduler concurrency limits and priority queues
 * - Budget tracking and limit enforcement
 * - Cancellation (AbortSignal) and exponential backoff retries
 * - Model routing (strictly NO Claude) and tool safety
 * - Observable events and ActivityEvent SSE compatibility
 * - End-to-end execution runtime
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ExecutionGraph,
  GraphCycleError,
  MissingDependencyError,
} from "./graph";
import { Scheduler } from "./scheduler";
import { BudgetTracker } from "./budget";
import { CancellationController } from "./cancellation";
import { executeWithRetry, isTransientError } from "./retries";
import { OrchestratorEventEmitter } from "./events";
import { selectRouteForTask } from "./modelRouter";
import { executeOrchestratorTool } from "./toolRouter";
import { TaskPlanner } from "./planner";
import { OrchestratorRuntime } from "./runtime";
import { runOrchestrator } from "./index";
import type { TaskNode, OrchestratorContext } from "./types";

describe("ExecutionGraph & Task State", () => {
  it("builds a valid DAG and produces correct topological order", () => {
    const graph = new ExecutionGraph();
    graph.addTask({ id: "t1", kind: "plan", title: "Plan", dependencies: [], status: "ready", input: {} });
    graph.addTask({ id: "t2", kind: "subagent", title: "Sub 1", dependencies: ["t1"], status: "pending", input: {} });
    graph.addTask({ id: "t3", kind: "subagent", title: "Sub 2", dependencies: ["t1"], status: "pending", input: {} });
    graph.addTask({ id: "t4", kind: "synthesis", title: "Synth", dependencies: ["t2", "t3"], status: "pending", input: {} });

    graph.validate();
    const order = graph.getTopologicalOrder().map((t) => t.id);
    expect(order[0]).toBe("t1");
    expect(order.indexOf("t2")).toBeGreaterThan(order.indexOf("t1"));
    expect(order.indexOf("t3")).toBeGreaterThan(order.indexOf("t1"));
    expect(order.indexOf("t4")).toBeGreaterThan(order.indexOf("t2"));
    expect(order.indexOf("t4")).toBeGreaterThan(order.indexOf("t3"));
  });

  it("detects cyclic dependencies and throws GraphCycleError", () => {
    const graph = new ExecutionGraph();
    graph.addTask({ id: "a", kind: "reason", title: "A", dependencies: ["b"], status: "pending", input: {} });
    graph.addTask({ id: "b", kind: "reason", title: "B", dependencies: ["c"], status: "pending", input: {} });
    graph.addTask({ id: "c", kind: "reason", title: "C", dependencies: ["a"], status: "pending", input: {} });

    expect(() => graph.validate()).toThrow(GraphCycleError);
  });

  it("detects missing dependencies and throws MissingDependencyError", () => {
    const graph = new ExecutionGraph();
    graph.addTask({ id: "a", kind: "reason", title: "A", dependencies: ["non-existent"], status: "pending", input: {} });

    expect(() => graph.validate()).toThrow(MissingDependencyError);
  });

  it("transitions ready tasks only when all dependencies complete", () => {
    const graph = new ExecutionGraph();
    graph.addTask({ id: "t1", kind: "plan", title: "Plan", dependencies: [], status: "ready", input: {} });
    graph.addTask({ id: "t2", kind: "tool", title: "Tool", dependencies: [], status: "ready", input: {} });
    graph.addTask({ id: "t3", kind: "synthesis", title: "Synth", dependencies: ["t1", "t2"], status: "pending", input: {} });

    // Initially t1 and t2 are ready, t3 is pending
    const initialReady = graph.getReadyTasks().map((t) => t.id);
    expect(initialReady.sort()).toEqual(["t1", "t2"]);

    // Complete t1
    const { newReadyNodes: afterT1 } = graph.markCompleted("t1", "plan output");
    expect(afterT1).toEqual([]); // t3 still needs t2
    expect(graph.getTask("t3")?.status).toBe("pending");

    // Complete t2
    const { newReadyNodes: afterT2 } = graph.markCompleted("t2", "tool output");
    expect(afterT2.map((t) => t.id)).toEqual(["t3"]);
    expect(graph.getTask("t3")?.status).toBe("ready");
  });

  it("cascades skipped status to downstream dependents when a dependency fails", () => {
    const graph = new ExecutionGraph();
    graph.addTask({ id: "t1", kind: "plan", title: "Plan", dependencies: [], status: "ready", input: {} });
    graph.addTask({ id: "t2", kind: "subagent", title: "Subagent", dependencies: ["t1"], status: "pending", input: {} });
    graph.addTask({ id: "t3", kind: "synthesis", title: "Synth", dependencies: ["t2"], status: "pending", input: {} });

    const { skippedNodes } = graph.markFailed("t1", "Planner failed");
    expect(graph.getTask("t1")?.status).toBe("failed");
    expect(graph.getTask("t2")?.status).toBe("skipped");
    expect(graph.getTask("t3")?.status).toBe("skipped");
    expect(skippedNodes.map((n) => n.id).sort()).toEqual(["t2", "t3"]);
  });

  it("gathers output from dependencies for downstream context", () => {
    const graph = new ExecutionGraph();
    graph.addTask({ id: "t1", kind: "tool", title: "Tool", dependencies: [], status: "ready", input: {} });
    graph.addTask({ id: "t2", kind: "synthesis", title: "Synth", dependencies: ["t1"], status: "pending", input: {} });

    graph.markCompleted("t1", { text: "result from tool" });
    const outputs = graph.getDependencyOutputs("t2");
    expect(outputs).toEqual({
      t1: { text: "result from tool" },
    });
  });

  it("creates an immutable snapshot with timing and status", () => {
    const graph = new ExecutionGraph();
    graph.addTask({ id: "t1", kind: "reason", title: "Direct", dependencies: [], status: "ready", input: {} });
    graph.setStatus("running");
    graph.markCompleted("t1", "Done");
    graph.setStatus("completed");

    const snap = graph.snapshot();
    expect(snap.status).toBe("completed");
    expect(snap.nodes).toHaveLength(1);
    expect(snap.nodes[0].output).toBe("Done");
  });
});

describe("Scheduler & Concurrency", () => {
  it("enforces maxConcurrency so concurrent tasks never exceed the limit", async () => {
    const maxConcurrency = 2;
    const scheduler = new Scheduler({ maxConcurrency });

    const graph = new ExecutionGraph();
    for (let i = 1; i <= 5; i++) {
      graph.addTask({
        id: `t${i}`,
        kind: "subagent",
        title: `Task ${i}`,
        dependencies: [],
        status: "ready",
        input: { i },
      });
    }

    let activeCount = 0;
    let maxSeenActive = 0;

    await scheduler.runGraph(graph, async (task) => {
      activeCount++;
      maxSeenActive = Math.max(maxSeenActive, activeCount);
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 15));
      activeCount--;
      return `result-${task.id}`;
    });

    expect(maxSeenActive).toBeLessThanOrEqual(maxConcurrency);
    expect(graph.getStatus()).toBe("completed");
    expect(graph.getAllTasks().every((t) => t.status === "completed")).toBe(true);
  });

  it("schedules higher priority tasks before lower priority tasks", async () => {
    const scheduler = new Scheduler({ maxConcurrency: 1 });
    const graph = new ExecutionGraph();
    graph.addTask({ id: "low", kind: "tool", title: "Low", dependencies: [], status: "ready", priority: 1, input: {} });
    graph.addTask({ id: "high", kind: "tool", title: "High", dependencies: [], status: "ready", priority: 10, input: {} });
    graph.addTask({ id: "mid", kind: "tool", title: "Mid", dependencies: [], status: "ready", priority: 5, input: {} });

    const executionOrder: string[] = [];
    await scheduler.runGraph(graph, async (task) => {
      executionOrder.push(task.id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return task.id;
    });

    expect(executionOrder).toEqual(["high", "mid", "low"]);
  });
});

describe("BudgetTracker", () => {
  it("meters tool calls and halts when tool budget is exhausted", () => {
    const budget = new BudgetTracker({ maxToolCalls: 2 });
    expect(budget.canExecuteTool().allowed).toBe(true);

    budget.recordToolCall();
    expect(budget.canExecuteTool().allowed).toBe(true);

    budget.recordToolCall();
    const check = budget.canExecuteTool();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Tool call limit (2) reached");
  });

  it("meters token usage and accumulates estimated cost", () => {
    const budget = new BudgetTracker({ maxTokens: 1000 });
    budget.recordTokens("qwen3.8-max", { input: 100, output: 200, total: 300 });

    const usage = budget.getUsage();
    expect(usage.tokens.input).toBe(100);
    expect(usage.tokens.output).toBe(200);
    expect(usage.tokens.total).toBe(300);
    expect(usage.costUsd).toBeGreaterThan(0);

    // Over token limit
    budget.recordTokens("qwen3.8-max", { input: 500, output: 500, total: 1000 });
    const check = budget.canExecuteStep();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Max token limit");
  });

  it("enforces max step limits", () => {
    const budget = new BudgetTracker({ maxSteps: 2 });
    budget.recordStep();
    expect(budget.canExecuteStep().allowed).toBe(true);
    budget.recordStep();
    expect(budget.canExecuteStep().allowed).toBe(false);
  });
});

describe("Retries & Cancellation", () => {
  it("detects transient errors", () => {
    expect(isTransientError(new Error("fetch failed: 503 Service Unavailable"))).toBe(true);
    expect(isTransientError(new Error("Rate limit 429"))).toBe(true);
    expect(isTransientError(new Error("socket hang up"))).toBe(true);
    expect(isTransientError(new Error("Invalid JSON arguments"))).toBe(false);
  });

  it("retries transient failures and succeeds on subsequent attempt", async () => {
    let attempts = 0;
    const retryPolicy = { maxRetries: 3, initialDelayMs: 5, maxDelayMs: 20, backoffFactor: 2 };

    const result = await executeWithRetry(
      async (attempt) => {
        attempts = attempt;
        if (attempt < 2) {
          throw new Error("503 Service Unavailable");
        }
        return "success";
      },
      retryPolicy
    );

    expect(result).toBe("success");
    expect(attempts).toBe(2);
  });

  it("does not retry non-transient errors", async () => {
    let attempts = 0;
    const retryPolicy = { maxRetries: 3, initialDelayMs: 5, maxDelayMs: 20, backoffFactor: 2 };

    await expect(
      executeWithRetry(
        async (attempt) => {
          attempts = attempt;
          throw new Error("Syntax error in prompt");
        },
        retryPolicy
      )
    ).rejects.toThrow("Syntax error in prompt");

    expect(attempts).toBe(0);
  });

  it("propagates cancellation via CancellationController", async () => {
    const controller = new CancellationController();
    expect(controller.aborted).toBe(false);

    controller.abort("User cancelled");
    expect(controller.aborted).toBe(true);
    expect(controller.reason).toBe("User cancelled");
    expect(controller.signal.aborted).toBe(true);
  });

  it("aborts scheduler execution when cancelled", async () => {
    const cancellation = new CancellationController();
    const scheduler = new Scheduler({ maxConcurrency: 1, cancellation });

    const graph = new ExecutionGraph();
    graph.addTask({ id: "t1", kind: "reason", title: "Task 1", dependencies: [], status: "ready", input: {} });
    graph.addTask({ id: "t2", kind: "reason", title: "Task 2", dependencies: ["t1"], status: "pending", input: {} });

    const promise = scheduler.runGraph(graph, async (task) => {
      if (task.id === "t1") {
        cancellation.abort("Stop now");
      }
      return "done";
    });

    await promise;
    expect(graph.getStatus()).toBe("cancelled");
    expect(graph.getTask("t2")?.status).toBe("cancelled");
  });
});

describe("Model Routing (Strictly NO Claude)", () => {
  const dummyContext: OrchestratorContext = {
    userId: 1,
    tier: "pro",
    isThinking: true,
  };

  it("routes planning to plannerRoute (non-Claude default gemini-3.8-flash)", () => {
    const route = selectRouteForTask({ id: "p", kind: "plan", title: "Plan", dependencies: [], status: "ready", input: {} }, dummyContext);
    expect(route.model).not.toMatch(/claude/i);
    expect(route.provider).not.toMatch(/anthropic/i);
    expect(route.model).toBe("gemini-3.8-flash");
  });

  it("routes verification to verifyRoute (non-Claude default gemini-3.8-flash)", () => {
    const route = selectRouteForTask({ id: "v", kind: "verify", title: "Verify", dependencies: [], status: "ready", input: {} }, dummyContext);
    expect(route.model).not.toMatch(/claude/i);
    expect(route.model).toBe("gemini-3.8-flash");
  });

  it("routes synthesis to reportRoute (non-Claude default qwen3.8-max)", () => {
    const route = selectRouteForTask({ id: "s", kind: "synthesis", title: "Synth", dependencies: [], status: "ready", input: {} }, dummyContext);
    expect(route.model).not.toMatch(/claude/i);
    expect(route.model).toBe("qwen3.8-max");
  });

  it("strictly throws if Claude is requested as an override", () => {
    expect(() => {
      selectRouteForTask(
        { id: "c", kind: "reason", title: "Custom", dependencies: [], status: "ready", input: {}, model: "claude-3-5-sonnet" },
        dummyContext
      );
    }).toThrow(/Claude models are strictly disabled/);
  });
});

describe("Tool Routing & Safety", () => {
  it("blocks dangerous tools (trash, purge, delete) per invariant G1", async () => {
    const res = await executeOrchestratorTool(1, "trash", { path: "important.txt" });
    expect(res.output).toHaveProperty("success", false);
    expect(res.error).toContain("forbidden by safety policy");
  });

  it("blocks tools not in the allowedTools list", async () => {
    const res = await executeOrchestratorTool(1, "run_code", { code: "1+1" }, ["web_search", "browse"]);
    expect(res.output).toHaveProperty("success", false);
    expect(res.error).toContain("not permitted in this run");
  });
});

describe("Observable Events", () => {
  it("emits lifecycle events and produces compatible ActivityEvent entries", () => {
    const events = new OrchestratorEventEmitter();
    const receivedEvents: string[] = [];
    const activities: any[] = [];

    events.on("graph:start", () => receivedEvents.push("graph:start"));
    events.on("task:start", (t) => receivedEvents.push(`task:start:${t.id}`));
    events.on("task:completed", (t) => receivedEvents.push(`task:completed:${t.id}`));
    events.on("activity", (a) => activities.push(a));

    const task: TaskNode = {
      id: "tool-task-1",
      kind: "tool",
      title: "Web Search",
      toolName: "web_search",
      toolArgs: { query: "vitest testing" },
      dependencies: [],
      status: "running",
      input: {},
    };

    events.emitTaskStart(task);
    events.emitTaskCompleted(task, { success: true });

    expect(receivedEvents).toEqual(["task:start:tool-task-1", "task:completed:tool-task-1"]);
    expect(activities).toHaveLength(2);
    expect(activities[0].status).toBe("running");
    expect(activities[0].kind).toBe("search");
    expect(activities[1].status).toBe("done");
  });
});

describe("TaskPlanner", () => {
  it("creates a complete research graph with subagents, verify, and synthesis", async () => {
    const planner = new TaskPlanner({ maxSubAgents: 2, enableVerification: true });
    const context: OrchestratorContext = { userId: 1, tier: "pro", isThinking: true };

    const graph = await planner.planResearchGraph(
      "Compare solar and wind energy costs in 2026",
      context
    );

    graph.validate();
    const tasks = graph.getAllTasks();
    expect(tasks.some((t) => t.kind === "plan")).toBe(true);
    expect(tasks.some((t) => t.kind === "subagent")).toBe(true);
    expect(tasks.some((t) => t.kind === "verify")).toBe(true);
    expect(tasks.some((t) => t.kind === "synthesis")).toBe(true);

    const synth = tasks.find((t) => t.kind === "synthesis")!;
    expect(synth.dependencies).toContain("verify-1");
  });
});

describe("OrchestratorRuntime End-to-End", () => {
  it("executes a complete research graph with parallel subagents and synthesis", async () => {
    const context: OrchestratorContext = {
      userId: 7,
      userName: "Tester",
      tier: "pro",
      isThinking: true,
    };

    const planner = new TaskPlanner({ maxSubAgents: 2, enableVerification: false });
    const graph = await planner.planResearchGraph("Analyze market trends", context);

    const mockSubRunner = vi.fn(async (query: string) => ({
      response: `Findings for ${query}`,
      sources: [{ id: 1, url: "https://example.com/trend", title: "Trend Report" }],
      toolCalls: [],
      tokensUsed: { input: 10, output: 15, total: 25 },
      modelsUsed: ["qwen3.8-max"],
      durationMs: 10,
    }));

    const mockLLMCaller = vi.fn(async ({ purpose }) => {
      if (purpose === "synthesis") {
        return {
          content: "Comprehensive synthesis with facts [1].",
          usage: { input: 40, output: 20, total: 60 },
        };
      }
      return { content: "Default response", usage: { input: 5, output: 5, total: 10 } };
    });

    const runtime = new OrchestratorRuntime({
      context,
      subAgentRunner: mockSubRunner,
      llmCaller: mockLLMCaller,
      maxConcurrency: 2,
    });

    const result = await runtime.execute(graph);

    expect(result.isError).toBe(false);
    expect(result.response).toContain("Comprehensive synthesis with facts");
    expect(result.response).toContain("Sources:\n[1] Trend Report: https://example.com/trend");
    expect(result.sources).toHaveLength(1);
    expect(result.tokensUsed.total).toBeGreaterThan(0);
    expect(result.isAgentic).toBe(true);
    expect(mockSubRunner).toHaveBeenCalledTimes(2);
    expect(mockLLMCaller).toHaveBeenCalledTimes(1);
  });
});
