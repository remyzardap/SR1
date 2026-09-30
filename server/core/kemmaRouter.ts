/**
 * kemmaRouter.ts
 * Env-driven model routing for the Kemma agent.
 *
 * Supported providers: qwen, gemini, perplexity (search only), litellm (OpenAI-compatible gateway).
 * Dropped providers: kimi, anthropic, openai, nvidia.
 *
 * Provider prefix rule: a model id that starts with "litellm/" (case-insensitive) routes to the
 * LiteLLM gateway before any other rule is checked. The prefix is stripped from the model name
 * sent to the gateway; the full prefixed id stays in RouteConfig.label for logs and the picker.
 *
 * Routing slots (all configurable via KEMMA_MODEL_* env vars):
 *   chat/tools/code/file generation -> KEMMA_MODEL_CHAT (default qwen3.8-max)
 *   web search                      -> KEMMA_MODEL_SEARCH (default sonar-pro)
 *   vision/documents                -> KEMMA_MODEL_VISION (default gemini-3.8-flash)
 *   embeddings                      -> KEMMA_MODEL_EMBEDDING (default text-embedding-004)
 *   image generation                -> KEMMA_MODEL_IMAGE (default gemini-3.8-flash)
 *   report writing                  -> KEMMA_MODEL_REPORT (default qwen3.8-max)
 *   long docs/heavy browsing        -> KEMMA_MODEL_LONG_DOC (default qwen3.8-max)
 *   deep-research planner           -> KEMMA_MODEL_PLANNER (default gemini-3.8-flash)
 *   citation verification           -> KEMMA_MODEL_VERIFY (default gemini-3.8-flash)
 *
 * Fallback chain (used by the engine when a primary call fails):
 *   KEMMA_MODEL_CHAT -> KEMMA_MODEL_VISION -> KEMMA_MODEL_FALLBACK (optional, appended last)
 */

export type Tier = "free" | "trial" | "pro" | "max";
export type TaskComplexity = "simple" | "medium" | "complex";
export type ModelProvider = "qwen" | "perplexity" | "gemini" | "litellm";

export interface RouteInput {
  tier: Tier;
  isThinking: boolean;
  isAgentic: boolean;
  taskComplexity: TaskComplexity;
  step?: number;
  maxSteps?: number;
}

export interface RouteConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
  label: string;
  provider: ModelProvider;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENV-DRIVEN DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULTS = {
  KEMMA_MODEL_CHAT: "qwen3.8-max",
  KEMMA_MODEL_SEARCH: "sonar-pro",
  KEMMA_MODEL_VISION: "gemini-3.8-flash",
  KEMMA_MODEL_EMBEDDING: "text-embedding-004",
  KEMMA_MODEL_IMAGE: "gemini-3.8-flash",
  KEMMA_MODEL_REPORT: "qwen3.8-max",
  KEMMA_MODEL_LONG_DOC: "qwen3.8-max",
  KEMMA_MODEL_PLANNER: "gemini-3.8-flash",
  KEMMA_MODEL_VERIFY: "gemini-3.8-flash",
  KEMMA_SEARCH_RPM: "40",
  QWEN_BASE_URL: "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1",
  LITELLM_BASE_URL: "https://api.koboillm.com/v1",
};

const ENDPOINTS: Record<Exclude<ModelProvider, "litellm">, string> = {
  qwen: process.env.QWEN_BASE_URL || DEFAULTS.QWEN_BASE_URL,
  perplexity: "https://api.perplexity.ai",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

// Read at call time so env changes take effect without a restart. Trailing slash trimmed.
export function litellmBaseUrl(): string {
  return (process.env.LITELLM_BASE_URL || DEFAULTS.LITELLM_BASE_URL).replace(/\/+$/, "");
}

function endpointFor(provider: ModelProvider): string {
  return provider === "litellm" ? litellmBaseUrl() : ENDPOINTS[provider];
}

// Very rough per-million-token prices for cost estimation only.
export const ROUGH_PRICES_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "qwen3.8-max": { input: 0.5, output: 1.5 },
  "gemini-3.8-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash-thinking": { input: 0.1, output: 0.4 },
  "text-embedding-004": { input: 0, output: 0 },
  "sonar-pro": { input: 3, output: 15 },
  "sonar": { input: 1, output: 1 },
  "deepseek-ai/deepseek-v3.2-maas": { input: 0.3, output: 1.0 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER / KEY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

const LITELLM_PREFIX = "litellm/";

/** Strips the litellm/ routing prefix (case-insensitive); other ids are returned unchanged. */
export function stripProviderPrefix(model: string): string {
  return model.toLowerCase().startsWith(LITELLM_PREFIX) ? model.slice(LITELLM_PREFIX.length) : model;
}

export function detectProvider(model: string): ModelProvider {
  const lower = model.toLowerCase();
  if (lower.startsWith(LITELLM_PREFIX)) return "litellm";
  if (lower.includes("qwen") || lower.includes("qwq")) return "qwen";
  if (lower.includes("sonar")) return "perplexity";
  if (lower.includes("gemini") || lower.includes("embedding")) return "gemini";
  return "qwen";
}

export function apiKeyFor(provider: ModelProvider): string {
  switch (provider) {
    case "qwen": return process.env.QWEN_API_KEY || "";
    case "perplexity": return process.env.SONAR_API_KEY || process.env.PERPLEXITY_API_KEY || "";
    case "gemini": return process.env.GEMINI_API_KEY || "";
    case "litellm": return process.env.LITELLM_API_KEY || process.env.KOBOILLM_API_KEY || "";
  }
}

export function routeFor(model: string): RouteConfig {
  const provider = detectProvider(model);
  return {
    model: provider === "litellm" ? stripProviderPrefix(model) : model,
    baseUrl: endpointFor(provider),
    apiKey: apiKeyFor(provider),
    label: `${model} (${provider})`,
    provider,
  };
}

function getEnvModel(name: keyof typeof DEFAULTS): string {
  return (process.env[name] || DEFAULTS[name]).trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT ROUTERS
// ═══════════════════════════════════════════════════════════════════════════════

export interface SelectableModel { id: string; label: string; tier: ModelProvider; hasKey: boolean }

export function listSelectableModels(): SelectableModel[] {
  const slots = ["KEMMA_MODEL_CHAT", "KEMMA_MODEL_REPORT", "KEMMA_MODEL_LONG_DOC", "KEMMA_MODEL_VISION"] as const;
  const seen = new Set<string>();
  const out: SelectableModel[] = [];
  for (const slot of slots) {
    const id = getEnvModel(slot);
    if (seen.has(id)) continue;
    seen.add(id);
    const provider = detectProvider(id);
    out.push({ id, label: id, tier: provider, hasKey: !!apiKeyFor(provider) });
  }
  return out;
}

export function chatRoute(): RouteConfig {
  return routeFor(getEnvModel("KEMMA_MODEL_CHAT"));
}

export function searchRoute(): RouteConfig {
  return routeFor(getEnvModel("KEMMA_MODEL_SEARCH"));
}

export function visionRoute(): RouteConfig {
  return routeFor(getEnvModel("KEMMA_MODEL_VISION"));
}

export function embeddingRoute(): { model: string; apiKey: string } {
  const route = routeFor(getEnvModel("KEMMA_MODEL_EMBEDDING"));
  return { model: route.model, apiKey: route.apiKey };
}

export function imageRoute(): RouteConfig {
  return routeFor(getEnvModel("KEMMA_MODEL_IMAGE"));
}

export function reportRoute(): RouteConfig {
  return routeFor(getEnvModel("KEMMA_MODEL_REPORT"));
}

export function longDocRoute(): RouteConfig {
  return routeFor(getEnvModel("KEMMA_MODEL_LONG_DOC"));
}

export function plannerRoute(): RouteConfig {
  return routeFor(getEnvModel("KEMMA_MODEL_PLANNER"));
}

export function verifyRoute(): RouteConfig {
  return routeFor(getEnvModel("KEMMA_MODEL_VERIFY"));
}

// Polish and Nemotron are no longer supported.
export function polishRoute(): RouteConfig | null {
  return null;
}

export function nemotronRoute(): RouteConfig | null {
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK CHAIN
// ═══════════════════════════════════════════════════════════════════════════════

export function fallbackRoutes(): RouteConfig[] {
  const chain = [
    getEnvModel("KEMMA_MODEL_CHAT"),
    getEnvModel("KEMMA_MODEL_VISION"),
  ];
  const globalFallback = (process.env.KEMMA_MODEL_FALLBACK || "").trim();
  if (globalFallback && !chain.includes(globalFallback)) chain.push(globalFallback);
  return chain.map(routeFor);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPEND CAPS
// ═══════════════════════════════════════════════════════════════════════════════

export function monthlySpendCapUsd(_provider: ModelProvider): number {
  // Spend caps are currently disabled for qwen/gemini/perplexity.
  // Re-enable per-provider by reading a KEMMA_CAP_<PROVIDER> env var here.
  return 0;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = ROUGH_PRICES_USD_PER_1M[stripProviderPrefix(model)] || { input: 2, output: 6 };
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

export function kemmaRoute(input: RouteInput): RouteConfig {
  const { isThinking, taskComplexity } = input;

  if (isThinking) {
    return routeFor(process.env.KEMMA_MODEL_PLANNER || DEFAULTS.KEMMA_MODEL_PLANNER);
  }

  if (taskComplexity === "complex") {
    return routeFor(process.env.KEMMA_MODEL_LONG_DOC || DEFAULTS.KEMMA_MODEL_LONG_DOC);
  }

  return chatRoute();
}

export function perplexityRoute(): RouteConfig {
  return searchRoute();
}

export function geminiVisionRoute(): RouteConfig {
  return visionRoute();
}

export function geminiEmbeddingRoute(): { model: string; apiKey: string } {
  return embeddingRoute();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function detectComplexity(messages: { role: string; content: string }[]): TaskComplexity {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "simple";
  const text = lastUser.content.toLowerCase();
  const wordCount = text.split(/\s+/).length;
  const complexSignals = [
    /analyz|research|compar|strateg|architect|design|build|create.*plan/,
    /step.by.step|detail|comprehensive|in.depth|thorough/,
    /multipl|several|all|every|entire|complete/,
    /proposal|report|document|presentation|dashboard/,
  ];
  const simpleSignals = [
    /^(hi|hello|hey|thanks|ok|yes|no|sure)\b/,
    /what.?s|who.?s|when.?s|where.?s/,
    /^(show|list|tell me|give me)\s+\w+\s*\??$/,
  ];
  if (simpleSignals.some((r) => r.test(text)) && wordCount < 10) return "simple";
  if (complexSignals.some((r) => r.test(text)) || wordCount > 40) return "complex";
  return "medium";
}

export const MAX_STEPS: Record<Tier, number> = {
  free: 5, trial: 15, pro: 15, max: 30,
};

export const QUOTA_LIMITS: Record<Tier, {
  msgsPerDay: number; tasksPerMonth: number; thinkPerDay: number; tokensPerDay: number; voiceMinsPerMonth: number;
}> = {
  free:  { msgsPerDay: 20,   tasksPerMonth: 3,   thinkPerDay: 0,  tokensPerDay: 50000,    voiceMinsPerMonth: 0   },
  trial: { msgsPerDay: 200,  tasksPerMonth: 30,  thinkPerDay: 3,  tokensPerDay: 500000,   voiceMinsPerMonth: 60  },
  pro:   { msgsPerDay: 200,  tasksPerMonth: 30,  thinkPerDay: 3,  tokensPerDay: 500000,   voiceMinsPerMonth: 60  },
  max:   { msgsPerDay: 1000, tasksPerMonth: 100, thinkPerDay: 10, tokensPerDay: 2000000,  voiceMinsPerMonth: 300 },
};
