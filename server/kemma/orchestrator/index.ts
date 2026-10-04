/**
 * server/kemma/orchestrator/index.ts
 * Public entrypoint for the Kemma Orchestrator.
 */

export * from "./types";
export * from "./graph";
export * from "./scheduler";
export * from "./budget";
export * from "./retries";
export * from "./cancellation";
export * from "./events";
export * from "./modelRouter";
export * from "./toolRouter";
export * from "./planner";
export * from "./runtime";

import { OrchestratorRuntime } from "./runtime";
import { TaskPlanner } from "./planner";
import { ExecutionGraph } from "./graph";
import { OrchestratorEventEmitter } from "./events";
import type { OrchestratorContext, OrchestratorResult, BudgetConfig } from "./types";
import type { EngineInput, EngineOutput } from "../engine";

export interface RunOrchestratorOptions {
  query: string;
  context: OrchestratorContext;
  budgetConfig?: BudgetConfig;
  events?: OrchestratorEventEmitter;
  llmCaller?: (options: any) => Promise<any>;
  subAgentRunner?: (query: string, budget: number) => Promise<any>;
  maxConcurrency?: number;
  timeoutMs?: number;
  planGraph?: (planner: TaskPlanner) => Promise<ExecutionGraph> | ExecutionGraph;
}

/**
 * High-level orchestration helper that decomposes a query into a graph and executes it.
 */
export async function runOrchestrator(options: RunOrchestratorOptions): Promise<OrchestratorResult> {
  const {
    query,
    context,
    budgetConfig,
    events,
    llmCaller,
    subAgentRunner,
    maxConcurrency,
    timeoutMs,
    planGraph,
  } = options;

  const planner = new TaskPlanner();
  let graph: ExecutionGraph;

  if (planGraph) {
    graph = await planGraph(planner);
  } else if (context.isThinking) {
    // Complex research graph
    graph = await planner.planResearchGraph(query, context, async (prompt) => {
      if (llmCaller) {
        const { plannerRoute } = await import("../../core/kemmaRouter");
        const res = await llmCaller({
          route: plannerRoute(),
          systemPrompt: "You are a research planner. Reply in JSON only.",
          messages: [{ role: "user", content: prompt }],
          stream: false,
          userId: context.userId,
          purpose: "planner",
        });
        return res.content ?? "[]";
      }
      return "[]";
    });
  } else {
    // Standard direct execution graph
    graph = planner.planStandardGraph(query);
  }

  const runtime = new OrchestratorRuntime({
    context,
    budgetConfig,
    events,
    llmCaller,
    subAgentRunner,
    maxConcurrency,
    timeoutMs,
  });

  return runtime.execute(graph);
}
