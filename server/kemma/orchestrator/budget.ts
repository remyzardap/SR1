/**
 * server/kemma/orchestrator/budget.ts
 * Budget tracker and enforcement for orchestrator runs.
 *
 * Tracks:
 * - Tool call counts against maxToolCalls
 * - Token counts (input, output, total, cached)
 * - Execution steps against maxSteps
 * - Elapsed duration against maxDurationMs
 * - Estimated cost in USD against maxCostUsd using router pricing
 */

import type { BudgetConfig, BudgetUsage } from "./types";
import { estimateCostUsd } from "../../core/kemmaRouter";

export class BudgetExhaustedError extends Error {
  public readonly reason: string;
  constructor(reason: string) {
    super(`Budget exhausted: ${reason}`);
    this.name = "BudgetExhaustedError";
    this.reason = reason;
  }
}

export class BudgetTracker {
  private config: BudgetConfig;
  private toolCalls = 0;
  private tokens = { input: 0, output: 0, total: 0, cachedInput: 0 };
  private steps = 0;
  private startedAt = Date.now();
  private totalCostUsd = 0;

  constructor(config: BudgetConfig = {}) {
    this.config = {
      maxToolCalls: config.maxToolCalls ?? 60,
      maxTokens: config.maxTokens,
      maxSteps: config.maxSteps ?? 30,
      maxDurationMs: config.maxDurationMs ?? 300_000, // 5 min default
      maxCostUsd: config.maxCostUsd,
    };
  }

  public getUsage(): BudgetUsage {
    return {
      toolCalls: this.toolCalls,
      tokens: { ...this.tokens },
      steps: this.steps,
      durationMs: Date.now() - this.startedAt,
      costUsd: this.totalCostUsd,
    };
  }

  public getConfig(): BudgetConfig {
    return { ...this.config };
  }

  public canExecuteStep(): { allowed: boolean; reason?: string } {
    if (this.config.maxSteps !== undefined && this.steps >= this.config.maxSteps) {
      return { allowed: false, reason: `Max steps (${this.config.maxSteps}) reached` };
    }
    if (this.config.maxDurationMs !== undefined && (Date.now() - this.startedAt) >= this.config.maxDurationMs) {
      return { allowed: false, reason: `Max duration (${Math.round(this.config.maxDurationMs / 1000)}s) reached` };
    }
    if (this.config.maxTokens !== undefined && this.tokens.total >= this.config.maxTokens) {
      return { allowed: false, reason: `Max token limit (${this.config.maxTokens}) reached` };
    }
    if (this.config.maxCostUsd !== undefined && this.totalCostUsd >= this.config.maxCostUsd) {
      return { allowed: false, reason: `Max spend cap ($${this.config.maxCostUsd.toFixed(2)}) reached` };
    }
    return { allowed: true };
  }

  public canExecuteTool(): { allowed: boolean; reason?: string } {
    const stepCheck = this.canExecuteStep();
    if (!stepCheck.allowed) return stepCheck;

    if (this.config.maxToolCalls !== undefined && this.toolCalls >= this.config.maxToolCalls) {
      return { allowed: false, reason: `Tool call limit (${this.config.maxToolCalls}) reached` };
    }
    return { allowed: true };
  }

  public recordStep(): void {
    this.steps++;
  }

  public recordToolCall(): void {
    this.toolCalls++;
  }

  public recordTokens(
    model: string,
    usage: { input: number; output: number; total?: number; cachedInput?: number }
  ): void {
    this.tokens.input += usage.input;
    this.tokens.output += usage.output;
    this.tokens.total += usage.total ?? (usage.input + usage.output);
    if (usage.cachedInput) {
      this.tokens.cachedInput += usage.cachedInput;
    }
    try {
      const estimated = estimateCostUsd(model, usage.input, usage.output);
      this.totalCostUsd += estimated;
    } catch {
      // Cost estimation failure is non-fatal
    }
  }

  public remainingToolCalls(): number {
    if (this.config.maxToolCalls === undefined) return Infinity;
    return Math.max(0, this.config.maxToolCalls - this.toolCalls);
  }
}
