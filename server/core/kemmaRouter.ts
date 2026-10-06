/**
 * kemmaRouter.ts
 * Env-driven model routing for the Kemma agent.
 *
 * Supported providers: qwen, gemini, perplexity (search only), litellm (OpenAI-compatible gateway).
 * Dropped providers: kimi, anthropic, openai, nvidia.
 *
 * Gemini backend: GEMINI_BACKEND=vertex (default aistudio) routes every gemini-provider call
 * through the Vertex AI OpenAI-compatible endpoint with a service-account bearer token
 * (GOOGLE_APPLICATION_CREDENTIALS); if that env var is missing or unreadable the code warns once
 * and stays on AI Studio. Vertex auth, token and URL building live in core/vertexAuth.ts.
 * Because Vertex credentials resolve asynchronously, call sites must never read
 * route.apiKey / route.baseUrl for a gemini route directly; they must await resolveRouteAuth(route).
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
 *   pro reasoning (exposed, opt-in) -> KEMMA_MODEL_PRO (default gemini-3.1-pro-preview)
 *                                     with KEMMA_MODEL_PRO_FALLBACK (default gemini-2.5-pro)
 *
 * Fallback chain (used by the engine when a primary call fails):
 *   KEMMA_MODEL_CHAT -> KEMMA_MODEL_VISION -> KEMMA_MODEL_FALLBACK (optional, appended last)
 *   A KEMMA_MODEL_PRO call additionally retries KEMMA_MODEL_PRO_FALLBACK before the chain.
 */

import {
  getVertexProject,
  getVertexToken,
  stripGooglePrefix,
  vertexChatBaseUrl,
  vertexEnabled,
  vertexProjectCached,
} from "./vertexAuth";

export type Tier = "free" | "trial" | "pro" | "max";
export type TaskComplexity = "simple" | "medium" | "complex";
export type ModelProvider = "qwen" | "perplexity" | "gemini" | "litellm" | "venice";

export interface RouteInput {
  tier: Tier;
  isThinking: boolean;
  isAgentic: boolean;
  taskComplexity: TaskComplexity;
  step?: number;
  maxSteps?: number;
}

export type RouteAuthKind = "api_key" | "vertex";

export interface RouteConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
  label: string;
  provider: ModelProvider;
  /**
   * How a request authenticates: "api_key" = static key in RouteConfig.apiKey (all non-gemini
   * providers and gemini via AI Studio); "vertex" = async service-account bearer token, and
   * baseUrl/model must be re-resolved per call through resolveRouteAuth().
   */
  authKind: RouteAuthKind;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENV-DRIVEN DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULTS = {
  KEMMA_MODEL_CHAT: "qwen3.8-max",
  KEMMA_MODEL_SEARCH: "sonar-pro",
  KEMMA_MODEL_VISION: "gemini-3.8-flash",
  KEMMA_MODEL_EMBEDDING: "text-embedding-004",
  KEMMA_MODEL_IMAGE: "gemini-3.1-flash-image",
  KEMMA_MODEL_REPORT: "qwen3.8-max",
  KEMMA_MODEL_LONG_DOC: "qwen3.8-max",
  KEMMA_MODEL_PLANNER: "gemini-3.8-flash",
  KEMMA_MODEL_VERIFY: "gemini-3.8-flash",
  KEMMA_MODEL_PRO: "gemini-3.1-pro-preview",
  KEMMA_MODEL_PRO_FALLBACK: "gemini-2.5-pro",
  KEMMA_SEARCH_RPM: "40",
  QWEN_BASE_URL: "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1",
  LITELLM_BASE_URL: "https://api.koboillm.com/v1",
  VENICE_BASE_URL: "https://api.venice.ai/api/v1",
};

// Endpoint per provider. Static ones are constants; the two configurable gateways are read at
// call time so a value that lands in process.env after this module was imported (Secret Manager
// fills it later: see _core/index.ts and the note in _core/env.ts) still takes effect.
const STATIC_ENDPOINTS: Record<"perplexity" | "gemini", string> = {
  perplexity: "https://api.perplexity.ai",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

/** Configurable OpenAI-compatible base for the Qwen provider. Trailing slashes trimmed. */
export function qwenBaseUrl(): string {
  return (process.env.QWEN_BASE_URL || DEFAULTS.QWEN_BASE_URL).replace(/\/+$/, "");
}

// Read at call time so env changes take effect without a restart. Trailing slash trimmed.
export function litellmBaseUrl(): string {
  return (process.env.LITELLM_BASE_URL || DEFAULTS.LITELLM_BASE_URL).replace(/\/+$/, "");
}

export function veniceBaseUrl(): string {
  return (process.env.VENICE_BASE_URL || DEFAULTS.VENICE_BASE_URL).replace(/\/+$/, "");
}

function endpointFor(provider: ModelProvider): string {
  if (provider === "litellm") return litellmBaseUrl();
  if (provider === "venice") return veniceBaseUrl();
  if (provider === "qwen") return qwenBaseUrl();
  return STATIC_ENDPOINTS[provider];
}

// Very rough per-million-token prices for cost estimation only.
export const ROUGH_PRICES_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "qwen3.8-max": { input: 2, output: 6 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash-thinking": { input: 0.1, output: 0.4 },
  "text-embedding-004": { input: 0, output: 0 },
  "gemini-3.1-pro-preview": { input: 2.0, output: 12.0 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "sonar-pro": { input: 3, output: 15 },
  "sonar": { input: 1, output: 1 },
  "deepseek-ai/deepseek-v3.2-maas": { input: 0.3, output: 1.0 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER / KEY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

const LITELLM_PREFIX = "litellm/";
const VENICE_PREFIX = "venice/";

/** Strips the litellm/ or venice/ routing prefix (case-insensitive); other ids are returned unchanged. */
export function stripProviderPrefix(model: string): string {
  const lower = model.toLowerCase();
  if (lower.startsWith(LITELLM_PREFIX)) return model.slice(LITELLM_PREFIX.length);
  if (lower.startsWith(VENICE_PREFIX)) return model.slice(VENICE_PREFIX.length);
  return model;
}

/** Venice models are unrestricted chat: only admins may select or run them. */
export function isAdminOnlyModel(model: string): boolean {
  return model.toLowerCase().startsWith(VENICE_PREFIX);
}

export function detectProvider(model: string): ModelProvider {
  const lower = model.toLowerCase();
  if (lower.startsWith(LITELLM_PREFIX)) return "litellm";
  if (lower.startsWith(VENICE_PREFIX)) return "venice";
  if (lower.includes("qwen") || lower.includes("qwq")) return "qwen";
  if (lower.includes("sonar")) return "perplexity";
  if (lower.includes("gemini") || lower.includes("embedding")) return "gemini";
  // Default is qwen, but say so once per id: silently misrouting e.g. an OpenAI id to
  // the Qwen endpoint fails later with a confusing provider 4xx and no local trace.
  if (lower && !warnedUnknownProviders.has(lower)) {
    warnedUnknownProviders.add(lower);
    console.warn(`[kemmaRouter] "${model}" matches no known provider; routing it to Qwen. Check the KEMMA_MODEL_* env for this slot.`);
  }
  return "qwen";
}
const warnedUnknownProviders = new Set<string>();

export function apiKeyFor(provider: ModelProvider): string {
  switch (provider) {
    case "qwen": return process.env.QWEN_API_KEY || "";
    case "perplexity": return process.env.SONAR_API_KEY || process.env.PERPLEXITY_API_KEY || "";
    case "gemini": return process.env.GEMINI_API_KEY || "";
    case "litellm": return process.env.LITELLM_API_KEY || process.env.KOBOILLM_API_KEY || "";
    case "venice": return process.env.VENICE_API_KEY || "";
  }
}

export function routeFor(model: string): RouteConfig {
  const provider = detectProvider(model);
  const vertex = provider === "gemini" && vertexEnabled();
  const stripped = provider === "litellm" || provider === "venice" ? stripProviderPrefix(model) : model;
  const project = vertex ? vertexProjectCached() : "";
  return {
    model: vertex ? stripGooglePrefix(stripped) : stripped,
    // A Vertex route keeps the AI Studio URL here until the project id is known (it resolves
    // async); call sites for gemini routes must go through resolveRouteAuth(), never route.baseUrl.
    baseUrl: vertex && project ? vertexChatBaseUrl(project) : endpointFor(provider),
    apiKey: vertex ? "" : apiKeyFor(provider),
    label: `${model} (${provider})`,
    provider,
    authKind: vertex ? "vertex" : "api_key",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERTEX-AWARE REQUEST RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface ResolvedRouteTarget {
  /** OpenAI-compatible base; call sites append /chat/completions. */
  baseUrl: string;
  /** Model id to send upstream (google/ prefixed in Vertex mode, never doubled). */
  model: string;
  /** Bearer credential: the static API key, or a freshly resolved Vertex access token. Never log this. */
  auth: string;
}

/**
 * Resolve everything a route needs at fetch time. Static-key routes resolve synchronously to
 * their own values (non-gemini providers behave exactly as before); Vertex gemini routes get a
 * live bearer token and a project-qualified base URL. Every call site that sends an
 * Authorization header for a RouteConfig must use this.
 */
export async function resolveRouteAuth(route: RouteConfig): Promise<ResolvedRouteTarget> {
  if (route.authKind !== "vertex") {
    return { baseUrl: route.baseUrl, model: route.model, auth: route.apiKey };
  }
  const [auth, project] = await Promise.all([getVertexToken(), getVertexProject()]);
  return { baseUrl: vertexChatBaseUrl(project), model: `google/${stripGooglePrefix(route.model)}`, auth };
}

/** True when a route can actually be called. Vertex routes authenticate via the service account, not a key. */
export function routeHasAuth(route: RouteConfig): boolean {
  return route.authKind === "vertex" || !!route.apiKey;
}

function getEnvModel(name: keyof typeof DEFAULTS): string {
  return (process.env[name] || DEFAULTS[name]).trim();
}

/** Names of the slots that hold a model id. */
export type SlotName =
  | "KEMMA_MODEL_CHAT"
  | "KEMMA_MODEL_SEARCH"
  | "KEMMA_MODEL_VISION"
  | "KEMMA_MODEL_EMBEDDING"
  | "KEMMA_MODEL_IMAGE"
  | "KEMMA_MODEL_REPORT"
  | "KEMMA_MODEL_LONG_DOC"
  | "KEMMA_MODEL_PLANNER"
  | "KEMMA_MODEL_VERIFY"
  | "KEMMA_MODEL_PRO"
  | "KEMMA_MODEL_PRO_FALLBACK";

/**
 * The configured id for a slot exactly as env has it, provider prefix included. Slot builders
 * return a routed RouteConfig; consumers that must keep the routing prefix (S1, the picker)
 * read the id through this.
 */
export function slotModelId(name: SlotName): string {
  return getEnvModel(name);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT ROUTERS
// ═══════════════════════════════════════════════════════════════════════════════

export interface SelectableModel { id: string; label: string; tier: ModelProvider; hasKey: boolean }

export function listSelectableModels(isAdmin = false): SelectableModel[] {
  const slots = ["KEMMA_MODEL_CHAT", "KEMMA_MODEL_REPORT", "KEMMA_MODEL_LONG_DOC", "KEMMA_MODEL_VISION", "KEMMA_MODEL_PRO"] as const;
  const seen = new Set<string>();
  const out: SelectableModel[] = [];
  for (const slot of slots) {
    const id = getEnvModel(slot);
    if (seen.has(id)) continue;
    seen.add(id);
    const provider = detectProvider(id);
    out.push({ id, label: id, tier: provider, hasKey: routeHasAuth(routeFor(id)) });
  }
  if (isAdmin) {
    // Admin-only unrestricted chat models; VENICE_MODELS overrides the list (comma-separated venice/<id>).
    const venice = (process.env.VENICE_MODELS || "venice/venice-uncensored").split(",").map((m) => m.trim()).filter(Boolean);
    for (const id of venice) {
      if (seen.has(id) || !isAdminOnlyModel(id)) continue;
      seen.add(id);
      out.push({ id, label: `${stripProviderPrefix(id)} (unrestricted)`, tier: "venice", hasKey: routeHasAuth(routeFor(id)) });
    }
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

export function embeddingRoute(): { model: string; apiKey: string; authKind: RouteAuthKind } {
  const route = routeFor(getEnvModel("KEMMA_MODEL_EMBEDDING"));
  return { model: route.model, apiKey: route.apiKey, authKind: route.authKind };
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

/** Pro reasoning slot (gemini on both backends). No existing role switches to it automatically. */
export function proRoute(): RouteConfig {
  return routeFor(getEnvModel("KEMMA_MODEL_PRO"));
}

/** Tried when a proRoute() call fails. Set KEMMA_MODEL_PRO_FALLBACK to empty to disable. */
export function proFallbackRoute(): RouteConfig | null {
  const model = (process.env.KEMMA_MODEL_PRO_FALLBACK ?? DEFAULTS.KEMMA_MODEL_PRO_FALLBACK).trim();
  return model ? routeFor(model) : null;
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

/**
 * The order in which the engine retries a failed call: the primary route, then
 * KEMMA_MODEL_PRO_FALLBACK when the primary is the pro slot, then the generic fallback
 * chain, deduplicated by model.
 */
export function callChainFor(route: RouteConfig): RouteConfig[] {
  const proExtra: RouteConfig[] = [];
  if (route.model === proRoute().model) {
    const proFallback = proFallbackRoute();
    if (proFallback && proFallback.model !== route.model) proExtra.push(proFallback);
  }
  return [
    route,
    ...proExtra,
    ...fallbackRoutes().filter((r) => r.model !== route.model && !proExtra.some((e) => e.model === r.model)),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPEND CAPS
// ═══════════════════════════════════════════════════════════════════════════════

export function monthlySpendCapUsd(_provider: ModelProvider): number {
  // Spend caps are currently disabled for qwen/gemini/perplexity.
  // Re-enable per-provider by reading a KEMMA_CAP_<PROVIDER> env var here.
  return 0;
}

/**
 * What a cached prompt token costs relative to a normal input token. Estimates: Qwen implicit cache
 * hits bill at 20% (explicit markers at 10%, but the API merges both into one count), Gemini
 * implicit hits are discounted by Google. Override with KEMMA_CACHED_INPUT_MULTIPLIER (0 to 1).
 */
export function cachedInputMultiplier(model: string): number {
  const override = Number(process.env.KEMMA_CACHED_INPUT_MULTIPLIER);
  if (process.env.KEMMA_CACHED_INPUT_MULTIPLIER && Number.isFinite(override) && override >= 0 && override <= 1) return override;
  return detectProvider(model) === "qwen" ? 0.2 : 0.25;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number, cachedInputTokens = 0): number {
  const price = ROUGH_PRICES_USD_PER_1M[stripProviderPrefix(model)] || { input: 2, output: 6 };
  const cached = Math.min(Math.max(cachedInputTokens, 0), inputTokens);
  const billedInput = inputTokens - cached + cached * cachedInputMultiplier(model);
  return (billedInput * price.input + outputTokens * price.output) / 1_000_000;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL LIMITS AND OUTPUT CAPS (P1-06)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ModelLimits {
  contextWindow: number;
  maxOutput: number;
}

export const DEFAULT_MODEL_LIMITS: ModelLimits = {
  contextWindow: 128000,
  maxOutput: 8192,
};

export const MODEL_LIMITS: Record<string, ModelLimits> = {
  "qwen3.8-max": { contextWindow: 128000, maxOutput: 8192 },
  "gemini-3.8-flash": { contextWindow: 1048576, maxOutput: 8192 },
  "gemini-2.0-flash": { contextWindow: 1048576, maxOutput: 8192 },
  "gemini-2.0-flash-thinking": { contextWindow: 1048576, maxOutput: 8192 },
  "gemini-3.1-pro-preview": { contextWindow: 2097152, maxOutput: 65536 },
  "gemini-2.5-pro": { contextWindow: 2097152, maxOutput: 65536 },
  "sonar-pro": { contextWindow: 200000, maxOutput: 8192 },
  "sonar": { contextWindow: 128000, maxOutput: 8192 },
  "deepseek-ai/deepseek-v3.2-maas": { contextWindow: 128000, maxOutput: 8192 },
  "qwq-32b": { contextWindow: 128000, maxOutput: 8192 },
  "text-embedding-004": { contextWindow: 8192, maxOutput: 0 },
  "gemini-3.1-flash-image": { contextWindow: 128000, maxOutput: 8192 },
};

/**
 * Returns the model's context window and maximum output token limits.
 * Strips provider prefixes ("litellm/", "venice/", "google/").
 * Falls back to conservative defaults ({ 128000, 8192 }).
 */
export function modelLimitsFor(model: string): ModelLimits {
  const stripped = stripProviderPrefix(model);
  const withoutGoogle = stripped.replace(/^google\//i, "");
  const found =
    MODEL_LIMITS[model] ??
    MODEL_LIMITS[stripped] ??
    MODEL_LIMITS[withoutGoogle] ??
    MODEL_LIMITS[model.toLowerCase()] ??
    MODEL_LIMITS[stripped.toLowerCase()] ??
    MODEL_LIMITS[withoutGoogle.toLowerCase()];

  return found ? { ...found } : { ...DEFAULT_MODEL_LIMITS };
}

export const getModelLimits = modelLimitsFor;

export const PURPOSE_CAPS: Record<string, number> = {
  chat: 8192,
  report: 32768,
  "long-doc": 32768,
  long_doc: 32768,
  planner: 2048,
  verify: 2048,
};

/** Chat purpose cap: default 8192, overridden by KEMMA_MAX_OUTPUT_TOKENS. Read at call time. */
export function chatOutputCap(): number {
  const envVal = process.env.KEMMA_MAX_OUTPUT_TOKENS?.trim();
  if (envVal) {
    const parsed = Number.parseInt(envVal, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return PURPOSE_CAPS.chat;
}

/**
 * Purpose cap: chat 8192 (or KEMMA_MAX_OUTPUT_TOKENS), report and long-doc 32768, planner and verify 2048.
 * Also checks route if purpose is generic (e.g. "initial"/"follow-up" in report or long-doc slot).
 */
export function purposeCapFor(purpose?: string, route?: RouteConfig): number {
  const p = (purpose ?? "chat").toLowerCase().trim();
  if (p === "planner") return PURPOSE_CAPS.planner;
  if (p === "verify") return PURPOSE_CAPS.verify;
  if (p === "report" || p === "long-doc" || p === "long_doc" || p === "synthesis") return PURPOSE_CAPS.report;

  if (route) {
    if (route.model === reportRoute().model || route.model === longDocRoute().model) {
      return PURPOSE_CAPS.report;
    }
  }

  return chatOutputCap();
}

/**
 * Per call: max_tokens = min(model.maxOutput, purposeCap)
 */
export function resolveMaxTokens(model: string, purpose?: string, route?: RouteConfig): number {
  const limits = modelLimitsFor(model);
  const cap = purposeCapFor(purpose, route);
  return Math.min(limits.maxOutput, cap);
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
