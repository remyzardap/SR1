import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  apiKeyFor,
  chatOutputCap,
  detectProvider,
  estimateCostUsd,
  fallbackRoutes,
  getModelLimits,
  listSelectableModels,
  litellmBaseUrl,
  MODEL_LIMITS,
  modelLimitsFor,
  PURPOSE_CAPS,
  purposeCapFor,
  resolveMaxTokens,
  routeFor,
  stripProviderPrefix,
} from "./kemmaRouter";

const TOUCHED_ENV = [
  "LITELLM_BASE_URL", "LITELLM_API_KEY", "KOBOILLM_API_KEY",
  "KEMMA_MODEL_FALLBACK", "KEMMA_MODEL_CHAT", "KEMMA_MODEL_VISION",
  "KEMMA_MODEL_REPORT", "KEMMA_MODEL_LONG_DOC", "KEMMA_MAX_OUTPUT_TOKENS",
  "QWEN_API_KEY", "GEMINI_API_KEY", "SONAR_API_KEY", "PERPLEXITY_API_KEY",
];

const GATEWAY_ID = "litellm/deepseek-ai/deepseek-v3.2-maas";
const GATEWAY_MODEL = "deepseek-ai/deepseek-v3.2-maas";

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of TOUCHED_ENV) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("detectProvider", () => {
  it("routes any litellm/ prefixed id to the gateway before the other rules", () => {
    expect(detectProvider("litellm/qwen-thing")).toBe("litellm");
    expect(detectProvider("litellm/sonar-pro")).toBe("litellm");
    expect(detectProvider("litellm/gemini-3.8-flash")).toBe("litellm");
    expect(detectProvider("litellm/text-embedding-004")).toBe("litellm");
    expect(detectProvider(GATEWAY_ID)).toBe("litellm");
  });

  it("matches the prefix case-insensitively", () => {
    expect(detectProvider("LiteLLM/deepseek-v3.2-maas")).toBe("litellm");
    expect(detectProvider("LITELLM/deepseek-v3.2-maas")).toBe("litellm");
  });

  it("keeps the existing substring rules for un-prefixed ids", () => {
    expect(detectProvider("qwen3.8-max")).toBe("qwen");
    expect(detectProvider("qwq-32b")).toBe("qwen");
    expect(detectProvider("sonar-pro")).toBe("perplexity");
    expect(detectProvider("gemini-3.8-flash")).toBe("gemini");
    expect(detectProvider("text-embedding-004")).toBe("gemini");
    expect(detectProvider("some-other-model")).toBe("qwen");
  });
});

describe("stripProviderPrefix", () => {
  it("only strips the gateway prefix and leaves other ids alone", () => {
    expect(stripProviderPrefix(GATEWAY_ID)).toBe(GATEWAY_MODEL);
    expect(stripProviderPrefix("LiteLLM/DeepSeek-AI/Model")).toBe("DeepSeek-AI/Model");
    expect(stripProviderPrefix("qwen3.8-max")).toBe("qwen3.8-max");
    expect(stripProviderPrefix("litellm-model-without-slash")).toBe("litellm-model-without-slash");
  });
});

describe("routeFor", () => {
  it("sends the stripped model to the gateway and keeps the full id in the label", () => {
    const route = routeFor(GATEWAY_ID);
    expect(route.provider).toBe("litellm");
    expect(route.model).toBe(GATEWAY_MODEL);
    expect(route.label).toBe(`${GATEWAY_ID} (litellm)`);
  });

  it("uses the default gateway base url and honors an override with the trailing slash trimmed", () => {
    expect(routeFor(GATEWAY_ID).baseUrl).toBe("https://api.koboillm.com/v1");
    process.env.LITELLM_BASE_URL = "https://gateway.example.com/v1/";
    expect(routeFor(GATEWAY_ID).baseUrl).toBe("https://gateway.example.com/v1");
    expect(litellmBaseUrl()).toBe("https://gateway.example.com/v1");
  });

  it("leaves existing provider routes unchanged", () => {
    const qwen = routeFor("qwen3.8-max");
    expect(qwen.provider).toBe("qwen");
    expect(qwen.model).toBe("qwen3.8-max");
    expect(qwen.baseUrl).toBe(process.env.QWEN_BASE_URL || "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1");
    expect(qwen.label).toBe("qwen3.8-max (qwen)");

    const sonar = routeFor("sonar-pro");
    expect(sonar.provider).toBe("perplexity");
    expect(sonar.baseUrl).toBe("https://api.perplexity.ai");
    expect(sonar.model).toBe("sonar-pro");

    const gemini = routeFor("gemini-3.8-flash");
    expect(gemini.provider).toBe("gemini");
    expect(gemini.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(gemini.model).toBe("gemini-3.8-flash");
  });
});

describe("apiKeyFor litellm", () => {
  it("prefers LITELLM_API_KEY over KOBOILLM_API_KEY", () => {
    process.env.LITELLM_API_KEY = "test-key";
    process.env.KOBOILLM_API_KEY = "test-key-legacy";
    expect(apiKeyFor("litellm")).toBe("test-key");
  });

  it("falls back to KOBOILLM_API_KEY", () => {
    process.env.KOBOILLM_API_KEY = "test-key-legacy";
    expect(apiKeyFor("litellm")).toBe("test-key-legacy");
  });

  it("returns an empty string when no key is set", () => {
    expect(apiKeyFor("litellm")).toBe("");
    expect(routeFor(GATEWAY_ID).apiKey).toBe("");
  });
});

describe("fallbackRoutes", () => {
  it("is chat then vision when no global fallback is set", () => {
    expect(fallbackRoutes().map((r) => r.model)).toEqual(["qwen3.8-max", "gemini-3.8-flash"]);
  });

  it("appends KEMMA_MODEL_FALLBACK last, routed like any other id", () => {
    process.env.KEMMA_MODEL_FALLBACK = GATEWAY_ID;
    const chain = fallbackRoutes();
    expect(chain).toHaveLength(3);
    expect(chain[2].provider).toBe("litellm");
    expect(chain[2].model).toBe(GATEWAY_MODEL);
  });

  it("skips the global fallback when it duplicates a chain entry", () => {
    process.env.KEMMA_MODEL_CHAT = GATEWAY_ID;
    process.env.KEMMA_MODEL_FALLBACK = GATEWAY_ID;
    expect(fallbackRoutes()).toHaveLength(2);
  });
});

describe("listSelectableModels", () => {
  it("includes a litellm slot model with the gateway tier and key status", () => {
    process.env.KEMMA_MODEL_CHAT = GATEWAY_ID;
    process.env.LITELLM_API_KEY = "test-key";
    const entry = listSelectableModels().find((m) => m.id === GATEWAY_ID);
    expect(entry).toBeDefined();
    expect(entry?.tier).toBe("litellm");
    expect(entry?.hasKey).toBe(true);
  });

  it("reports hasKey false when no gateway key is configured", () => {
    process.env.KEMMA_MODEL_CHAT = GATEWAY_ID;
    const entry = listSelectableModels().find((m) => m.id === GATEWAY_ID);
    expect(entry?.hasKey).toBe(false);
  });
});

describe("estimateCostUsd", () => {
  it("finds the gateway model price with the prefix stripped", () => {
    expect(estimateCostUsd(GATEWAY_ID, 1_000_000, 0)).toBeCloseTo(0.3);
    expect(estimateCostUsd(GATEWAY_MODEL, 0, 1_000_000)).toBeCloseTo(1.0);
  });

  it("uses the published prices and the unknown-model default", () => {
    expect(estimateCostUsd("sonar-pro", 1_000_000, 0)).toBeCloseTo(3);
    expect(estimateCostUsd("qwen3.8-max", 1_000_000, 0)).toBeCloseTo(2);
    expect(estimateCostUsd("gemini-3.8-flash", 1_000_000, 1_000_000)).toBeCloseTo(4.5);
    expect(estimateCostUsd("mystery-model", 1_000_000, 0)).toBeCloseTo(2);
  });
});

describe("P1-06 MODEL_LIMITS and modelLimitsFor", () => {
  it("provides conservative defaults for unknown models", () => {
    const limits = modelLimitsFor("unknown-custom-model");
    expect(limits).toEqual({ contextWindow: 128000, maxOutput: 8192 });
    expect(getModelLimits("another-unknown")).toEqual({ contextWindow: 128000, maxOutput: 8192 });
  });

  it("returns known limits for configured models", () => {
    expect(modelLimitsFor("qwen3.8-max")).toEqual(MODEL_LIMITS["qwen3.8-max"]);
    expect(modelLimitsFor("gemini-3.8-flash")).toEqual(MODEL_LIMITS["gemini-3.8-flash"]);
    expect(modelLimitsFor("gemini-2.5-pro").maxOutput).toBe(65536);
  });

  it("strips provider prefixes when looking up model limits", () => {
    expect(modelLimitsFor("litellm/qwen3.8-max")).toEqual(MODEL_LIMITS["qwen3.8-max"]);
    expect(modelLimitsFor("LiteLLM/deepseek-ai/deepseek-v3.2-maas")).toEqual(MODEL_LIMITS["deepseek-ai/deepseek-v3.2-maas"]);
    expect(modelLimitsFor("google/gemini-3.8-flash")).toEqual(MODEL_LIMITS["gemini-3.8-flash"]);
    expect(modelLimitsFor("litellm/google/gemini-2.5-pro").maxOutput).toBe(65536);
  });
});

describe("P1-06 purpose caps and resolveMaxTokens", () => {
  it("returns 8192 for chat by default", () => {
    expect(chatOutputCap()).toBe(8192);
    expect(purposeCapFor("chat")).toBe(8192);
    expect(purposeCapFor()).toBe(8192);
    expect(purposeCapFor("initial")).toBe(8192);
    expect(purposeCapFor("follow-up")).toBe(8192);
  });

  it("allows KEMMA_MAX_OUTPUT_TOKENS to override the chat cap", () => {
    process.env.KEMMA_MAX_OUTPUT_TOKENS = "4096";
    expect(chatOutputCap()).toBe(4096);
    expect(purposeCapFor("chat")).toBe(4096);
    expect(purposeCapFor("initial")).toBe(4096);

    // Report and planner caps are unaffected by chat cap override
    expect(purposeCapFor("report")).toBe(32768);
    expect(purposeCapFor("planner")).toBe(2048);
  });

  it("ignores non-positive or invalid KEMMA_MAX_OUTPUT_TOKENS", () => {
    process.env.KEMMA_MAX_OUTPUT_TOKENS = "invalid";
    expect(chatOutputCap()).toBe(8192);
    process.env.KEMMA_MAX_OUTPUT_TOKENS = "-100";
    expect(chatOutputCap()).toBe(8192);
  });

  it("returns 32768 for report and long-doc purposes", () => {
    expect(purposeCapFor("report")).toBe(32768);
    expect(purposeCapFor("long-doc")).toBe(32768);
    expect(purposeCapFor("long_doc")).toBe(32768);
    expect(purposeCapFor("synthesis")).toBe(32768);
  });

  it("returns 2048 for planner and verify purposes", () => {
    expect(purposeCapFor("planner")).toBe(2048);
    expect(purposeCapFor("verify")).toBe(2048);
  });

  it("resolves max_tokens as min(model.maxOutput, purposeCap)", () => {
    // Model with 8192 maxOutput:
    // chat: min(8192, 8192) = 8192
    expect(resolveMaxTokens("qwen3.8-max", "chat")).toBe(8192);
    // report: min(8192, 32768) = 8192 (capped by model)
    expect(resolveMaxTokens("qwen3.8-max", "report")).toBe(8192);
    // planner: min(8192, 2048) = 2048 (capped by purpose)
    expect(resolveMaxTokens("qwen3.8-max", "planner")).toBe(2048);
    // verify: min(8192, 2048) = 2048
    expect(resolveMaxTokens("qwen3.8-max", "verify")).toBe(2048);

    // Model with 65536 maxOutput:
    // chat: min(65536, 8192) = 8192 (capped by purpose)
    expect(resolveMaxTokens("gemini-2.5-pro", "chat")).toBe(8192);
    // report: min(65536, 32768) = 32768 (capped by purpose)
    expect(resolveMaxTokens("gemini-2.5-pro", "report")).toBe(32768);
    // planner: min(65536, 2048) = 2048
    expect(resolveMaxTokens("gemini-2.5-pro", "planner")).toBe(2048);

    // When chat cap is overridden:
    process.env.KEMMA_MAX_OUTPUT_TOKENS = "1024";
    expect(resolveMaxTokens("qwen3.8-max", "chat")).toBe(1024);
    expect(resolveMaxTokens("gemini-2.5-pro", "chat")).toBe(1024);
    expect(resolveMaxTokens("gemini-2.5-pro", "report")).toBe(32768);
  });
});
