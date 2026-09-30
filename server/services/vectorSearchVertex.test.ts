import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const authState = vi.hoisted(() => ({ token: "fake-access-token" }));
const sdkState = vi.hoisted(() => {
  const values = new Array(768).fill(0.11);
  return { key: "", calls: 0, values };
});

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

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor(key: string) {
      sdkState.key = key;
    }
    getGenerativeModel() {
      return {
        embedContent: async () => {
          sdkState.calls++;
          return { embedding: { values: sdkState.values } };
        },
      };
    }
  },
}));

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT",
  "VERTEX_EMBEDDING_LOCATION", "GEMINI_API_KEY", "KEMMA_MODEL_EMBEDDING", "DATABASE_URL",
];

let credsDir = "";
const saved = new Map<string, string | undefined>();
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  credsDir = mkdtempSync(join(tmpdir(), "vertex-embed-test-"));
  writeFileSync(join(credsDir, "fake-sa.json"), "not a real service account");
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = join(credsDir, "fake-sa.json");
  authState.token = "fake-access-token";
  sdkState.key = "";
  sdkState.calls = 0;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  warnSpy.mockRestore();
  if (credsDir) rmSync(credsDir, { recursive: true, force: true });
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("embed in Vertex mode", () => {
  it("predicts text-embedding-004 in us-central1 with a bearer token and returns 768 dims", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.VERTEX_PROJECT = "env-project";
    const values = new Array(768).fill(0.5);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ predictions: [{ embeddings: { values } }] }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { embed } = await import("../services/vectorSearch");
    const out = await embed("hello world");
    expect(out).toHaveLength(768);
    expect(out[0]).toBe(0.5);
    expect(sdkState.calls).toBe(0); // the AI Studio SDK is not used in Vertex mode

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/env-project/locations/us-central1/publishers/google/models/text-embedding-004:predict"
    );
    expect(init.headers.Authorization).toBe("Bearer fake-access-token");
    expect(JSON.parse(init.body)).toEqual({ instances: [{ content: "hello world" }] });
  });

  it("maps gemini-embedding-2 to text-embedding-004 and logs the mapping once", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.KEMMA_MODEL_EMBEDDING = "gemini-embedding-2";
    const values = new Array(768).fill(0.5);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ predictions: [{ embeddings: { values } }] }), text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { embed, clearVectorCache } = await import("../services/vectorSearch");
    clearVectorCache();
    await embed("first");
    await embed("second"); // different text, so not served from cache
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => u.includes("/models/text-embedding-004:predict"))).toBe(true);
    const mappingLogs = warnSpy.mock.calls.filter((c) => String(c[0]).includes("KEMMA_MODEL_EMBEDDING"));
    expect(mappingLogs).toHaveLength(1);
  });

  it("keeps the token out of any thrown error", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.VERTEX_PROJECT = "env-project";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ predictions: [{ embeddings: { values: [1, 2, 3] } }] }),
      text: async () => "",
    }));

    const { embed, clearVectorCache } = await import("../services/vectorSearch");
    clearVectorCache();
    const err = await embed("wrong dim").catch((e: Error) => e.message);
    expect(err).toContain("768");
    expect(String(err)).not.toContain("fake-access-token");
  });
});

describe("embed in AI Studio mode", () => {
  it("uses the SDK and makes no fetch call", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { embed, clearVectorCache } = await import("../services/vectorSearch");
    clearVectorCache();
    const out = await embed("hello world");
    expect(out).toHaveLength(768);
    expect(sdkState.key).toBe("studio-key");
    expect(sdkState.calls).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a config error when no key is set", async () => {
    const { embed, clearVectorCache } = await import("../services/vectorSearch");
    clearVectorCache();
    await expect(embed("hello")).rejects.toThrow(/GEMINI_API_KEY is not configured/);
  });
});
