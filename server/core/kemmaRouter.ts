/**
 * kemmaRouter.ts
 * Env-driven model routing for the Kemma agent.
 *
 * Routing slots (all configurable via KEMMA_MODEL_* env vars):
 *   chat/tools/code/file generation -> KEMMA_MODEL_CHAT (default qwen3.8-max)
 *   web search                      -> KEMMA_MODEL_SEARCH (default sonar-pro)
 *   vision/documents                -> KEMMA_MODEL_VISION (default gemini-2.0-flash)
 *   embeddings                      -> KEMMA_MODEL_EMBEDDING (default text-embedding-004)
 *   image generation                -> KEMMA_MODEL_IMAGE (default gemini-2.0-flash)
 *   report writing                  -> KEMMA_MODEL_REPORT (default qwen3.8-max)
 *   long docs/heavy browsing        -> KEMMA_MODEL_LONG_DOC (default kimi-k3)
 *   deep-research planner           -> KEMMA_MODEL_PLANNER (default claude-sonnet-5)
 *   citation verification           -> KEMMA_MODEL_VERIFY (default claude-sonnet-5)
 *   optional final polish           -> KEMMA_MODEL_POLISH via LiteLLM
 *   optional nemotron               -> KEMMA_MODEL_NEMOTRON via NVIDIA
 *
 * Fallback chain (used by the engine when a primary call fails):
 *   qwen3.8-max -> kimi-k3 -> gemini-2.0-flash -> LiteLLM/OpenAI (last resort)
 */

export type Tier = "free" | "trial" | "pro" | "max";
export type TaskComplexity = "simple" | "medium" | "complex";
export type ModelProvider = "qwen" | "kimi" | "anthropic" | "perplexity" | "gemini" | "openai" | "litellm" | "nvidia";

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
  KEMMA_MODEL_LONG_DOC: "kimi-k3",
  KEMMA_MODEL_PLANNER: "claude-sonnet-5",
  KEMMA_MODEL_VERIFY: "claude-sonnet-5",
  KEMMA_MODEL_POLISH: "",
  KEMMA_MODEL_NEMOTRON: "",
  KEMMA_SEARCH_RPM: "40",
  QWEN_BASE_URL: "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1",
  LITELLM_BASE_URL: "https://litellm.koboi2026.biz.id/v1",
};

const ENDPOINTS: Record<ModelProvider, string> = {
  qwen: process.env.QWEN_BASE_URL || DEFAULTS.QWEN_BASE_URL,
  kimi: "https://api.moonshot.cn/v1",
  anthropic: "https://api.anthropic.com/v1",
  perplexity: "https://api.perplexity.ai",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openai: "https://api.openai.com/v1",
  litellm: process.env.LITELLM_BASE_URL || DEFAULTS.LITELLM_BASE_URL,
  nvidia: "https://integrate.api.nvidia.com/v1",
};

// Very rough per-million-token prices for cost estimation only.
export const ROUGH_PRICES_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "qwen3.8-max": { input: 0.5, output: 1.5 },
  "kimi-k3": { input: 2, output: 8 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 15, output: 75 },
  "gemini-3.8-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash-thinking": { input: 0.1, output: 0.4 },
  "text-embedding-004": { input: 0, output: 0 },
  "sonar-pro": { input: 3, output: 15 },
  "sonar": { input: 1, output: 1 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER / KEY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

export function detectProvider(model: string): ModelProvider {
  const lower = model.toLowerCase();
  if (lower.includes("qwen") || lower.includes("qwq")) return "qwen";
  if (lower.includes("kimi")) return "kimi";
  if (lower.includes("claude")) return "anthropic";
  if (lower.includes("sonar")) return "perplexity";
  if (lower.includes("gemini") || lower.includes("embedding")) return "gemini";
  if (lower.includes("gpt") || lower.includes("o1") || lower.includes("o3") || lower.includes("whisper") || lower.includes("dall")) return "openai";
  if (lower.includes("nemotron")) return "nvidia";
  return "litellm";
}

export function apiKeyFor(provider: ModelProvider): string {
  switch (provider) {
    case "qwen": return process.env.QWEN_API_KEY || "";
    case "kimi": return process.env.KIMI_API_KEY || "";
    case "anthropic": return process.env.ANTHROPIC_API_KEY || "";
    case "perplexity": return process.env.SONAR_API_KEY || process.env.PERPLEXITY_API_KEY || "";
    case "gemini": return process.env.GEMINI_API_KEY || "";
    case "openai": return process.env.OPENAI_API_KEY || "";
    case "litellm": return process.env.LITELLM_API_KEY || "";
    case "nvidia": return process.env.NVIDIA_API_KEY || "";
  }
}

export function routeFor(model: string): RouteConfig {
  const provider = detectProvider(model);
  return {
    model,
    baseUrl: ENDPOINTS[provider],
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

export function polishRoute(): RouteConfig | null {
  const model = process.env.KEMMA_MODEL_POLISH?.trim();
  if (!model) return null;
  // Polish always goes through LiteLLM so one key gates all optional polish routes.
  return { model, baseUrl: ENDPOINTS.litellm, apiKey: apiKeyFor("litellm"), label: `${model} (LiteLLM polish)`, provider: "litellm" };
}

export function nemotronRoute(): RouteConfig | null {
  const model = process.env.KEMMA_MODEL_NEMOTRON?.trim();
  if (!model) return null;
  return { model, baseUrl: ENDPOINTS.nvidia, apiKey: apiKeyFor("nvidia"), label: `${model} (NVIDIA Nemotron)`, provider: "nvidia" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK CHAIN
// ═══════════════════════════════════════════════════════════════════════════════

export function fallbackRoutes(): RouteConfig[] {
  const chain = [
    getEnvModel("KEMMA_MODEL_CHAT"),
    getEnvModel("KEMMA_MODEL_LONG_DOC"),
    getEnvModel("KEMMA_MODEL_VISION"),
    "gpt-4o-mini", // LiteLLM last resort
  ];
  return chain.map(routeFor);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPEND CAPS
// ═══════════════════════════════════════════════════════════════════════════════

export function monthlySpendCapUsd(provider: ModelProvider): number {
  const key = provider === "anthropic" ? "KEMMA_CAP_ANTHROPIC" : provider === "openai" || provider === "litellm" ? "KEMMA_CAP_OPENAI" : null;
  if (!key) return 0;
  const raw = process.env[key]?.trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = ROUGH_PRICES_USD_PER_1M[model] || { input: 2, output: 6 };
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

export function kemmaRoute(input: RouteInput): RouteConfig {
  const { tier, isThinking, isAgentic, taskComplexity } = input;

  if (isThinking) {
    return routeFor(process.env.KEMMA_MODEL_PLANNER || DEFAULTS.KEMMA_MODEL_PLANNER);
  }

  if (isAgentic && taskComplexity === "complex") {
    return routeFor(process.env.KEMMA_MODEL_REPORT || DEFAULTS.KEMMA_MODEL_REPORT);
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

export function whisperRoute(): RouteConfig {
  return routeFor("whisper-1");
}

export function geminiLiveRoute(): RouteConfig {
  return routeFor("gemini-2.0-flash-live-001");
}

export function elevenLabsRoute(): RouteConfig {
  return { model: "eleven_multilingual_v2", baseUrl: "https://api.elevenlabs.io/v1", apiKey: process.env.ELEVEN_LABS_API_KEY || "", label: "ElevenLabs", provider: "openai" };
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
