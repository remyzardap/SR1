/**
 * server/kemma/orchestrator/modelRouter.ts
 * Model routing for the Kemma Orchestrator.
 *
 * Mandate: NEVER use Claude models.
 * Supported: Qwen, Gemini (AI Studio or Vertex), Perplexity, and LiteLLM gateway.
 * Telegram-only Venice routing remains isolated in the Telegram lane.
 *
 * Maps task kinds and priorities to optimal routes:
 * - plan: plannerRoute() -> gemini-3.8-flash (or qwen3.8-max)
 * - verify: verifyRoute() -> gemini-3.8-flash
 * - reason: chatRoute() or proRoute()
 * - subagent: chatRoute() or reportRoute()
 * - synthesis: reportRoute() -> qwen3.8-max
 */

import {
  chatRoute,
  reportRoute,
  longDocRoute,
  plannerRoute,
  verifyRoute,
  proRoute,
  visionRoute,
  routeFor,
  type RouteConfig,
} from "../../core/kemmaRouter";
import type { TaskNode, TaskKind, OrchestratorContext } from "./types";

export function selectRouteForTask(task: TaskNode, context: OrchestratorContext): RouteConfig {
  // Manual override specified on the task or globally
  const override = task.model || context.modelOverride;
  if (override && override !== "auto") {
    // Safety check: ensure Claude is never used
    if (/claude|anthropic/i.test(override)) {
      throw new Error("Claude models are strictly disabled in this orchestrator.");
    }
    try {
      const customRoute = routeFor(override);
      if (/claude|anthropic/i.test(customRoute.model) || /claude|anthropic/i.test(customRoute.provider)) {
        throw new Error("Claude models are strictly disabled in this orchestrator.");
      }
      return customRoute;
    } catch (err) {
      if (err instanceof Error && err.message.includes("Claude")) throw err;
      // Fall through to kind-based routing
    }
  }

  // Kind-based routing
  switch (task.kind) {
    case "plan": {
      const cfg = plannerRoute();
      assertNonClaude(cfg);
      return cfg;
    }

    case "verify": {
      const cfg = verifyRoute();
      assertNonClaude(cfg);
      return cfg;
    }

    case "synthesis": {
      const cfg = reportRoute();
      assertNonClaude(cfg);
      return cfg;
    }

    case "subagent": {
      const cfg = context.isThinking ? reportRoute() : chatRoute();
      assertNonClaude(cfg);
      return cfg;
    }

    case "reason": {
      if (context.isThinking && (context.tier === "pro" || context.tier === "max")) {
        const pro = proRoute();
        if (pro) {
          assertNonClaude(pro);
          return pro;
        }
      }
      const cfg = chatRoute();
      assertNonClaude(cfg);
      return cfg;
    }

    default: {
      const cfg = chatRoute();
      assertNonClaude(cfg);
      return cfg;
    }
  }
}

function assertNonClaude(route: RouteConfig): void {
  if (
    /claude|anthropic/i.test(route.model) ||
    /claude|anthropic/i.test(route.provider) ||
    /claude|anthropic/i.test(route.label)
  ) {
    throw new Error("Claude models are strictly disabled in this orchestrator.");
  }
}
