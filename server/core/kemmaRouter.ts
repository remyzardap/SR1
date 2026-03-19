/**
 * kemmaRouter.ts
 * Kemma's tier-based model routing.
 */

export type Tier = "free" | "trial" | "pro" | "max";
export type TaskComplexity = "simple" | "medium" | "complex";

export interface RouteInput {
  tier:            Tier;
  isThinking:      boolean;
  isAgentic:       boolean;
  taskComplexity:  TaskComplexity;
  step?:           number;
  maxSteps?:       number;
}

export interface RouteConfig {
  model:    string;
  baseUrl:  string;
  apiKey:   string;
  label:    string;
  provider: "anthropic" | "kimi";
}

const MODELS = {
  KIMI_K2:   "kimi-k2",
  KIMI_K2_5: "kimi-k2.5",
  SONNET:    "claude-sonnet-4-6",
  OPUS:      "claude-opus-4-6",
} as const;

const ENDPOINTS = {
  KIMI:      "https://api.moonshot.cn/v1/",
  ANTHROPIC: "https://api.anthropic.com/v1/",
} as const;

export function kemmaRoute(input: RouteInput): RouteConfig {
  const { tier, isThinking, isAgentic, taskComplexity, step = 1, maxSteps = 5 } = input;
  const kimiKey      = process.env.KIMI_API_KEY!;
  const anthropicKey = process.env.ANTHROPIC_API_KEY!;

  if (isThinking) {
    return { model: MODELS.OPUS, baseUrl: ENDPOINTS.ANTHROPIC, apiKey: anthropicKey, label: "🧠 Opus", provider: "anthropic" };
  }
  if (tier === "free") {
    return { model: MODELS.KIMI_K2, baseUrl: ENDPOINTS.KIMI, apiKey: kimiKey, label: "Kimi K2", provider: "kimi" };
  }
  if (isAgentic && step === maxSteps && tier === "max") {
    return { model: MODELS.SONNET, baseUrl: ENDPOINTS.ANTHROPIC, apiKey: anthropicKey, label: "Sonnet", provider: "anthropic" };
  }
  if (tier === "max" && taskComplexity === "complex" && !isAgentic) {
    return { model: MODELS.SONNET, baseUrl: ENDPOINTS.ANTHROPIC, apiKey: anthropicKey, label: "Sonnet", provider: "anthropic" };
  }
  if (isAgentic && (tier === "pro" || tier === "max")) {
    return { model: MODELS.KIMI_K2_5, baseUrl: ENDPOINTS.KIMI, apiKey: kimiKey, label: "Kimi K2.5", provider: "kimi" };
  }
  if (tier === "pro" && taskComplexity === "complex") {
    return { model: MODELS.SONNET, baseUrl: ENDPOINTS.ANTHROPIC, apiKey: anthropicKey, label: "Sonnet", provider: "anthropic" };
  }
  if (tier === "trial") {
    if (taskComplexity === "complex") {
      return { model: MODELS.SONNET, baseUrl: ENDPOINTS.ANTHROPIC, apiKey: anthropicKey, label: "Sonnet", provider: "anthropic" };
    }
    if (isAgentic) {
      return { model: MODELS.KIMI_K2_5, baseUrl: ENDPOINTS.KIMI, apiKey: kimiKey, label: "Kimi K2.5", provider: "kimi" };
    }
  }
  return { model: MODELS.KIMI_K2, baseUrl: ENDPOINTS.KIMI, apiKey: kimiKey, label: "Kimi K2", provider: "kimi" };
}

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
