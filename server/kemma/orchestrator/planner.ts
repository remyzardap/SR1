/**
 * server/kemma/orchestrator/planner.ts
 * Planner for Kemma Orchestrator.
 *
 * Decomposes complex user requests into an ExecutionGraph with:
 * - Sub-question research / subagents
 * - Verification task (enforces verify ≠ writer, NO Claude)
 * - Synthesis task to weave findings with citations
 *
 * Supports LLM-based planning (via non-Claude plannerRoute()) with
 * graceful fallback to heuristic planning if LLM planning fails or is disabled.
 */

import { ExecutionGraph } from "./graph";
import type { TaskNode, OrchestratorContext } from "./types";
import { plannerRoute, routeHasAuth } from "../../core/kemmaRouter";

export interface PlannerOptions {
  maxSubAgents?: number;
  enableVerification?: boolean;
}

export class TaskPlanner {
  private maxSubAgents: number;
  private enableVerification: boolean;

  constructor(options: PlannerOptions = {}) {
    const rawMax = Number(process.env.KEMMA_MAX_SUBAGENTS ?? "3");
    this.maxSubAgents = options.maxSubAgents ?? Math.min(Math.max(Number.isFinite(rawMax) ? rawMax : 3, 1), 5);
    this.enableVerification = options.enableVerification ?? true;
  }

  /**
   * Builds an execution graph for a complex research request.
   * Can use LLM planning or fallback to heuristic decomposition.
   */
  public async planResearchGraph(
    query: string,
    context: OrchestratorContext,
    llmCall?: (prompt: string) => Promise<string>
  ): Promise<ExecutionGraph> {
    let subQueries: string[] = [];

    // Attempt LLM-based planning if caller provided llmCall or auth is available
    if (llmCall) {
      try {
        const planText = await llmCall(
          `You are a research planner. Break the user's question into at most ${this.maxSubAgents} distinct, focused sub-questions for research. Reply with a JSON array of strings only:\n\nUser Question: "${query}"`
        );
        const cleaned = planText.replace(/```json\n?|```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          subQueries = parsed
            .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
            .map((q) => q.trim())
            .slice(0, this.maxSubAgents);
        }
      } catch {
        // Fallback to heuristic decomposition
      }
    }

    if (subQueries.length === 0) {
      subQueries = this.heuristicDecompose(query);
    }

    const graph = new ExecutionGraph();

    // 1. Planner Node (records the plan)
    const planNode: TaskNode = {
      id: "plan-1",
      kind: "plan",
      title: "Plan Research Strategy",
      dependencies: [],
      status: "ready",
      priority: 10,
      input: { query, subQueries },
      output: { subQueries },
    };
    graph.addTask(planNode);

    // 2. Parallel Sub-Agent Nodes (one per subQuery)
    const subAgentIds: string[] = [];
    subQueries.forEach((subQuery, index) => {
      const id = `subagent-${index + 1}`;
      subAgentIds.push(id);
      const subagentNode: TaskNode = {
        id,
        kind: "subagent",
        title: `Research: ${subQuery.slice(0, 50)}`,
        dependencies: ["plan-1"],
        status: "pending",
        priority: 5,
        input: { query: subQuery, parentQuery: query },
      };
      graph.addTask(subagentNode);
    });

    // 3. Optional Verification Node (depends on all subagents)
    let finalDepIds = subAgentIds;
    if (this.enableVerification) {
      const verifyNode: TaskNode = {
        id: "verify-1",
        kind: "verify",
        title: "Verify Source Citations",
        dependencies: [...subAgentIds],
        status: "pending",
        priority: 3,
        input: { originalQuery: query },
      };
      graph.addTask(verifyNode);
      finalDepIds = ["verify-1"];
    }

    // 4. Synthesis Node (depends on verification and subagents)
    const synthesisNode: TaskNode = {
      id: "synthesis-1",
      kind: "synthesis",
      title: "Synthesize Final Report",
      dependencies: Array.from(new Set([...finalDepIds, ...subAgentIds])),
      status: "pending",
      priority: 1,
      input: { originalQuery: query },
    };
    graph.addTask(synthesisNode);

    graph.validate();
    return graph;
  }

  /**
   * Builds a simple single-turn or single-agent graph.
   */
  public planStandardGraph(query: string): ExecutionGraph {
    const graph = new ExecutionGraph();
    graph.addTask({
      id: "reason-1",
      kind: "reason",
      title: "Direct Answer",
      dependencies: [],
      status: "ready",
      priority: 1,
      input: { query },
    });
    graph.validate();
    return graph;
  }

  private heuristicDecompose(query: string): string[] {
    const trimmed = query.trim();
    if (trimmed.length < 20) return [trimmed];

    // Simple heuristic split for complex queries
    const sentences = trimmed.split(/[.?!]\s+/).filter((s) => s.length > 5);
    if (sentences.length > 1) {
      return sentences.slice(0, this.maxSubAgents);
    }

    return [
      `Overview and background: ${trimmed}`,
      `Details, data and current status: ${trimmed}`,
    ].slice(0, this.maxSubAgents);
  }
}
