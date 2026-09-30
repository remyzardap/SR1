import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// google-auth-library is fully mocked: no network, obvious fake token, no real credentials.
const authState = vi.hoisted(() => ({
  token: "fake-access-token",
  projectId: "adc-project-123",
  failClient: false,
  failProject: false,
  instances: 0,
  projectIdCalls: 0,
  lastOpts: null as unknown,
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    constructor(opts: unknown) {
      authState.instances++;
      authState.lastOpts = opts;
    }
    async getClient() {
      if (authState.failClient) throw new Error("cannot read /tmp/private/service-account.json");
      return { getAccessToken: async () => ({ token: authState.token }) };
    }
    async getProjectId() {
      authState.projectIdCalls++;
      if (authState.failProject) throw new Error("ADC project lookup failed for /tmp/private/service-account.json");
      return authState.projectId;
    }
  },
}));

// File readability is mocked too: the path value never touches the real disk in this suite.
const fsState = vi.hoisted(() => ({ readable: true }));

vi.mock("node:fs", () => ({
  accessSync: vi.fn(() => {
    if (!fsState.readable) throw new Error("ENOENT");
  }),
  constants: { R_OK: 4 },
}));

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT",
  "VERTEX_LOCATION", "VERTEX_EMBEDDING_LOCATION", "GEMINI_API_KEY", "KEMMA_MODEL_EMBEDDING",
];
const CRED_PATH = "/tmp/private/service-account.json";

const saved = new Map<string, string | undefined>();
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  authState.token = "fake-access-token";
  authState.projectId = "adc-project-123";
  authState.failClient = false;
  authState.failProject = false;
  authState.instances = 0;
  authState.projectIdCalls = 0;
  authState.lastOpts = null;
  fsState.readable = true;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = CRED_PATH;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  vi.unstubAllGlobals();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

const load = async () => import("./vertexAuth");

describe("backend selection", () => {
  it("defaults to AI Studio when GEMINI_BACKEND is unset", async () => {
    const v = await load();
    expect(v.vertexEnabled()).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays on AI Studio for any other value", async () => {
    process.env.GEMINI_BACKEND = "aistudio";
    const v = await load();
    expect(v.vertexEnabled()).toBe(false);
  });

  it("enables Vertex for vertex (case-insensitive) with readable credentials", async () => {
    const v = await load();
    process.env.GEMINI_BACKEND = "VERTEX";
    expect(v.vertexEnabled()).toBe(true);
    process.env.GEMINI_BACKEND = "vertex";
    expect(v.vertexEnabled()).toBe(true);
  });

  it("falls back to AI Studio with one warning when credentials are unreadable", async () => {
    const v = await load();
    process.env.GEMINI_BACKEND = "vertex";
    fsState.readable = false;
    expect(v.vertexEnabled()).toBe(false);
    expect(v.vertexEnabled()).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain("GOOGLE_APPLICATION_CREDENTIALS");
    expect(message).not.toContain(CRED_PATH);
  });

  it("falls back with one warning when GOOGLE_APPLICATION_CREDENTIALS is unset", async () => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const v = await load();
    process.env.GEMINI_BACKEND = "vertex";
    expect(v.vertexEnabled()).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("token and project", () => {
  it("returns the fake token from one shared GoogleAuth instance with the cloud-platform scope", async () => {
    const v = await load();
    expect(await v.getVertexToken()).toBe("fake-access-token");
    expect(await v.getVertexToken()).toBe("fake-access-token");
    expect(authState.instances).toBe(1);
    expect((authState.lastOpts as { scopes: string[] }).scopes).toContain(
      "https://www.googleapis.com/auth/cloud-platform"
    );
  });

  it("fails without leaking token or credential paths into the error or the logs", async () => {
    const v = await load();
    authState.failClient = true;
    await expect(v.getVertexToken()).rejects.toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
    const message = (await v.getVertexToken().catch((e: Error) => e.message)) as string;
    expect(message).not.toContain("fake-access-token");
    expect(message).not.toContain(CRED_PATH);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("throws when the library returns no token", async () => {
    const v = await load();
    authState.token = "";
    await expect(v.getVertexToken()).rejects.toThrow(/no access token/);
  });

  it("prefers VERTEX_PROJECT over the ADC lookup", async () => {
    const v = await load();
    process.env.VERTEX_PROJECT = "env-project";
    expect(await v.getVertexProject()).toBe("env-project");
    expect(authState.projectIdCalls).toBe(0);
  });

  it("resolves and caches the ADC project when VERTEX_PROJECT is unset", async () => {
    const v = await load();
    expect(v.vertexProjectCached()).toBe("");
    expect(await v.getVertexProject()).toBe("adc-project-123");
    expect(v.vertexProjectCached()).toBe("adc-project-123");
  });

  it("asks for VERTEX_PROJECT when the ADC lookup fails", async () => {
    const v = await load();
    authState.failProject = true;
    await expect(v.getVertexProject()).rejects.toThrow(/VERTEX_PROJECT/);
  });
});

describe("URL construction", () => {
  it("uses the global host by default and a regional host for other locations", async () => {
    const v = await load();
    expect(v.vertexChatBaseUrl("p1")).toBe(
      "https://aiplatform.googleapis.com/v1/projects/p1/locations/global/endpoints/openapi"
    );
    process.env.VERTEX_LOCATION = "us-central1";
    expect(v.vertexChatBaseUrl("p1")).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/p1/locations/us-central1/endpoints/openapi"
    );
  });

  it("builds the native generateContent URL without doubling google/", async () => {
    const v = await load();
    expect(v.vertexGenerateContentUrl("p1", "gemini-3.8-flash")).toBe(
      "https://aiplatform.googleapis.com/v1/projects/p1/locations/global/publishers/google/models/gemini-3.8-flash:generateContent"
    );
    expect(v.vertexGenerateContentUrl("p1", "google/gemini-3.8-flash")).toBe(
      "https://aiplatform.googleapis.com/v1/projects/p1/locations/global/publishers/google/models/gemini-3.8-flash:generateContent"
    );
  });

  it("builds the embedding predict URL in VERTEX_EMBEDDING_LOCATION (default us-central1)", async () => {
    const v = await load();
    expect(v.vertexEmbeddingPredictUrl("p1", "text-embedding-004")).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/p1/locations/us-central1/publishers/google/models/text-embedding-004:predict"
    );
    process.env.VERTEX_EMBEDDING_LOCATION = "europe-west1";
    expect(v.vertexEmbeddingPredictUrl("p1", "text-embedding-004")).toBe(
      "https://europe-west1-aiplatform.googleapis.com/v1/projects/p1/locations/europe-west1/publishers/google/models/text-embedding-004:predict"
    );
  });

  it("stripGooglePrefix only removes a leading publisher prefix", async () => {
    const v = await load();
    expect(v.stripGooglePrefix("google/gemini-x")).toBe("gemini-x");
    expect(v.stripGooglePrefix("Google/gemini-x")).toBe("gemini-x");
    expect(v.stripGooglePrefix("gemini-x")).toBe("gemini-x");
  });
});

describe("native generateContent calls", () => {
  it("posts the body with a bearer token and joins the candidate text parts", async () => {
    const v = await load();
    process.env.VERTEX_PROJECT = "env-project";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Hello " }, { text: "world" }, { functionCall: {} }] } }],
      }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const body = v.vertexGenerateContentBody({
      texts: ["system prompt", "what is in this image?"],
      image: { data: "aW1hZ2U=", mimeType: "image/png" },
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    });
    const text = await v.vertexGenerateContentText("gemini-3.8-flash", body);
    expect(text).toBe("Hello world");

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/publishers/google/models/gemini-3.8-flash:generateContent"
    );
    expect(init.headers.Authorization).toBe("Bearer fake-access-token");
    const sent = JSON.parse(init.body);
    expect(sent.contents[0].role).toBe("user");
    expect(sent.contents[0].parts).toEqual([
      { text: "system prompt" },
      { text: "what is in this image?" },
      { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
    ]);
    expect(sent.generationConfig).toEqual({ temperature: 0.1, maxOutputTokens: 4096 });
  });

  it("builds the inlineData body shape for vision", async () => {
    const v = await load();
    const body = v.vertexGenerateContentBody({
      texts: ["prompt", ""],
      image: { data: "ZGF0YQ==", mimeType: "image/jpeg" },
    });
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "prompt" }, { inlineData: { mimeType: "image/jpeg", data: "ZGF0YQ==" } }] },
    ]);
    expect(body.generationConfig).toBeUndefined();
  });

  it("reports a failed Vertex call without the token in the error or logs", async () => {
    const v = await load();
    process.env.VERTEX_PROJECT = "env-project";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => "Permission denied on projects/env-project",
    }));

    await expect(v.vertexGenerateContentText("gemini-3.8-flash", { contents: [] })).rejects.toThrow(/403/);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("embedding model mapping", () => {
  it("keeps text-embedding-004 and logs nothing", async () => {
    const v = await load();
    expect(v.vertexEmbeddingModel("text-embedding-004")).toBe("text-embedding-004");
    expect(v.vertexEmbeddingModel("google/text-embedding-004")).toBe("text-embedding-004");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("maps gemini-embedding-2 and unknown ids to text-embedding-004, logging once", async () => {
    const v = await load();
    expect(v.vertexEmbeddingModel("gemini-embedding-2")).toBe("text-embedding-004");
    expect(v.vertexEmbeddingModel("mystery-embedder")).toBe("text-embedding-004");
    expect(v.vertexEmbeddingModel("")).toBe("text-embedding-004");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("gemini-embedding-2");
  });

  it("sends instances content and parses a 768-float result", async () => {
    const v = await load();
    process.env.VERTEX_PROJECT = "env-project";
    const values = new Array(768).fill(0.25);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ predictions: [{ embeddings: { values } }] }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await v.vertexEmbed("hello world", "gemini-embedding-2");
    expect(out).toHaveLength(768);
    expect(out[0]).toBe(0.25);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/env-project/locations/us-central1/publishers/google/models/text-embedding-004:predict"
    );
    expect(JSON.parse(init.body)).toEqual({ instances: [{ content: "hello world" }] });
  });

  it("rejects a result that is not 768-dimensional", async () => {
    const v = await load();
    process.env.VERTEX_PROJECT = "env-project";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ predictions: [{ embeddings: { values: [0.1, 0.2] } }] }),
      text: async () => "",
    }));
    await expect(v.vertexEmbed("x", "text-embedding-004")).rejects.toThrow(/expected 768/);
  });
});
