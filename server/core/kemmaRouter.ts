/**
 * kemmaRouter.ts
 * Kemma's tier-based model routing - Full Stack Configuration
 * 
 * Model Routing Strategy:
 * - Text/Agent Tasks → Kimi K2.5 via NVIDIA API (default, free tier)
 * - Web Search → Perplexity Sonar → Kimi synthesizes
 * - Refinement/Polish → Claude Sonnet (Pro/Max tier only)
 * 
 * Voice (Kemma Calls):
 * - STT: OpenAI Whisper
 * - Live S2S: Gemini Live (ultra low latency)
 * - TTS: ElevenLabs
 * 
 * Memory:
 * - Embeddings: Gemini Embedding 2
 * - Semantic Search: Gemini Embedding 2
 * 
 * Vision/Multimodal:
 * - Image understanding: Gemini Flash
 * - Document scanning: Gemini Flash
 */

export type Tier = "free" | "trial" | "pro" | "max";
export type TaskComplexity = "simple" | "medium" | "complex";
export type ModelProvider = "nvidia" | "kimi" | "anthropic" | "perplexity" | "gemini" | "openai" | "elevenlabs";

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
  provider: ModelProvider;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const MODELS = {
  // Text/Agent Models
  KIMI_K2_5_NVIDIA: "meta/llama-3.1-405b-instruct",  // Via NVIDIA (free tier default)
  KIMI_K2_5:        "kimi-k2.5",                      // Direct Kimi API
  SONNET:           "claude-sonnet-4-6",              // Anthropic refinement
  OPUS:             "claude-opus-4-6",                // Anthropic thinking
  
  // Search
  PERPLEXITY_SONAR: "sonar-pro",                      // Web search
  
  // Voice
  WHISPER:          "whisper-1",                      // OpenAI STT
  GEMINI_LIVE:      "gemini-2.0-flash-live-001",      // Live S2S
  ELEVENLABS_TTS:   "eleven_multilingual_v2",         // TTS
  
  // Vision/Multimodal
  GEMINI_FLASH:     "gemini-2.0-flash",               // Vision & docs
  
  // Embeddings
  GEMINI_EMBEDDING: "text-embedding-004",             // Gemini Embedding 2
} as const;

const ENDPOINTS = {
  NVIDIA:      "https://integrate.api.nvidia.com/v1",
  KIMI:        "https://api.moonshot.cn/v1",
  ANTHROPIC:   "https://api.anthropic.com/v1",
  PERPLEXITY:  "https://api.perplexity.ai",
  GEMINI:      "https://generativelanguage.googleapis.com/v1beta",
  OPENAI:      "https://api.openai.com/v1",
  ELEVENLABS:  "https://api.elevenlabs.io/v1",
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

export function kemmaRoute(input: RouteInput): RouteConfig {
  const { tier, isThinking, isAgentic, taskComplexity, step = 1, maxSteps = 5 } = input;
  
  // API Keys from environment
  const nvidiaKey     = process.env.NVIDIA_API_KEY!;
  const kimiKey       = process.env.KIMI_API_KEY!;
  const anthropicKey  = process.env.ANTHROPIC_API_KEY!;
  
  // ═════════════════════════════════════════════════════════════════════════════
  // THINKING MODE → Claude Opus (all tiers that support it)
  // ═════════════════════════════════════════════════════════════════════════════
  if (isThinking) {
    return { 
      model: MODELS.OPUS, 
      baseUrl: ENDPOINTS.ANTHROPIC, 
      apiKey: anthropicKey, 
      label: "🧠 Opus", 
      provider: "anthropic" 
    };
  }
  
  // ═════════════════════════════════════════════════════════════════════════════
  // FREE TIER → NVIDIA/Kimi K2.5 (free)
  // ═════════════════════════════════════════════════════════════════════════════
  if (tier === "free") {
    // Use NVIDIA API for free tier (most cost effective)
    return { 
      model: MODELS.KIMI_K2_5_NVIDIA, 
      baseUrl: ENDPOINTS.NVIDIA, 
      apiKey: nvidiaKey, 
      label: "Kimi K2.5 (NVIDIA)", 
      provider: "nvidia" 
    };
  }
  
  // ═════════════════════════════════════════════════════════════════════════════
  // FINAL STEP REFINEMENT → Claude Sonnet (Pro/Max only)
  // ═════════════════════════════════════════════════════════════════════════════
  if (isAgentic && step === maxSteps && (tier === "pro" || tier === "max")) {
    return { 
      model: MODELS.SONNET, 
      baseUrl: ENDPOINTS.ANTHROPIC, 
      apiKey: anthropicKey, 
      label: "Sonnet (Polish)", 
      provider: "anthropic" 
    };
  }
  
  // ═════════════════════════════════════════════════════════════════════════════
  // COMPLEX TASKS → Claude Sonnet (Pro/Max only, non-agentic)
  // ═════════════════════════════════════════════════════════════════════════════
  if ((tier === "pro" || tier === "max") && taskComplexity === "complex" && !isAgentic) {
    return { 
      model: MODELS.SONNET, 
      baseUrl: ENDPOINTS.ANTHROPIC, 
      apiKey: anthropicKey, 
      label: "Sonnet", 
      provider: "anthropic" 
    };
  }
  
  // ═════════════════════════════════════════════════════════════════════════════
  // AGENTIC TASKS → Kimi K2.5 (all tiers)
  // ═════════════════════════════════════════════════════════════════════════════
  if (isAgentic) {
    return { 
      model: MODELS.KIMI_K2_5_NVIDIA, 
      baseUrl: ENDPOINTS.NVIDIA, 
      apiKey: nvidiaKey, 
      label: "Kimi K2.5 (NVIDIA)", 
      provider: "nvidia" 
    };
  }
  
  // ═════════════════════════════════════════════════════════════════════════════
  // TRIAL TIER
  // ═════════════════════════════════════════════════════════════════════════════
  if (tier === "trial") {
    if (taskComplexity === "complex") {
      return { 
        model: MODELS.SONNET, 
        baseUrl: ENDPOINTS.ANTHROPIC, 
        apiKey: anthropicKey, 
        label: "Sonnet", 
        provider: "anthropic" 
      };
    }
    return { 
      model: MODELS.KIMI_K2_5_NVIDIA, 
      baseUrl: ENDPOINTS.NVIDIA, 
      apiKey: nvidiaKey, 
      label: "Kimi K2.5 (NVIDIA)", 
      provider: "nvidia" 
    };
  }
  
  // ═════════════════════════════════════════════════════════════════════════════
  // DEFAULT → NVIDIA/Kimi K2.5
  // ═════════════════════════════════════════════════════════════════════════════
  return { 
    model: MODELS.KIMI_K2_5_NVIDIA, 
    baseUrl: ENDPOINTS.NVIDIA, 
    apiKey: nvidiaKey, 
    label: "Kimi K2.5 (NVIDIA)", 
    provider: "nvidia" 
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIALIZED ROUTERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Web Search Router
 * Route: Perplexity Sonar → returns search results for Kimi to synthesize
 */
export function perplexityRoute(): RouteConfig {
  return {
    model: MODELS.PERPLEXITY_SONAR,
    baseUrl: ENDPOINTS.PERPLEXITY,
    apiKey: process.env.PERPLEXITY_API_KEY!,
    label: "Perplexity Sonar",
    provider: "perplexity",
  };
}

/**
 * Voice Router (Kemma Calls)
 * STT: OpenAI Whisper
 * Live S2S: Gemini Live
 * TTS: ElevenLabs
 */
export function whisperRoute(): RouteConfig {
  return {
    model: MODELS.WHISPER,
    baseUrl: ENDPOINTS.OPENAI,
    apiKey: process.env.OPENAI_API_KEY!,
    label: "Whisper",
    provider: "openai",
  };
}

export function geminiLiveRoute(): RouteConfig {
  return {
    model: MODELS.GEMINI_LIVE,
    baseUrl: ENDPOINTS.GEMINI,
    apiKey: process.env.GEMINI_API_KEY!,
    label: "Gemini Live",
    provider: "gemini",
  };
}

export function elevenLabsRoute(): RouteConfig {
  return {
    model: MODELS.ELEVENLABS_TTS,
    baseUrl: ENDPOINTS.ELEVENLABS,
    apiKey: process.env.ELEVEN_LABS_API_KEY!,
    label: "ElevenLabs",
    provider: "elevenlabs",
  };
}

/**
 * Vision/Multimodal Router
 * Uses Gemini Flash for image understanding and document scanning
 */
export function geminiVisionRoute(): RouteConfig {
  return {
    model: MODELS.GEMINI_FLASH,
    baseUrl: ENDPOINTS.GEMINI,
    apiKey: process.env.GEMINI_API_KEY!,
    label: "Gemini Flash",
    provider: "gemini",
  };
}

/**
 * Embeddings Router (Memory)
 * Uses Gemini Embedding 2 for semantic search
 */
export function geminiEmbeddingRoute(): { model: string; apiKey: string } {
  return {
    model: MODELS.GEMINI_EMBEDDING,
    apiKey: process.env.GEMINI_API_KEY!,
  };
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

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL LIST FETCHER (for verification)
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchNvidiaModels(): Promise<string[]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return [];
  
  try {
    const res = await fetch(`${ENDPOINTS.NVIDIA}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as { data?: Array<{ id: string }> };
    return data.data?.map((m) => m.id) || [];
  } catch {
    return [];
  }
}

export async function checkModelAvailability(): Promise<Record<string, boolean>> {
  const models = await fetchNvidiaModels();
  return {
    kimiAvailable: models.some((m) => m.toLowerCase().includes("kimi")),
    llamaAvailable: models.some((m) => m.toLowerCase().includes("llama")),
    totalModels: models.length,
  };
}
