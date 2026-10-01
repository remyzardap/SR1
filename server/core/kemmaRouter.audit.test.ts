import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Gap tests for the model routing layer (audit 2, area 1 tail + area 2 head).
// kemmaRouterVertex.test.ts owns the vertex routing matrix; this file owns the slot
// builders, the litellm prefix rules, the env-timing traps and the resolveRouteAuth gaps.

const authState = vi.hoisted(() => ({
  token: "fake-access-token",
  projectId: "adc-project-123",
  failGetClient: false,
  returnNoToken: false,
  failProject: false,
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      if (authState.failGetClient) throw new Error("unable to read credential file");
      return {
        getAccessToken: async () =>
          authState.returnNoToken ? { token: undefined } : { token: authState.token },
      };
    }
    async getProjectId() {
      if (authState.failProject) throw new Error("could not determine project");
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
const QWEN_DEFAULT = "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1";
const GATEWAY_DEFAULT = "https://api.koboillm.com/v1";
const VERTEX_GLOBAL = "https://aiplatform.googleapis.com/v1/projects/adc-project-123/locations/global/endpoints/openapi";

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "VERTEX_EMBEDDING_LOCATION", "QWEN_BASE_URL", "LITELLM_BASE_URL",
  "KEMMA_MODEL_CHAT", "KEMMA_MODEL_SEARCH", "KEMMA_MODEL_VISION", "KEMMA_MODEL_EMBEDDING",
  "KEMMA_MODEL_IMAGE", "KEMMA_MODEL_REPORT", "KEMMA_MODEL_LONG_DOC", "KEMMA_MODEL_PLANNER",
  "KEMMA_MODEL_VERIFY", "KEMMA_MODEL_PRO", "KEMMA_MODEL_PRO_FALLBACK", "KEMMA_MODEL_FALLBACK",
  "GEMINI_API_KEY", "QWEN_API_KEY", "SONAR_API_KEY", "PERPLEXITY_API_KEY",
  "LITELLM_API_KEY", "KOBOILLM_API_KEY",
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
  authState.failGetClient = false;
  authState.returnNoToken = false;
  authState.failProject = false;
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

describe("slot builders against the documented defaults", () => {
  it("each slot resolves its own default model, provider and endpoint", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const r = await load();

    const cases: Array<[string, ReturnType<typeof r.chatRoute>, string, string, string]> = [
      ["chat", r.chatRoute(), "qwen3.8-max", "qwen", QWEN_DEFAULT],
      ["search", r.searchRoute(), "sonar-pro", "perplexity", "https://api.perplexity.ai"],
      ["vision", r.visionRoute(), "gemini-3.8-flash", "gemini", AI_STUDIO],
      ["image", r.imageRoute(), "gemini-3.1-flash-image", "gemini", AI_STUDIO],
      ["report", r.reportRoute(), "qwen3.8-max", "qwen", QWEN_DEFAULT],
      ["longDoc", r.longDocRoute(), "qwen3.8-max", "qwen", QWEN_DEFAULT],
      ["planner", r.plannerRoute(), "gemini-3.8-flash", "gemini", AI_STUDIO],
      ["verify", r.verifyRoute(), "gemini-3.8-flash", "gemini", AI_STUDIO],
      ["pro", r.proRoute(), "gemini-3.1-pro-preview", "gemini", AI_STUDIO],
    ];
    for (const [slot, route, model, provider, baseUrl] of cases) {
      expect([slot, route.model, route.provider, route.baseUrl]).toEqual([slot, model, provider, baseUrl]);
      expect(route.label).toBe(`${model} (${provider})`);
    }

    expect(r.proFallbackRoute()?.model).toBe("gemini-2.5-pro");
    expect(r.polishRoute()).toBeNull();
    expect(r.nemotronRoute()).toBeNull();
  });

  it("embeddingRoute is a shape, not a RouteConfig: model, apiKey and authKind only", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const r = await load();
    const e = r.embeddingRoute();
    expect(e).toEqual({ model: "text-embedding-004", apiKey: "studio-key", authKind: "api_key" });
    expect((e as Record<string, unknown>).baseUrl).toBeUndefined();

    process.env.GEMINI_BACKEND = "vertex";
    const v = r.embeddingRoute();
    expect(v.authKind).toBe("vertex");
    expect(v.apiKey).toBe(""); // vertex embeds authenticate with the service account
  });

  it("the legacy aliases return the same slots", async () => {
    const r = await load();
    expect(r.perplexityRoute().model).toBe(r.searchRoute().model);
    expect(r.geminiVisionRoute().model).toBe(r.visionRoute().model);
    expect(r.geminiEmbeddingRoute()).toEqual(r.embeddingRoute());
    expect(r.kemmaRoute({ tier: "free", isThinking: false, isAgentic: false, taskComplexity: "simple" }).model)
      .toBe(r.chatRoute().model);
    expect(r.kemmaRoute({ tier: "pro", isThinking: true, isAgentic: false, taskComplexity: "simple" }).model)
      .toBe("gemini-3.8-flash"); // planner slot
    expect(r.kemmaRoute({ tier: "pro", isThinking: false, isAgentic: true, taskComplexity: "complex" }).model)
      .toBe("qwen3.8-max"); // long-doc slot
  });
});

describe("slot env overrides", () => {
  it("every KEMMA_MODEL_* override wins over its default, whitespace trimmed", async () => {
    const r = await load();
    process.env.KEMMA_MODEL_CHAT = "  litellm/gemini-3.8-flash ";
    process.env.KEMMA_MODEL_SEARCH = "my-sonar ";
    process.env.KEMMA_MODEL_VISION = "gemini-2.0-flash";
    process.env.KEMMA_MODEL_EMBEDDING = "text-embedding-004";
    process.env.KEMMA_MODEL_IMAGE = "my-image-model";
    process.env.KEMMA_MODEL_REPORT = "report-model";
    process.env.KEMMA_MODEL_LONG_DOC = "long-doc-model";
    process.env.KEMMA_MODEL_PLANNER = "plan-model";
    process.env.KEMMA_MODEL_VERIFY = "verify-model";
    process.env.KEMMA_MODEL_PRO = "pro-model";
    process.env.KEMMA_MODEL_PRO_FALLBACK = "pro-fb-model";

    expect(r.chatRoute().model).toBe("gemini-3.8-flash"); // prefix stripped, gateway kept in the label
    expect(r.chatRoute().provider).toBe("litellm");
    expect(r.searchRoute().model).toBe("my-sonar");
    expect(r.visionRoute().model).toBe("gemini-2.0-flash");
    expect(r.embeddingRoute().model).toBe("text-embedding-004");
    expect(r.imageRoute().model).toBe("my-image-model");
    expect(r.reportRoute().model).toBe("report-model");
    expect(r.longDocRoute().model).toBe("long-doc-model");
    expect(r.plannerRoute().model).toBe("plan-model");
    expect(r.verifyRoute().model).toBe("verify-model");
    expect(r.proRoute().model).toBe("pro-model");
    expect(r.proFallbackRoute()?.model).toBe("pro-fb-model");
  });

  it("an override to a whitespace-only string still trims to the raw env value for non-pro slots", async () => {
    const r = await load();
    process.env.KEMMA_MODEL_CHAT = "   ";
    // getEnvModel trims, so the route carries an empty id straight to the provider default rules.
    const route = r.chatRoute();
    expect(route.model).toBe("");
    expect(route.provider).toBe("qwen");
    expect(route.baseUrl).toBe(QWEN_DEFAULT);
    expect(route.label).toBe(" (qwen)");
  });

  it("KEMMA_MODEL_PRO_FALLBACK set to whitespace disables the pro fallback", async () => {
    const r = await load();
    process.env.KEMMA_MODEL_PRO_FALLBACK = "   ";
    expect(r.proFallbackRoute()).toBeNull();
  });
});

describe("litellm/ prefix routing", () => {
  it("is matched case-insensitively, stripped from the model and kept in the label", async () => {
    process.env.QWEN_API_KEY = "q";
    process.env.LITELLM_API_KEY = "gw";
    const r = await load();
    for (const id of ["litellm/Qwen-Thing", "LiteLLM/Qwen-Thing", "LITELLM/Qwen-Thing"]) {
      process.env.KEMMA_MODEL_CHAT = id;
      const route = r.chatRoute();
      expect(route.provider).toBe("litellm");
      expect(route.model).toBe("Qwen-Thing"); // the rest of the id keeps its original case
      expect(route.label).toBe(`${id} (litellm)`);
      expect(route.baseUrl).toBe(GATEWAY_DEFAULT);
      expect(route.apiKey).toBe("gw");
    }
  });

  it("beats every other routing rule, including the vertex backend", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GEMINI_API_KEY = "studio-key";
    process.env.LITELLM_API_KEY = "gw";
    const r = await load();
    process.env.KEMMA_MODEL_VISION = "litellm/gemini-3.8-flash";
    process.env.KEMMA_MODEL_SEARCH = "litellm/sonar-pro";
    const vision = r.visionRoute();
    const search = r.searchRoute();
    expect(vision.provider).toBe("litellm");
    expect(vision.authKind).toBe("api_key"); // never a vertex route
    expect(vision.baseUrl).toBe(GATEWAY_DEFAULT);
    expect(vision.apiKey).toBe("gw");
    expect(search.baseUrl).toBe(GATEWAY_DEFAULT);
    // resolveRouteAuth on a gateway route is a plain pass-through of the gateway key.
    expect(await r.resolveRouteAuth(vision)).toEqual({
      baseUrl: GATEWAY_DEFAULT,
      model: "gemini-3.8-flash",
      auth: "gw",
    });
  });

  it("reads LITELLM_BASE_URL at call time and trims any number of trailing slashes", async () => {
    const r = await load();
    const id = "litellm/deepseek-ai/deepseek-v3.2-maas";
    expect(r.routeFor(id).baseUrl).toBe(GATEWAY_DEFAULT);
    process.env.LITELLM_BASE_URL = "https://gw.example.com/v1///";
    expect(r.routeFor(id).baseUrl).toBe("https://gw.example.com/v1");
    expect(r.litellmBaseUrl()).toBe("https://gw.example.com/v1");
    process.env.LITELLM_BASE_URL = "";
    expect(r.routeFor(id).baseUrl).toBe(GATEWAY_DEFAULT);
  });
});

describe("base URL env timing", () => {
  it("QWEN_BASE_URL set after this module was imported is still honored", async () => {
    // Secret Manager fills process.env after the static import graph ran (see _core/index.ts and
    // the note in _core/env.ts), so an import-time snapshot would pin every Qwen call to the
    // default host for the life of the process.
    const r = await load();
    expect(r.routeFor("qwen3.8-max").baseUrl).toBe(QWEN_DEFAULT);
    process.env.QWEN_BASE_URL = "https://late.example.com/compatible-mode/v1";
    expect(r.routeFor("qwen3.8-max").baseUrl).toBe("https://late.example.com/compatible-mode/v1");
    expect((await r.resolveRouteAuth(r.routeFor("qwen3.8-max"))).baseUrl).toBe(
      "https://late.example.com/compatible-mode/v1",
    );
  });

  it("a trailing slash in QWEN_BASE_URL is trimmed so call sites do not build a double slash", async () => {
    process.env.QWEN_BASE_URL = "https://qwen.example.com/compatible-mode/v1//";
    const r = await load();
    const target = await r.resolveRouteAuth(r.routeFor("qwen3.8-max"));
    expect(target.baseUrl).toBe("https://qwen.example.com/compatible-mode/v1");
    expect(`${target.baseUrl}/chat/completions`).toBe("https://qwen.example.com/compatible-mode/v1/chat/completions");
  });

  it("LITELLM_BASE_URL keeps the same call-time and trailing-slash behavior", async () => {
    const r = await load();
    const id = "litellm/deepseek-ai/deepseek-v3.2-maas";
    expect(r.routeFor(id).baseUrl).toBe(GATEWAY_DEFAULT);
    process.env.LITELLM_BASE_URL = "https://gw.example.com/v1/";
    expect(r.routeFor(id).baseUrl).toBe("https://gw.example.com/v1");
  });
});

describe("detectProvider falls through to qwen for unknown ids", () => {
  it("returns qwen for ids from other vendors without any warning", async () => {
    const r = await load();
    for (const id of ["gpt-4o", "claude-3-5-sonnet", "llama3.1-70b", "mistral-large", "", "o3-mini"]) {
      expect([id, r.detectProvider(id)]).toEqual([id, "qwen"]);
    }
  });

  it("an unknown id in a slot sends that id to the Qwen endpoint with the Qwen key", async () => {
    process.env.QWEN_API_KEY = "q";
    process.env.GEMINI_API_KEY = "studio-key";
    const r = await load();
    process.env.KEMMA_MODEL_CHAT = "gpt-4o";
    const route = r.chatRoute();
    expect([route.provider, route.baseUrl, route.apiKey, route.model]).toEqual([
      "qwen", QWEN_DEFAULT, "q", "gpt-4o",
    ]);
    // The label hides the misroute: it advertises the qwen provider, so the picker
    // shows "gpt-4o (qwen)" and nothing warns that OpenAI is not configured.
    expect(route.label).toBe("gpt-4o (qwen)");
    expect(r.routeHasAuth(route)).toBe(true); // it looks usable
    const warnings = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(warnings).not.toContain("gpt-4o");
  });

  it("a slot id containing embedding or gemini keeps the gemini provider", async () => {
    const r = await load();
    expect(r.detectProvider("text-embedding-004")).toBe("gemini");
    expect(r.detectProvider("GEMINI-3.8-FLASH")).toBe("gemini");
    expect(r.detectProvider("gemini-embedding-2")).toBe("gemini");
    expect(r.detectProvider("SONAR-PRO")).toBe("perplexity");
    expect(r.detectProvider("QWQ-32B")).toBe("qwen");
  });
});

describe("listSelectableModels", () => {
  it("reports hasKey true for gemini slots in vertex mode with no studio key", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    const r = await load();
    const models = r.listSelectableModels();
    const geminis = models.filter((m) => m.tier === "gemini");
    expect(geminis.length).toBeGreaterThan(0);
    expect(geminis.every((m) => m.hasKey)).toBe(true);
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
  });

  it("reports hasKey false for gemini slots in AI Studio mode with no key, and for a keyless qwen slot", async () => {
    const r = await load();
    delete process.env.QWEN_API_KEY;
    const models = r.listSelectableModels();
    const byId = new Map(models.map((m) => [m.id, m]));
    expect(byId.get("gemini-3.8-flash")?.hasKey).toBe(false);
    expect(byId.get("qwen3.8-max")?.hasKey).toBe(false);
    expect(byId.get("qwen3.8-max")?.tier).toBe("qwen");
  });

  it("dedupes slots that share a model id and keeps slot order", async () => {
    process.env.KEMMA_MODEL_CHAT = "shared-model";
    process.env.KEMMA_MODEL_REPORT = "shared-model";
    process.env.KEMMA_MODEL_LONG_DOC = "second-model";
    process.env.KEMMA_MODEL_VISION = "shared-model";
    process.env.KEMMA_MODEL_PRO = "second-model";
    const r = await load();
    expect(r.listSelectableModels().map((m) => m.id)).toEqual(["shared-model", "second-model"]);
  });

  it("the global KEMMA_MODEL_FALLBACK is not selectable, and neither is the embedding slot", async () => {
    process.env.KEMMA_MODEL_FALLBACK = "fallback-only";
    process.env.KEMMA_MODEL_EMBEDDING = "embed-only";
    const r = await load();
    const ids = r.listSelectableModels().map((m) => m.id);
    expect(ids).not.toContain("fallback-only");
    expect(ids).not.toContain("embed-only");
    expect(r.fallbackRoutes().map((x) => x.model)).toContain("fallback-only");
  });
});

describe("resolveRouteAuth gap coverage", () => {
  it("propagates a Vertex token failure instead of returning an empty credential", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    authState.failGetClient = true;
    const r = await load();
    const route = r.routeFor("gemini-3.8-flash");
    const err = await r.resolveRouteAuth(route).then(
      () => null,
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe("Vertex AI authentication failed. Check GOOGLE_APPLICATION_CREDENTIALS.");
    // The library error text (credential file wording) must not leak through.
    expect(err?.message).not.toMatch(/credential file/i);
  });

  it("propagates the no-token case as its own error", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    authState.returnNoToken = true;
    const r = await load();
    await expect(r.resolveRouteAuth(r.routeFor("gemini-3.8-flash"))).rejects.toThrow(
      /returned no access token/,
    );
  });

  it("asks for VERTEX_PROJECT when the ADC project lookup fails", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    authState.failProject = true;
    const r = await load();
    await expect(r.resolveRouteAuth(r.routeFor("gemini-3.8-flash"))).rejects.toThrow(
      /Could not determine the Vertex project id\. Set VERTEX_PROJECT\./,
    );
  });

  it("replaces the stale AI Studio baseUrl left in the route when no project was cached", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    const r = await load();
    const route = r.routeFor("gemini-3.8-flash");
    expect(route.authKind).toBe("vertex");
    expect(route.baseUrl).toBe(AI_STUDIO); // project unknown at build time: the call site must re-resolve
    expect(route.apiKey).toBe("");
    const target = await r.resolveRouteAuth(route);
    expect(target.baseUrl).toBe(VERTEX_GLOBAL);
    expect(target.auth).toBe("fake-access-token");
  });

  it("never doubles the google/ prefix, whatever the slot was configured with", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    const r = await load();
    for (const id of ["google/gemini-3.8-flash", "Google/gemini-3.8-flash", "gemini-3.8-flash"]) {
      const target = await r.resolveRouteAuth(r.routeFor(id));
      expect([id, target.model]).toEqual([id, "google/gemini-3.8-flash"]);
    }
    // Resolving twice is stable.
    const route = r.routeFor("google/gemini-3.8-flash");
    const first = await r.resolveRouteAuth(route);
    const second = await r.resolveRouteAuth({ ...route, model: first.model });
    expect(second.model).toBe("google/gemini-3.8-flash");
  });

  it("uses the regional host for a regional VERTEX_LOCATION and falls back to global when blank", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.VERTEX_PROJECT = "env-project";
    process.env.VERTEX_LOCATION = "asia-northeast3";
    const r = await load();
    expect((await r.resolveRouteAuth(r.routeFor("gemini-3.8-flash"))).baseUrl).toBe(
      "https://asia-northeast3-aiplatform.googleapis.com/v1/projects/env-project/locations/asia-northeast3/endpoints/openapi",
    );

    process.env.VERTEX_LOCATION = "   ";
    expect((await r.resolveRouteAuth(r.routeFor("gemini-3.8-flash"))).baseUrl).toBe(
      "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/endpoints/openapi",
    );
  });

  it("static-key routes never touch the auth library", async () => {
    authState.failGetClient = true;
    process.env.GEMINI_API_KEY = "studio-key";
    process.env.LITELLM_API_KEY = "gw";
    const r = await load();
    for (const id of ["qwen3.8-max", "sonar-pro", "gemini-3.8-flash", "litellm/gemini-3.8-flash"]) {
      const route = r.routeFor(id);
      const target = await r.resolveRouteAuth(route);
      expect([route.model, target.auth]).toEqual([route.model, route.apiKey]);
    }
  });
});
