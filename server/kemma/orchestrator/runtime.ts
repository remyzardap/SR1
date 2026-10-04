/**
 * server/kemma/orchestrator/runtime.ts
 * Orchestrator Runtime for Kemma.
 *
 * Coordinates:
 * - ExecutionGraph
 * - Scheduler (concurrency management)
 * - BudgetTracker (tokens, steps, tools, spend)
 * - CancellationController & Retries
 * - Model & Tool Routers (NO Claude)
 * - OrchestratorEventEmitter
 */

import { ExecutionGraph } from "./graph";
import { Scheduler } from "./scheduler";
import { BudgetTracker } from "./budget";
import { CancellationController } from "./cancellation";
import { OrchestratorEventEmitter } from "./events";
import { selectRouteForTask } from "./modelRouter";
import { executeOrchestratorTool } from "./toolRouter";
import { executeWithRetry, DEFAULT_RETRY_POLICY } from "./retries";
import type {
  TaskNode,
  OrchestratorContext,
  OrchestratorResult,
  BudgetConfig,
} from "./types";
import type { Source } from "../sources";
import { dedupeSources, appendCitations, keepCitedSources, verifyClaimsAgainstSources } from "../sources";
import type { ToolExecution, EngineInput, EngineOutput } from "../engine";

export interface OrchestratorRuntimeOptions {
  context: OrchestratorContext;
  budgetConfig?: BudgetConfig;
  events?: OrchestratorEventEmitter;
  maxConcurrency?: number;
  timeoutMs?: number;
  /** Custom LLM caller function; defaults to callLLM if not supplied */
  llmCaller?: (options: any) => Promise<any>;
  /** Subagent runner; defaults to executing a sub-kemma run */
  subAgentRunner?: (query: string, budget: number) => Promise<{
    response: string;
    sources: Source[];
    toolCalls: ToolExecution[];
    tokensUsed: { input: number; output: number; total: number };
    modelsUsed: string[];
    durationMs: number;
  }>;
}

export class OrchestratorRuntime {
  private context: OrchestratorContext;
  private budget: BudgetTracker;
  private events: OrchestratorEventEmitter;
  private cancellation: CancellationController;
  private scheduler: Scheduler;
  private llmCaller?: (options: any) => Promise<any>;
  private subAgentRunner?: (query: string, budget: number) => Promise<any>;

  private collectedToolCalls: ToolExecution[] = [];
  private collectedSources: Source[] = [];
  private modelsUsed = new Set<string>();
  private finalResponse = "";

  constructor(options: OrchestratorRuntimeOptions) {
    this.context = options.context;
    this.budget = new BudgetTracker(options.budgetConfig);
    this.events = options.events ?? new OrchestratorEventEmitter();
    this.cancellation = new CancellationController(options.context.signal, options.timeoutMs);
    this.scheduler = new Scheduler({
      maxConcurrency: options.maxConcurrency,
      events: this.events,
      cancellation: this.cancellation,
    });
    this.llmCaller = options.llmCaller;
    this.subAgentRunner = options.subAgentRunner;
  }

  public getEventEmitter(): OrchestratorEventEmitter {
    return this.events;
  }

  public getCancellation(): CancellationController {
    return this.cancellation;
  }

  public getBudget(): BudgetTracker {
    return this.budget;
  }

  /**
   * Executes the given ExecutionGraph.
   */
  public async execute(graph: ExecutionGraph): Promise<OrchestratorResult> {
    const startTime = Date.now();

    try {
      await this.scheduler.runGraph(graph, async (task: TaskNode) => {
        return this.executeTask(task, graph);
      });

      // Assemble final result
      const allTasks = graph.getAllTasks();
      const synthesisTask = allTasks.find((t) => t.kind === "synthesis" && t.status === "completed");
      const reasonTask = allTasks.find((t) => t.kind === "reason" && t.status === "completed");

      if (synthesisTask && synthesisTask.output) {
        this.finalResponse = typeof synthesisTask.output === "string"
          ? synthesisTask.output
          : (synthesisTask.output as { content?: string })?.content ?? "";
      } else if (reasonTask && reasonTask.output) {
        this.finalResponse = typeof reasonTask.output === "string"
          ? reasonTask.output
          : (reasonTask.output as { content?: string })?.content ?? "";
      } else if (!this.finalResponse) {
        // Fallback: pick any completed task output
        const completed = allTasks.filter((t) => t.status === "completed" && t.output);
        const last = completed[completed.length - 1];
        if (last) {
          this.finalResponse = typeof last.output === "string" ? last.output : JSON.stringify(last.output);
        }
      }

      // Process citations and sources
      let sources = dedupeSources(this.collectedSources);
      if (sources.length > 0 && this.finalResponse) {
        const kept = keepCitedSources(this.finalResponse, sources);
        sources = kept.sources;
        const cited = appendCitations(kept.text, sources);
        this.finalResponse = cited.text;
      }

      const usage = this.budget.getUsage();
      const isAgentic = this.collectedToolCalls.length >= 2 || allTasks.filter((t) => t.kind === "subagent").length > 0;
      const isFailed = graph.getStatus() === "failed" || graph.getStatus() === "cancelled";

      return {
        response: this.finalResponse || (isFailed ? "Kemma encountered an error or was cancelled." : "Completed."),
        graph: graph.snapshot(usage),
        toolCalls: this.collectedToolCalls,
        sources,
        tokensUsed: usage.tokens,
        modelsUsed: Array.from(this.modelsUsed),
        stepsUsed: usage.steps,
        durationMs: Date.now() - startTime,
        isAgentic,
        isError: isFailed,
      };
    } finally {
      this.cancellation.dispose();
    }
  }

  /**
   * Internal dispatcher for each task node.
   */
  private async executeTask(task: TaskNode, graph: ExecutionGraph): Promise<unknown> {
    const taskStart = Date.now();
    this.budget.recordStep();

    // Check step budget
    const budgetCheck = this.budget.canExecuteStep();
    if (!budgetCheck.allowed) {
      this.events.emitBudgetExhausted(budgetCheck.reason!);
      throw new Error(`Execution halted: ${budgetCheck.reason}`);
    }

    const policy = task.retryPolicy ?? DEFAULT_RETRY_POLICY;

    return executeWithRetry(
      async (_attempt) => {
        switch (task.kind) {
          case "plan":
            return this.executePlanTask(task);

          case "tool":
            return this.executeToolTask(task);

          case "subagent":
            return this.executeSubAgentTask(task);

          case "verify":
            return this.executeVerifyTask(task, graph);

          case "synthesis":
            return this.executeSynthesisTask(task, graph);

          case "reason":
            return this.executeReasonTask(task);

          case "custom":
            if (typeof task.input === "function") {
              return task.input(this.context, graph);
            }
            return task.input;

          default:
            throw new Error(`Unsupported task kind: ${task.kind}`);
        }
      },
      policy,
      this.cancellation.signal,
      (attempt, err, delayMs) => {
        this.events.emitTaskRetry(task, attempt, err, delayMs);
      }
    );
  }

  private async executePlanTask(task: TaskNode): Promise<unknown> {
    // If output is already set by planner, return it
    if (task.output) return task.output;
    return task.input;
  }

  private async executeToolTask(task: TaskNode): Promise<unknown> {
    const toolCheck = this.budget.canExecuteTool();
    if (!toolCheck.allowed) {
      this.events.emitBudgetExhausted(toolCheck.reason!);
      throw new Error(`Tool execution halted: ${toolCheck.reason}`);
    }

    const toolName = task.toolName || task.input?.tool;
    const toolArgs = task.toolArgs ?? task.input?.args ?? {};

    this.budget.recordToolCall();
    this.events.emitToolStart(task, toolName, toolArgs);

    const result = await executeOrchestratorTool(
      this.context.userId,
      toolName,
      toolArgs,
      this.context.allowedTools
    );

    this.events.emitToolEnd(task, toolName, result.output, result.durationMs);

    this.collectedToolCalls.push({
      tool: toolName,
      input: toolArgs,
      output: result.output,
      step: this.budget.getUsage().steps,
      durationMs: result.durationMs,
    });

    if (result.sources.length > 0) {
      this.collectedSources.push(...result.sources);
      this.events.emitSourcesDiscovered(result.sources);
    }

    if (result.error) {
      throw new Error(result.error);
    }

    return result.output;
  }

  private async executeSubAgentTask(task: TaskNode): Promise<unknown> {
    const query = typeof task.input === "string" ? task.input : task.input?.query;
    if (!query) throw new Error("Subagent query is missing");

    const route = selectRouteForTask(task, this.context);
    this.modelsUsed.add(route.label);
    this.events.emitModelRoute(task, route.label, "subagent");

    if (this.subAgentRunner) {
      const budget = Math.max(2, this.budget.remainingToolCalls());
      const subResult = await this.subAgentRunner(query, budget);

      this.collectedSources.push(...subResult.sources);
      this.collectedToolCalls.push(...subResult.toolCalls);
      for (const m of subResult.modelsUsed) this.modelsUsed.add(m);

      this.budget.recordTokens(route.model, subResult.tokensUsed);
      this.events.emitSourcesDiscovered(subResult.sources);

      return {
        query,
        response: subResult.response,
        sources: subResult.sources,
      };
    }

    // Default LLM subagent call if subAgentRunner not provided
    if (this.llmCaller) {
      const res = await this.llmCaller({
        route,
        systemPrompt: "You are a research sub-agent. Investigate the question thoroughly, citing evidence.",
        messages: [{ role: "user", content: query }],
        stream: false,
        userId: this.context.userId,
        sessionId: this.context.sessionId,
        reportId: this.context.reportId,
        purpose: "subagent",
      });

      if (res.usage) {
        this.budget.recordTokens(route.model, res.usage);
      }

      return {
        query,
        response: res.content ?? "",
        sources: [],
      };
    }

    return { query, response: `Research completed for: ${query}`, sources: [] };
  }

  private async executeVerifyTask(task: TaskNode, graph: ExecutionGraph): Promise<unknown> {
    const depOutputs = graph.getDependencyOutputs(task.id);
    const subAgentTexts: string[] = [];

    for (const val of Object.values(depOutputs)) {
      if (val && typeof val === "object" && "response" in val) {
        subAgentTexts.push((val as { response: string }).response);
      } else if (typeof val === "string") {
        subAgentTexts.push(val);
      }
    }

    const route = selectRouteForTask(task, this.context);
    this.modelsUsed.add(route.label);
    this.events.emitModelRoute(task, route.label, "verify");

    const allSources = dedupeSources(this.collectedSources);
    if (allSources.length === 0 || subAgentTexts.length === 0 || !this.llmCaller) {
      return { verifiedSources: allSources };
    }

    const textToVerify = subAgentTexts.join("\n\n");
    const claims = textToVerify
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20 && (p.includes("$") || /\d{4}|percent|growth|rate|score/i.test(p)))
      .slice(0, 10);

    if (claims.length === 0) return { verifiedSources: allSources };

    const verified = await verifyClaimsAgainstSources(claims, allSources, async (prompt) => {
      const res = await this.llmCaller!({
        route,
        systemPrompt: "You verify citations. Reply with JSON only.",
        messages: [{ role: "user", content: prompt }],
        stream: false,
        userId: this.context.userId,
        sessionId: this.context.sessionId,
        reportId: this.context.reportId,
        purpose: "verify",
      });
      if (res.usage) this.budget.recordTokens(route.model, res.usage);
      return res.content ?? "[]";
    });

    this.collectedSources = verified;
    return { verifiedSources: verified };
  }

  private async executeSynthesisTask(task: TaskNode, graph: ExecutionGraph): Promise<unknown> {
    const depOutputs = graph.getDependencyOutputs(task.id);
    const originalQuery = task.input?.originalQuery || "";

    const subSections: string[] = [];
    for (const [depId, val] of Object.entries(depOutputs)) {
      if (val && typeof val === "object" && "query" in val && "response" in val) {
        const item = val as { query: string; response: string };
        subSections.push(`### Research Area: ${item.query}\n${item.response}`);
      } else if (typeof val === "string") {
        subSections.push(`### Finding (${depId}):\n${val}`);
      }
    }

    const sources = dedupeSources(this.collectedSources);
    const prompt = [
      "Synthesize the following research findings into a cohesive, comprehensive, well-structured answer.",
      "Preserve factual statements and cite sources using [n] brackets matching the numbered source list below.",
      "",
      `Original Question: ${originalQuery}`,
      "",
      subSections.join("\n\n"),
      "",
      "Sources:",
      sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`).join("\n"),
    ].join("\n");

    const route = selectRouteForTask(task, this.context);
    this.modelsUsed.add(route.label);
    this.events.emitModelRoute(task, route.label, "synthesis");

    const basePrompt = "You synthesize multi-source research into an expert final answer with [n] source citations.";
    const systemPrompt = this.context.isVoice ? basePrompt + "\\n\\n## Voice mode\\n- Maximum 2-3 sentences per response\\n- No bullet points, no markdown, no headers\\n- Expand abbreviations\\n- Speak naturally" : basePrompt;

    if (this.llmCaller) {
      const res = await this.llmCaller({
        route,
        systemPrompt,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        onStream: (chunk: string) => {
          this.events.emitTokenStream(chunk);
        },
        userId: this.context.userId,
        sessionId: this.context.sessionId,
        reportId: this.context.reportId,
        purpose: "synthesis",
      });

      if (res.usage) {
        this.budget.recordTokens(route.model, res.usage);
      }

      this.finalResponse = res.content ?? "";
      return this.finalResponse;
    }

    this.finalResponse = `Synthesized report based on ${subSections.length} findings.`;
    return this.finalResponse;
  }

  private async executeReasonTask(task: TaskNode): Promise<unknown> {
    const query = task.input?.query || "";
    const route = selectRouteForTask(task, this.context);
    this.modelsUsed.add(route.label);
    this.events.emitModelRoute(task, route.label, "reason");

    const basePrompt = "You are Kemma, an intelligent AI assistant. Answer helpfully and concisely.";
    const systemPrompt = this.context.isVoice ? basePrompt + "\\n\\n## Voice mode\\n- Maximum 2-3 sentences per response\\n- No bullet points, no markdown, no headers\\n- Expand abbreviations\\n- Speak naturally" : basePrompt;

    if (this.llmCaller) {
      const res = await this.llmCaller({
        route,
        systemPrompt,
        messages: [{ role: "user", content: query }],
        stream: true,
        onStream: (chunk: string) => {
          this.events.emitTokenStream(chunk);
        },
        userId: this.context.userId,
        sessionId: this.context.sessionId,
        reportId: this.context.reportId,
        purpose: "chat",
      });

      if (res.usage) {
        this.budget.recordTokens(route.model, res.usage);
      }

      this.finalResponse = res.content ?? "";
      return this.finalResponse;
    }

    this.finalResponse = `Answer to: ${query}`;
    return this.finalResponse;
  }
}
