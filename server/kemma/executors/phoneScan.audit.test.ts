import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Gap tests for server/kemma/executors/phoneScan.ts. The vertex and AI Studio happy paths are
// covered by phoneScanVertex.test.ts; these cover the misconfigurations: a keyless studio route
// and a vision slot that does not resolve to a Gemini model.

const sdkState = vi.hoisted(() => ({
  keys: [] as string[],
  models: [] as string[],
  text: "Coffee Shop",
  throwsOnConstruct: true,
}));

// Mirrors @google/generative-ai: the real constructor rejects an empty API key, which is what
// keeps a keyless studio route from firing an unauthenticated request.
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor(key: string) {
      sdkState.keys.push(key);
      if (!key && sdkState.throwsOnConstruct) throw new Error("No API key provided.");
    }
    getGenerativeModel(cfg: { model: string }) {
      sdkState.models.push(cfg.model);
      return {
        generateContent: async () => ({ response: { text: () => sdkState.text } }),
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

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "GEMINI_API_KEY", "QWEN_API_KEY", "KEMMA_MODEL_VISION",
];

const saved = new Map<string, string | undefined>();
let fetchMock: ReturnType<typeof vi.fn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  sdkState.keys = [];
  sdkState.models = [];
  sdkState.text = "Coffee Shop";
  sdkState.throwsOnConstruct = true;
  authState.token = "fake-access-token";
  fsState.readable = true;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
  fetchMock = vi.fn(async (_url: string, _init: any) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "vertex answer" }] } }] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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

const scan = async (
  mod: typeof import("./phoneScan"),
  input: Record<string, unknown> = {},
) =>
  mod.scanWithGemini({
    imageBase64: "aW1hZ2U=",
    mimeType: "image/png",
    ...input,
  });

const load = async () => import("./phoneScan");

describe("phoneScan backend selection", () => {
  it("fails with a configuration error instead of calling with an empty AI Studio key", async () => {
    const mod = await load();
    const result = await scan(mod);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No API key provided/);
    expect(sdkState.keys).toEqual([""]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the static AI Studio key and the vision slot model when a key is configured", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const mod = await load();
    const result = await scan(mod);
    expect(result.success).toBe(true);
    expect(sdkState.keys).toEqual(["studio-key"]);
    expect(sdkState.models).toEqual(["gemini-3.8-flash"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a vision slot that is not a Gemini model is still sent through the Google SDK", async () => {
    // detectProvider falls back to qwen for unknown ids, so this route carries authKind api_key
    // and the phone scan hands the Qwen key plus a foreign model id to the Google client.
    process.env.KEMMA_MODEL_VISION = "gpt-4o-vision";
    process.env.QWEN_API_KEY = "q";
    process.env.GEMINI_API_KEY = "studio-key";
    const mod = await load();
    const result = await scan(mod);
    expect(result.success).toBe(true); // the mocked client accepts the key; the real one 400s
    expect(sdkState.keys).toEqual(["q"]); // the Qwen key, not the Gemini key
    expect(sdkState.models).toEqual(["gpt-4o-vision"]); // an id Google does not serve
  });

  it("switches to the native vertex generateContent URL when the vision route is vertex-backed", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.VERTEX_PROJECT = "env-project";
    const mod = await load();
    const result = await scan(mod);
    expect(result.success).toBe(true);
    expect(result.text).toBe("vertex answer");
    expect(sdkState.keys).toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/publishers/google/models/gemini-3.8-flash:generateContent",
    );
    expect((fetchMock.mock.calls[0][1] as any).headers.Authorization).toBe("Bearer fake-access-token");
  });

  it("an unreadable service account falls back to the studio key rather than a blank call", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GEMINI_API_KEY = "studio-key";
    fsState.readable = false;
    const mod = await load();
    const result = await scan(mod);
    expect(result.success).toBe(true);
    expect(sdkState.keys).toEqual(["studio-key"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the scan type selects the prompt and a custom prompt wins", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.VERTEX_PROJECT = "env-project";
    const mod = await load();
    await scan(mod, { scanType: "receipt" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text).toMatch(/vendor|store/);
    await scan(mod, { scanType: "receipt", userPrompt: "Just the total" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).contents[0].parts[0].text).toBe("Just the total");
  });

  it("a failed scan returns success false with the provider message and no token", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.VERTEX_PROJECT = "env-project";
    fetchMock.mockResolvedValue(new Response("model not found in this location", { status: 404 }) as any);
    const mod = await load();
    const result = await scan(mod);
    expect(result.success).toBe(false);
    expect(result.error).toContain("404");
    const logged = errorSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain("fake-access-token");
    expect(result.structured).toBeUndefined();
  });
});
