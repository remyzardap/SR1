import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Same fake auth layer as vertexAuth.test.ts: the router is exercised against it end to end.
const authState = vi.hoisted(() => ({
  token: "fake-access-token",
  projectId: "adc-project-123",
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: authState.token }) };
    }
    async getProjectId() {
      return authState.projectId;
    }
  },
}));

const fsState = vi.hoisted(() => ({ readable: true }));

vi.mock("node:fs", () => ({
  accessSync: vi.fn(() => {
    if (!fsState.readable) throw new Error("ENOENT");
  }),
  constants: { R_OK: 4 },
}));

const AI_STUDIO = "https://generativelanguage.googleapis.com/v1beta/openai";
const VERTEX_GLOBAL = "https://aiplatform.googleapis.com/v1/projects/adc-project-123/locations/global/endpoints/openapi";

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "KEMMA_MODEL_CHAT", "KEMMA_MODEL_VISION", "KEMMA_MODEL_PRO", "KEMMA_MODEL_PRO_FALLBACK",
  "GEMINI_API_KEY", "QWEN_API_KEY", "SONAR_API_KEY", "PERPLEXITY_API_KEY",
  "LITELLM_API_KEY", "KOBOILLM_API_KEY", "KEMMA_MODEL_FALLBACK",
];

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  authState.token = "fake-access-token";
  authState.projectId = "adc-project-123";
  fsState.readable = true;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
  process.env.QWEN_API_KEY = "q";
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

const load = async () => import("./kemmaRouter");

describe("routeFor in AI Studio mode (default)", () => {
  it("keeps gemini routes on the static key and the AI Studio base URL", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const r = await load();
    const route = r.routeFor("gemini-3.8-flash");
    expect(route.provider).toBe("gemini");
    expect(route.authKind).toBe("api_key");
    expect(route.baseUrl).toBe(AI_STUDIO);
    expect(route.apiKey).toBe("studio-key");
    expect(route.model).toBe("gemini-3.8-flash");
  });

  it("leaves non-gemini providers untouched", async () => {
    const r = await load();
    const qwen = r.routeFor("qwen3.8-max");
    expect(qwen.authKind).toBe("api_key");
    expect(qwen.apiKey).toBe("q");
    const sonar = r.routeFor("sonar-pro");
    expect(sonar.authKind).toBe("api_key");
    expect(sonar.baseUrl).toBe("https://api.perplexity.ai");
    const gw = r.routeFor("litellm/deepseek-ai/deepseek-v3.2-maas");
    expect(gw.authKind).toBe("api_key");
    expect(gw.model).toBe("deepseek-ai/deepseek-v3.2-maas");
  });
});

describe("routeFor in Vertex mode", () => {
  beforeEach(() => {
    process.env.GEMINI_BACKEND = "vertex";
  });

  it("marks gemini routes as vertex and clears the static key", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const r = await load();
    const route = r.routeFor("gemini-3.8-flash");
    expect(route.provider).toBe("gemini");
    expect(route.authKind).toBe("vertex");
    expect(route.apiKey).toBe("");
    expect(route.label).toBe("gemini-3.8-flash (gemini)");
  });

  it("strips a leading google/ so it can never double up", async () => {
    const r = await load();
    const route = r.routeFor("google/gemini-3.8-flash");
    expect(route.model).toBe("gemini-3.8-flash");
    const target = await r.resolveRouteAuth(route);
    expect(target.model).toBe("google/gemini-3.8-flash");
  });

  it("uses VERTEX_PROJECT for the base URL when it is known synchronously", async () => {
    process.env.VERTEX_PROJECT = "env-project";
    const r = await load();
    expect(r.routeFor("gemini-3.8-flash").baseUrl).toBe(
      "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/endpoints/openapi"
    );
  });

  it("leaves non-gemini providers on their static keys", async () => {
    const r = await load();
    const qwen = r.routeFor("qwen3.8-max");
    expect(qwen.authKind).toBe("api_key");
    expect(qwen.apiKey).toBe("q");
    const sonar = r.routeFor("sonar-pro");
    expect(sonar.authKind).toBe("api_key");
  });

  it("falls back to AI Studio routing when credentials are unreadable", async () => {
    fsState.readable = false;
    process.env.GEMINI_API_KEY = "studio-key";
    const r = await load();
    const route = r.routeFor("gemini-3.8-flash");
    expect(route.authKind).toBe("api_key");
    expect(route.baseUrl).toBe(AI_STUDIO);
    expect(route.apiKey).toBe("studio-key");
  });
});

describe("resolveRouteAuth", () => {
  it("returns the route's own values for static-key routes", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const r = await load();
    const route = r.routeFor("qwen3.8-max");
    expect(await r.resolveRouteAuth(route)).toEqual({
      baseUrl: route.baseUrl,
      model: route.model,
      auth: route.apiKey,
    });
    const gemini = r.routeFor("gemini-3.8-flash");
    expect(await r.resolveRouteAuth(gemini)).toEqual({
      baseUrl: AI_STUDIO,
      model: "gemini-3.8-flash",
      auth: "studio-key",
    });
  });

  it("attaches the Vertex bearer token, project URL and google/ model only in Vertex mode", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    const r = await load();
    const target = await r.resolveRouteAuth(r.routeFor("gemini-2.5-pro"));
    expect(target.baseUrl).toBe(VERTEX_GLOBAL);
    expect(target.model).toBe("google/gemini-2.5-pro");
    expect(target.auth).toBe("fake-access-token");
  });

  it("honors VERTEX_LOCATION on the resolved URL", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.VERTEX_LOCATION = "us-central1";
    const r = await load();
    const target = await r.resolveRouteAuth(r.routeFor("gemini-2.5-pro"));
    expect(target.baseUrl).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/adc-project-123/locations/us-central1/endpoints/openapi"
    );
  });

  it("never puts the token into any other field", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    const r = await load();
    const target = await r.resolveRouteAuth(r.routeFor("gemini-3.8-flash"));
    expect(target.baseUrl).not.toContain("fake-access-token");
    expect(target.model).not.toContain("fake-access-token");
    expect(JSON.stringify({ baseUrl: target.baseUrl, model: target.model })).not.toContain("fake-access-token");
  });
});

describe("routeHasAuth", () => {
  it("accepts vertex routes without a key and rejects keyless studio routes", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    const r = await load();
    expect(r.routeHasAuth(r.routeFor("gemini-3.8-flash"))).toBe(true);
    process.env.GEMINI_BACKEND = "aistudio";
    expect(r.routeHasAuth(r.routeFor("gemini-3.8-flash"))).toBe(false);
    expect(r.routeHasAuth(r.routeFor("qwen3.8-max"))).toBe(true);
  });
});

describe("pro slot", () => {
  it("defaults to gemini-3.1-pro-preview with a gemini-2.5-pro fallback slot", async () => {
    const r = await load();
    const pro = r.proRoute();
    expect(pro.model).toBe("gemini-3.1-pro-preview");
    expect(pro.provider).toBe("gemini");
    const fb = r.proFallbackRoute();
    expect(fb?.model).toBe("gemini-2.5-pro");
  });

  it("honors env overrides and disables the fallback when set to empty", async () => {
    process.env.KEMMA_MODEL_PRO = "gemini-2.5-pro";
    process.env.KEMMA_MODEL_PRO_FALLBACK = "";
    const r = await load();
    expect(r.proRoute().model).toBe("gemini-2.5-pro");
    expect(r.proFallbackRoute()).toBeNull();
  });

  it("routes through Vertex in vertex mode", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    const r = await load();
    expect(r.proRoute().authKind).toBe("vertex");
    const target = await r.resolveRouteAuth(r.proRoute());
    expect(target.model).toBe("google/gemini-3.1-pro-preview");
  });

  it("appears in listSelectableModels and dedupes against other slots", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const r = await load();
    const ids = r.listSelectableModels().map((m) => m.id);
    expect(ids).toContain("gemini-3.1-pro-preview");
    expect(ids.filter((id) => id === "gemini-3.1-pro-preview")).toHaveLength(1);

    process.env.KEMMA_MODEL_CHAT = "gemini-3.1-pro-preview";
    const ids2 = r.listSelectableModels().map((m) => m.id);
    expect(ids2.filter((id) => id === "gemini-3.1-pro-preview")).toHaveLength(1);
  });

  it("reports hasKey true for gemini slots in vertex mode without a studio key", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    const r = await load();
    const entry = r.listSelectableModels().find((m) => m.id === "gemini-3.1-pro-preview");
    expect(entry?.tier).toBe("gemini");
    expect(entry?.hasKey).toBe(true);
  });
});

describe("callChainFor", () => {
  it("is the plain fallback chain for non-pro routes", async () => {
    const r = await load();
    expect(r.callChainFor(r.chatRoute()).map((x) => x.model)).toEqual(["qwen3.8-max", "gemini-3.8-flash"]);
  });

  it("tries the pro fallback right after a pro slot failure", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const r = await load();
    const chain = r.callChainFor(r.proRoute());
    expect(chain.map((x) => x.model)).toEqual([
      "gemini-3.1-pro-preview", "gemini-2.5-pro", "qwen3.8-max", "gemini-3.8-flash",
    ]);
  });

  it("skips a duplicated pro fallback and honors the empty override", async () => {
    process.env.KEMMA_MODEL_PRO = "gemini-2.5-pro";
    process.env.KEMMA_MODEL_PRO_FALLBACK = "gemini-2.5-pro";
    const r = await load();
    const chain = r.callChainFor(r.proRoute());
    expect(chain.map((x) => x.model)).toEqual(["gemini-2.5-pro", "qwen3.8-max", "gemini-3.8-flash"]);

    process.env.KEMMA_MODEL_PRO_FALLBACK = "";
    expect(r.callChainFor(r.proRoute())[1]?.model).toBe("qwen3.8-max");
  });

  it("keeps every gemini entry of the pro chain on the vertex backend", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    const r = await load();
    const chain = r.callChainFor(r.proRoute());
    expect(chain).toHaveLength(4);
    expect(chain.every((x) => x.provider !== "gemini" || x.authKind === "vertex")).toBe(true);
  });
});

describe("pro prices", () => {
  it("has rough entries for the pro models", async () => {
    const r = await load();
    expect(r.ROUGH_PRICES_USD_PER_1M["gemini-3.1-pro-preview"]).toEqual({ input: 2.0, output: 12.0 });
    expect(r.ROUGH_PRICES_USD_PER_1M["gemini-2.5-pro"]).toEqual({ input: 1.25, output: 10.0 });
    expect(r.estimateCostUsd("gemini-3.1-pro-preview", 0, 1_000_000)).toBeCloseTo(12);
    expect(r.estimateCostUsd("gemini-2.5-pro", 1_000_000, 0)).toBeCloseTo(1.25);
  });
});
