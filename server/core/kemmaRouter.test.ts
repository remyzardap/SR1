import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  apiKeyFor,
  detectProvider,
  estimateCostUsd,
  fallbackRoutes,
  listSelectableModels,
  litellmBaseUrl,
  routeFor,
  stripProviderPrefix,
} from "./kemmaRouter";

const TOUCHED_ENV = [
  "LITELLM_BASE_URL", "LITELLM_API_KEY", "KOBOILLM_API_KEY",
  "KEMMA_MODEL_FALLBACK", "KEMMA_MODEL_CHAT", "KEMMA_MODEL_VISION",
  "KEMMA_MODEL_REPORT", "KEMMA_MODEL_LONG_DOC",
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
