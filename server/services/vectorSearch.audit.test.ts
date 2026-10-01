import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Audit tests for server/services/vectorSearch.ts embeddings: which credential and which
// endpoint each mode really uses, plus the module-load env snapshots.
// The vertex happy path is already covered by vectorSearchVertex.test.ts.

const sdkState = vi.hoisted(() => ({
  keys: [] as string[],
  models: [] as string[],
  texts: [] as string[],
  values: new Array(768).fill(0.11) as number[],
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor(key: string) {
      sdkState.keys.push(key);
    }
    getGenerativeModel(cfg: { model: string }) {
      return {
        embedContent: async (text: string) => {
          sdkState.models.push(cfg.model);
          sdkState.texts.push(text);
          return { embedding: { values: sdkState.values } };
        },
      };
    }
  },
}));

const authState = vi.hoisted(() => ({ token: "fake-access-token" }));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: authState.token }) };
    }
    async getProjectId() {
      return "adc-project-123";
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

vi.mock("../db", () => ({ getDb: async () => null }));

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT",
  "VERTEX_EMBEDDING_LOCATION", "GEMINI_API_KEY", "KEMMA_MODEL_EMBEDDING",
  "LITELLM_BASE_URL", "LITELLM_API_KEY", "QWEN_BASE_URL", "QWEN_API_KEY",
];

const saved = new Map<string, string | undefined>();
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  sdkState.keys = [];
  sdkState.models = [];
  sdkState.texts = [];
  authState.token = "fake-access-token";
  fsState.readable = true;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
  fetchMock = vi.fn(async (_url: string, _init: any) =>
    new Response(JSON.stringify({ predictions: [{ embeddings: { values: new Array(768).fill(0.5) } }] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("AI Studio embedding path", () => {
  it("reads GEMINI_API_KEY per call, so a key that arrives after import is used", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const { embed, clearVectorCache } = await import("./vectorSearch");
    clearVectorCache();
    process.env.GEMINI_API_KEY = "rotated-key"; // e.g. Secret Manager landing after import
    const out = await embed("hello");
    expect(out).toHaveLength(768);
    expect(sdkState.keys).toEqual(["rotated-key"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws the config error only while no key is set, and works once one appears", async () => {
    const { embed, clearVectorCache } = await import("./vectorSearch");
    clearVectorCache();
    await expect(embed("hello")).rejects.toThrow(/GEMINI_API_KEY is not configured/);
    process.env.GEMINI_API_KEY = "late-key";
    expect(await embed("hello")).toHaveLength(768);
    expect(sdkState.keys).toEqual(["late-key"]);
  });

  it("KEMMA_MODEL_EMBEDDING is read per call too", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    process.env.KEMMA_MODEL_EMBEDDING = "first-model";
    const { embed, clearVectorCache } = await import("./vectorSearch");
    clearVectorCache();
    await embed("one");
    process.env.KEMMA_MODEL_EMBEDDING = "second-model";
    await embed("two");
    expect(sdkState.models).toEqual(["first-model", "second-model"]);
  });

  it("defaults to gemini-embedding-2, a different default than the router embedding slot", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const { embed, clearVectorCache } = await import("./vectorSearch");
    clearVectorCache();
    await embed("one");
    expect(sdkState.models).toEqual(["gemini-embedding-2"]);

    const r = await import("../core/kemmaRouter");
    expect(r.embeddingRoute().model).toBe("text-embedding-004");
  });

  it("ignores provider routing: a litellm/ or qwen embedding id still goes to the Google SDK", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    process.env.LITELLM_API_KEY = "gw";
    process.env.KEMMA_MODEL_EMBEDDING = "litellm/text-embedding-004";
    const { embed, clearVectorCache } = await import("./vectorSearch");
    clearVectorCache();
    await embed("one");
    // No gateway call, no gateway key: the prefixed id is handed to the AI Studio SDK, which
    // sends it to generativelanguage.googleapis.com and the provider rejects the unknown model.
    expect(sdkState.models).toEqual(["litellm/text-embedding-004"]);
    expect(sdkState.keys).toEqual(["studio-key"]);
    expect(fetchMock).not.toHaveBeenCalled();

    clearVectorCache();
    process.env.KEMMA_MODEL_EMBEDDING = "qwen3-embedding";
    await embed("two");
    expect(sdkState.models.at(-1)).toBe("qwen3-embedding"); // again the Google SDK, not the Qwen endpoint
  });

  it("isVectorSearchConfigured follows the key that is set right now", async () => {
    const m = await import("./vectorSearch");
    expect(m.isVectorSearchConfigured()).toBe(false);
    process.env.GEMINI_API_KEY = "studio-key";
    expect(m.isVectorSearchConfigured()).toBe(true);

    vi.resetModules();
    process.env.GEMINI_BACKEND = "vertex";
    const v = await import("./vectorSearch");
    expect(v.isVectorSearchConfigured()).toBe(true); // vertex needs no studio key
  });
});

describe("vertex embedding path", () => {
  it("honors VERTEX_EMBEDDING_LOCATION for the predict URL", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.VERTEX_PROJECT = "env-project";
    process.env.VERTEX_EMBEDDING_LOCATION = "europe-west4";
    const { embed, clearVectorCache } = await import("./vectorSearch");
    clearVectorCache();
    await embed("hello");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://europe-west4-aiplatform.googleapis.com/v1/projects/env-project/locations/europe-west4/publishers/google/models/text-embedding-004:predict",
    );
    expect(sdkState.keys).toEqual([]);
  });

  it("the per-text cache is shared across backends, so a switch reuses the other model's vector", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const m = await import("./vectorSearch");
    m.clearVectorCache();
    sdkState.values = new Array(768).fill(0.11);
    await m.embed("same text");
    expect(sdkState.texts).toEqual(["same text"]);

    // Flip to vertex without restarting the module: the cached studio vector is returned and
    // Vertex is never called, so the two backends' vectors can coexist in one store.
    process.env.GEMINI_BACKEND = "vertex";
    process.env.VERTEX_PROJECT = "env-project";
    const again = await m.embed("same text");
    expect(again).toEqual(new Array(768).fill(0.11));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
