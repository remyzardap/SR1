import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The SDK is mocked (AI Studio path) and google-auth-library is mocked (Vertex path).
// No real credentials exist anywhere in this suite; the creds file only has to be readable.
const sdkState = vi.hoisted(() => ({ key: "", calls: 0, text: "Coffee Shop" }));
const authState = vi.hoisted(() => ({ token: "fake-access-token" }));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor(key: string) {
      sdkState.key = key;
    }
    getGenerativeModel() {
      return {
        generateContent: async () => {
          sdkState.calls++;
          return { response: { text: () => sdkState.text } };
        },
      };
    }
  },
}));

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

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "GEMINI_API_KEY", "KEMMA_MODEL_VISION",
];

let credsDir = "";
const saved = new Map<string, string | undefined>();
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  credsDir = mkdtempSync(join(tmpdir(), "vertex-scan-test-"));
  const credsPath = join(credsDir, "fake-sa.json");
  writeFileSync(credsPath, "not a real service account");
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
  sdkState.key = "";
  sdkState.calls = 0;
  sdkState.text = "Coffee Shop";
  authState.token = "fake-access-token";
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
  if (credsDir) rmSync(credsDir, { recursive: true, force: true });
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

const receiptText = '{"vendor":"Coffee Shop","total":"5.00","currency":"USD","confidence":0.9}';

describe("scanWithGemini in Vertex mode", () => {
  it("posts a generateContent body with the inlineData part and a bearer token", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.VERTEX_PROJECT = "env-project";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: receiptText }] } }] }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { scanWithGemini } = await import("./phoneScan");
    const result = await scanWithGemini({
      imageBase64: "aW1hZ2U=",
      mimeType: "image/png",
      scanType: "receipt",
    });

    expect(result.success).toBe(true);
    expect(result.structured?.vendor).toBe("Coffee Shop");
    expect(sdkState.calls).toBe(0); // the AI Studio SDK is not used in Vertex mode

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/publishers/google/models/gemini-3.8-flash:generateContent"
    );
    expect(init.headers.Authorization).toBe("Bearer fake-access-token");
    const sent = JSON.parse(init.body);
    expect(sent.contents[0].parts).toEqual([
      { text: expect.stringContaining("vendor") },
      { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
    ]);
    expect(sent.generationConfig).toEqual({ temperature: 0.1, maxOutputTokens: 4096 });
  });

  it("keeps the token out of the returned error and the logs when the call fails", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "model not found in this location",
    }));

    const { scanWithGemini } = await import("./phoneScan");
    const result = await scanWithGemini({ imageBase64: "aW1hZ2U=", mimeType: "image/png" });
    expect(result.success).toBe(false);
    const everything = [result.error ?? "", ...errorSpy.mock.calls.flat(), ...warnSpy.mock.calls.flat()].join(" ");
    expect(everything).not.toContain("fake-access-token");
    expect(everything).toContain("404");
  });
});

describe("scanWithGemini in AI Studio mode", () => {
  it("keeps using the SDK with the static key and makes no fetch call", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { scanWithGemini } = await import("./phoneScan");
    const result = await scanWithGemini({
      imageBase64: "aW1hZ2U=",
      mimeType: "image/png",
      scanType: "general",
      userPrompt: "What is this?",
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.text).toBe("Coffee Shop");
    expect(sdkState.key).toBe("studio-key");
    expect(sdkState.calls).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
