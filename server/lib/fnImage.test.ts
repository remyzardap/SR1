import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// google-auth-library is mocked the way server/core/vertexAuth.test.ts mocks it:
// no network, obvious fake token, no real credentials anywhere in this suite.
const auth = vi.hoisted(() => ({ token: "fake-vertex-token", projectId: "adc-project-123" }));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: auth.token }) };
    }
    async getProjectId() {
      return auth.projectId;
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

// Hostname answers for the SSRF guard in server/lib/fnFetch.ts. Fake too.
const dnsState = vi.hoisted(() => ({ addresses: [{ address: "93.184.216.34" }] }));

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => dnsState.addresses),
}));

const storage = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("../storageAdapter", () => ({
  getStorageAdapter: () => ({ put: storage.put }),
}));

const dbState = vi.hoisted(() => ({ available: true, rows: [] as unknown[], fail: false }));
vi.mock("../db", () => ({
  createFile: vi.fn(async (data: unknown) => {
    if (dbState.fail) throw new Error("Database not available");
    dbState.rows.push(data);
  }),
  getDb: vi.fn(async () =>
    dbState.available
      ? {
          insert: () => ({
            values: async (row: unknown) => {
              if (dbState.fail) throw new Error("insert was refused");
              dbState.rows.push(row);
            },
          }),
        }
      : null
  ),
}));

import {
  ASPECT_RATIOS,
  ENGINE_IDS,
  MAX_IMAGE_BYTES,
  OPENAI_SIZES,
  PROVIDER_TIMEOUTS_MS,
  QUALITIES,
  QWEN_SIZES,
  ImageNotConfiguredError,
  ImageTimeoutError,
  ImageUpstreamError,
  aiStudioImageEndpoint,
  defaultEngine,
  downloadImage,
  engineAvailable,
  geminiImageBody,
  generateImage,
  imageDimensions,
  imageModel,
  listEngines,
  logImageUsage,
  openaiImageEndpoint,
  qwenImageEndpoint,
  roughImageCostUsd,
  storeImage,
  vertexImageEndpoint,
  type GeneratedImage,
  type ImageJob,
} from "./fnImage";

const ENV_NAMES = [
  "IMAGE_ENGINE_DEFAULT",
  "KEMMA_MODEL_IMAGE",
  "KEMMA_MODEL_IMAGE_PRO",
  "QWEN_IMAGE_MODEL",
  "QWEN_IMAGE_MODEL_PRO",
  "OPENAI_IMAGE_MODEL",
  "GEMINI_BACKEND",
  "GEMINI_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "VERTEX_PROJECT",
  "VERTEX_LOCATION",
  "QWEN_API_KEY",
  "QWEN_BASE_URL",
  "LITELLM_BASE_URL",
  "LITELLM_API_KEY",
  "KOBOILLM_API_KEY",
];

const FAKE_GOOGLE_KEY = "fake-google-api-key";
const FAKE_QWEN_KEY = "fake-qwen-key";
const FAKE_LITELLM_KEY = "fake-litellm-key";
const CRED_PATH = "/tmp/private/service-account.json";

let fetchMock: ReturnType<typeof vi.fn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
const saved = new Map<string, string | undefined>();

/** Not a real PNG: the header carries the two numbers the reader looks for. */
function pngBytes(width = 1024, height = 1024): Buffer {
  const buffer = Buffer.alloc(32);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpegBytes(width = 768, height = 1376): Buffer {
  const buffer = Buffer.alloc(32);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  buffer[3] = 0xc0; // SOF0
  buffer.writeUInt16BE(11, 4); // segment length
  buffer[6] = 8; // sample precision
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  return buffer;
}

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function binaryResponse(bytes: Buffer, contentType = "image/png", declaredLength = bytes.length) {
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => {
        let sent = false;
        return {
          read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: new Uint8Array(bytes) })),
          cancel: async () => {},
        };
      },
      cancel: async () => {},
    },
    headers: {
      get: (name: string) => {
        const key = name.toLowerCase();
        if (key === "content-type") return contentType;
        if (key === "content-length") return String(declaredLength);
        return null;
      },
    },
  };
}

/** One generateContent answer with an inline image, the shape both backends use. */
const geminiAnswer = (bytes = pngBytes(), mimeType = "image/png") => ({
  candidates: [
    {
      content: {
        parts: [{ text: "here you are" }, { inlineData: { mimeType, data: bytes.toString("base64") } }],
      },
    },
  ],
});

const wanAnswer = (url = "https://cdn.example.com/tmp/a.png") => ({
  output: { choices: [{ message: { content: [{ image: url }] } }] },
});

const job = (overrides: Partial<ImageJob> = {}): ImageJob => ({
  prompt: "a lighthouse at dawn",
  engine: "gemini",
  quality: "standard",
  aspectRatio: "1:1",
  ...overrides,
});

const image = (buffer: Buffer, overrides: Partial<GeneratedImage> = {}): GeneratedImage => ({
  engine: "gemini",
  model: "gemini-3.1-flash-image",
  mimeType: "image/png",
  width: 1024,
  height: 1024,
  buffer,
  ...overrides,
});

const callUrl = (index = 0) => (fetchMock.mock.calls[index] as [string])[0];
const callInit = (index = 0) => (fetchMock.mock.calls[index] as [string, { headers: Record<string, string>; body: string }])[1];
const sentBody = (index = 0) => JSON.parse(callInit(index).body);
const logged = () => [...errorSpy.mock.calls, ...warnSpy.mock.calls].map((call) => String(call[0])).join(" ");

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  auth.token = "fake-vertex-token";
  auth.projectId = "adc-project-123";
  fsState.readable = true;
  dnsState.addresses = [{ address: "93.184.216.34" }];
  dbState.available = true;
  dbState.rows = [];
  dbState.fail = false;
  storage.put.mockImplementation(async (key: string, data: Buffer) => ({
    key,
    url: `/files/${key}`,
    sizeBytes: data.length,
    provider: "local",
  }));
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("models, qualities and ratios", () => {
  it("uses the documented defaults per engine and quality", () => {
    expect(imageModel("gemini", "standard")).toBe("gemini-3.1-flash-image");
    expect(imageModel("gemini", "high")).toBe("gemini-3-pro-image");
    expect(imageModel("qwen", "standard")).toBe("wan2.7-image");
    expect(imageModel("qwen", "high")).toBe("wan2.7-image-pro");
    expect(imageModel("openai", "standard")).toBe("gpt-image-2");
    expect(imageModel("openai", "high")).toBe("gpt-image-2");
  });

  it("reads its own env vars at call time", () => {
    process.env.KEMMA_MODEL_IMAGE = "other-flash";
    process.env.QWEN_IMAGE_MODEL_PRO = "other-wan-pro";
    process.env.OPENAI_IMAGE_MODEL = "other-gpt";
    expect(imageModel("gemini", "standard")).toBe("other-flash");
    expect(imageModel("qwen", "high")).toBe("other-wan-pro");
    expect(imageModel("openai", "standard")).toBe("other-gpt");
  });

  it("offers exactly the engines and options the function accepts", () => {
    expect(ENGINE_IDS).toEqual(["gemini", "qwen", "openai"]);
    expect(QUALITIES).toEqual(["standard", "high"]);
    expect(ASPECT_RATIOS).toEqual(["1:1", "16:9", "9:16", "4:3", "3:4"]);
  });

  it("gives Gemini the longer deadline the pro model needs and 60 s to the others", () => {
    expect(PROVIDER_TIMEOUTS_MS).toEqual({ gemini: 90000, qwen: 60000, openai: 60000 });
  });

  it("passes that deadline to the provider call", async () => {
    const signals = vi.spyOn(AbortSignal, "timeout");
    try {
      process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;
      process.env.QWEN_API_KEY = FAKE_QWEN_KEY;
      fetchMock.mockResolvedValueOnce(jsonResponse(geminiAnswer()));
      await generateImage(job());
      expect(signals).toHaveBeenLastCalledWith(90000);

      fetchMock.mockResolvedValueOnce(jsonResponse(wanAnswer())).mockResolvedValueOnce(binaryResponse(pngBytes()));
      await generateImage(job({ engine: "qwen" }));
      expect(signals).toHaveBeenLastCalledWith(60000);
    } finally {
      signals.mockRestore();
    }
  });

  it("keeps each size map complete in one constant", () => {
    expect(QWEN_SIZES).toEqual({ "1:1": "1024*1024", "16:9": "1280*720", "9:16": "720*1280", "4:3": "1024*768", "3:4": "768*1024" });
    expect(OPENAI_SIZES).toEqual({ "1:1": "1024x1024", "16:9": "1536x1024", "9:16": "1024x1536", "4:3": "1536x1024", "3:4": "1024x1536" });
    for (const ratio of ASPECT_RATIOS) {
      expect(QWEN_SIZES[ratio]).toBeTruthy();
      expect(OPENAI_SIZES[ratio]).toBeTruthy();
    }
  });
});

describe("availability and the engines list", () => {
  it("reports nothing available on a bare environment", () => {
    expect(engineAvailable("gemini")).toBe(false);
    expect(engineAvailable("qwen")).toBe(false);
    expect(engineAvailable("openai")).toBe(false);
  });

  it("counts a key, or readable Vertex credentials, as gemini being configured", () => {
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;
    expect(engineAvailable("gemini")).toBe(true);

    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = CRED_PATH;
    expect(engineAvailable("gemini")).toBe(true);

    fsState.readable = false;
    expect(engineAvailable("gemini")).toBe(false);
  });

  it("needs the qwen key, and either gateway key for openai", () => {
    expect(engineAvailable("qwen")).toBe(false);
    process.env.QWEN_API_KEY = FAKE_QWEN_KEY;
    expect(engineAvailable("qwen")).toBe(true);

    expect(engineAvailable("openai")).toBe(false);
    process.env.KOBOILLM_API_KEY = FAKE_LITELLM_KEY;
    expect(engineAvailable("openai")).toBe(true);
    delete process.env.KOBOILLM_API_KEY;
    process.env.LITELLM_API_KEY = FAKE_LITELLM_KEY;
    expect(engineAvailable("openai")).toBe(true);
  });

  it("takes the default engine from IMAGE_ENGINE_DEFAULT and ignores an unknown value", () => {
    expect(defaultEngine()).toBe("gemini");
    process.env.IMAGE_ENGINE_DEFAULT = "qwen";
    expect(defaultEngine()).toBe("qwen");
    process.env.IMAGE_ENGINE_DEFAULT = "Midjourney";
    expect(defaultEngine()).toBe("gemini");
  });

  it("lists id, label, models, availability and the default flag for all three", () => {
    process.env.IMAGE_ENGINE_DEFAULT = "qwen";
    process.env.QWEN_API_KEY = FAKE_QWEN_KEY;
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;

    const engines = listEngines();
    expect(engines.map((entry) => entry.id)).toEqual(["gemini", "qwen", "openai"]);
    expect(engines.map((entry) => entry.label)).toEqual(["Gemini", "Qwen", "OpenAI"]);
    expect(engines[0]).toEqual({
      id: "gemini",
      label: "Gemini",
      model: "gemini-3.1-flash-image",
      qualityModel: "gemini-3-pro-image",
      available: true,
      defaultEngine: false,
    });
    expect(engines.filter((entry) => entry.defaultEngine).map((entry) => entry.id)).toEqual(["qwen"]);
    expect(engines[2]).toMatchObject({ id: "openai", available: false, model: "gpt-image-2", qualityModel: "gpt-image-2" });
  });

  it("carries no key, no hosted URL and no path in the listing", () => {
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;
    process.env.QWEN_API_KEY = FAKE_QWEN_KEY;
    process.env.LITELLM_API_KEY = FAKE_LITELLM_KEY;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = CRED_PATH;
    process.env.QWEN_BASE_URL = "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1";

    const json = JSON.stringify(listEngines());
    for (const secret of [FAKE_GOOGLE_KEY, FAKE_QWEN_KEY, FAKE_LITELLM_KEY, CRED_PATH, "token-plan", "koboillm", "https://"]) {
      expect(json).not.toContain(secret);
    }
  });
});

describe("endpoints and bodies", () => {
  it("always sends gemini image calls to Vertex global, never to VERTEX_LOCATION", () => {
    process.env.VERTEX_LOCATION = "us-central1";
    expect(vertexImageEndpoint("p1", "gemini-3.1-flash-image")).toBe(
      "https://aiplatform.googleapis.com/v1/projects/p1/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent"
    );
    expect(vertexImageEndpoint("p1", "google/gemini-3-pro-image")).toContain("/locations/global/");
  });

  it("builds the AI Studio generateContent URL", () => {
    expect(aiStudioImageEndpoint("gemini-3.1-flash-image")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent"
    );
  });

  it("asks gemini for an image part with the chosen aspect ratio", () => {
    expect(geminiImageBody("a lighthouse at dawn", "9:16")).toEqual({
      contents: [{ role: "user", parts: [{ text: "a lighthouse at dawn" }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16" } },
    });
  });

  it("takes the native qwen route off the origin of QWEN_BASE_URL", () => {
    expect(qwenImageEndpoint()).toBe("https://token-plan.maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation");
    process.env.QWEN_BASE_URL = "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1";
    expect(qwenImageEndpoint()).toBe("https://token-plan.maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation");
    process.env.QWEN_BASE_URL = "not a url";
    expect(qwenImageEndpoint()).toBe("https://token-plan.maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation");
  });

  it("puts the openai images route on the gateway base, slash or no slash", () => {
    expect(openaiImageEndpoint()).toBe("https://api.koboillm.com/v1/images/generations");
    process.env.LITELLM_BASE_URL = "https://gateway.example.com/v1/";
    expect(openaiImageEndpoint()).toBe("https://gateway.example.com/v1/images/generations");
  });
});

describe("generateImage with gemini", () => {
  it("calls Vertex global with a bearer token and returns the inline image", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = CRED_PATH;
    process.env.VERTEX_PROJECT = "env-project";
    process.env.VERTEX_LOCATION = "us-central1";
    fetchMock.mockResolvedValue(jsonResponse(geminiAnswer(pngBytes(768, 1376))));

    const out = await generateImage(job({ aspectRatio: "9:16" }));

    expect(callUrl()).toBe(
      "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent"
    );
    expect(callInit().headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer fake-vertex-token" });
    expect(sentBody()).toEqual({
      contents: [{ role: "user", parts: [{ text: "a lighthouse at dawn" }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16" } },
    });
    expect(callInit().signal).toBeTruthy();
    expect(out).toMatchObject({ engine: "gemini", model: "gemini-3.1-flash-image", mimeType: "image/png", width: 768, height: 1376 });
    expect(out.buffer).toEqual(pngBytes(768, 1376));
  });

  it("uses the pro model when the quality is high", async () => {
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;
    fetchMock.mockResolvedValue(jsonResponse(geminiAnswer()));

    const out = await generateImage(job({ quality: "high" }));

    expect(callUrl()).toContain("/models/gemini-3-pro-image:generateContent");
    expect(out.model).toBe("gemini-3-pro-image");
  });

  it("calls AI Studio with the key header when Vertex is off", async () => {
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;
    fetchMock.mockResolvedValue(jsonResponse(geminiAnswer()));

    await generateImage(job());

    expect(callUrl()).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent");
    expect(callInit().headers["x-goog-api-key"]).toBe(FAKE_GOOGLE_KEY);
    expect(callInit().headers.Authorization).toBeUndefined();
  });

  it("takes the image from any part and defaults the mime type", async () => {
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;
    fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { data: pngBytes(8, 9).toString("base64") } }] } }] }));

    const out = await generateImage(job());
    expect(out.mimeType).toBe("image/png");
    expect(out.width).toBe(8);
    expect(out.height).toBe(9);
  });

  it("treats an answer with no image part as an engine failure", async () => {
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;
    fetchMock.mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: "I cannot draw that." }] } }] }));

    await expect(generateImage(job())).rejects.toBeInstanceOf(ImageUpstreamError);
  });
});

describe("generateImage with qwen", () => {
  it("posts the native body and downloads the hosted image it hands back", async () => {
    process.env.QWEN_API_KEY = FAKE_QWEN_KEY;
    const bytes = pngBytes();
    fetchMock.mockResolvedValueOnce(jsonResponse(wanAnswer())).mockResolvedValueOnce(binaryResponse(bytes));

    const out = await generateImage(job({ engine: "qwen" }));

    expect(callUrl()).toBe("https://token-plan.maas.qwencloudapi.com/api/v1/services/aigc/multimodal-generation/generation");
    expect(callInit().headers).toEqual({ "Content-Type": "application/json", Authorization: `Bearer ${FAKE_QWEN_KEY}` });
    expect(sentBody()).toEqual({
      model: "wan2.7-image",
      input: { messages: [{ role: "user", content: [{ text: "a lighthouse at dawn" }] }] },
      parameters: { size: "1024*1024", n: 1, watermark: false },
    });
    expect(callUrl(1)).toBe("https://cdn.example.com/tmp/a.png");
    expect(out.buffer).toEqual(bytes);
    expect(JSON.stringify(out)).not.toContain("cdn.example.com");
    expect(out).toMatchObject({ engine: "qwen", model: "wan2.7-image", mimeType: "image/png" });
  });

  it("maps every aspect ratio through the one size constant", async () => {
    process.env.QWEN_API_KEY = FAKE_QWEN_KEY;
    for (const ratio of ASPECT_RATIOS) {
      fetchMock.mockResolvedValueOnce(jsonResponse(wanAnswer())).mockResolvedValueOnce(binaryResponse(pngBytes()));
      await generateImage(job({ engine: "qwen", aspectRatio: ratio }));
    }
    const sizes = fetchMock.mock.calls
      .filter((call) => String(call[0]).includes("multimodal-generation"))
      .map((call) => JSON.parse((call[1] as { body: string }).body).parameters.size);
    expect(sizes).toEqual(ASPECT_RATIOS.map((ratio) => QWEN_SIZES[ratio]));
  });

  it("refuses a hosted URL that points at a private address, without fetching it", async () => {
    process.env.QWEN_API_KEY = FAKE_QWEN_KEY;
    fetchMock.mockResolvedValueOnce(jsonResponse(wanAnswer("https://169.254.169.254/latest/meta-data/")));

    await expect(generateImage(job({ engine: "qwen" }))).rejects.toBeInstanceOf(ImageUpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails when the answer carries no image, and keeps the provider detail out", async () => {
    process.env.QWEN_API_KEY = FAKE_QWEN_KEY;
    fetchMock.mockResolvedValueOnce(jsonResponse({ output: { code: "Throttling", message: "quota exceeded" } }));

    const err = await generateImage(job({ engine: "qwen" })).catch((fault: Error) => fault);
    expect(err).toBeInstanceOf(ImageUpstreamError);
    expect(err.message).not.toContain("quota exceeded");
    expect(logged()).not.toContain("quota exceeded");
  });
});

describe("generateImage with openai", () => {
  it("posts to the gateway images route with the gateway key and user agent", async () => {
    process.env.KOBOILLM_API_KEY = FAKE_LITELLM_KEY;
    const bytes = pngBytes();
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: bytes.toString("base64") }] }));

    const out = await generateImage(job({ engine: "openai", aspectRatio: "16:9" }));

    expect(callUrl()).toBe("https://api.koboillm.com/v1/images/generations");
    expect(callInit().headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${FAKE_LITELLM_KEY}`,
      "User-Agent": "sutaeru/1.0",
    });
    expect(sentBody()).toEqual({ model: "gpt-image-2", prompt: "a lighthouse at dawn", n: 1, size: "1536x1024" });
    expect(out.buffer).toEqual(bytes);
    expect(out.mimeType).toBe("image/png");
  });

  it("downloads a url answer through the same guard", async () => {
    process.env.LITELLM_API_KEY = FAKE_LITELLM_KEY;
    const bytes = jpegBytes();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: "https://cdn.example.com/out.jpg" }] }))
      .mockResolvedValueOnce(binaryResponse(bytes, "image/jpeg"));

    const out = await generateImage(job({ engine: "openai" }));

    expect(callUrl(1)).toBe("https://cdn.example.com/out.jpg");
    expect(out.mimeType).toBe("image/jpeg");
    expect(out.width).toBe(768);
    expect(out.height).toBe(1376);
  });

  it("maps each ratio onto one of the three sizes the model serves", async () => {
    process.env.LITELLM_API_KEY = FAKE_LITELLM_KEY;
    for (const ratio of ASPECT_RATIOS) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: pngBytes().toString("base64") }] }));
      await generateImage(job({ engine: "openai", aspectRatio: ratio }));
    }
    const sizes = fetchMock.mock.calls.map((call) => JSON.parse((call[1] as { body: string }).body).size);
    expect(sizes).toEqual(ASPECT_RATIOS.map((ratio) => OPENAI_SIZES[ratio]));
    expect(sizes).toEqual(["1024x1024", "1536x1024", "1024x1536", "1536x1024", "1024x1536"]);
  });

  it("fails when the answer carries neither bytes nor a URL", async () => {
    process.env.LITELLM_API_KEY = FAKE_LITELLM_KEY;
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await expect(generateImage(job({ engine: "openai" }))).rejects.toBeInstanceOf(ImageUpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("engine choice is respected", () => {
  it("asks for the credential of the chosen engine instead of switching", async () => {
    process.env.QWEN_API_KEY = FAKE_QWEN_KEY;
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;

    await expect(generateImage(job({ engine: "openai" }))).rejects.toBeInstanceOf(ImageNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not try another engine after the chosen one fails", async () => {
    process.env.QWEN_API_KEY = FAKE_QWEN_KEY;
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;
    process.env.LITELLM_API_KEY = FAKE_LITELLM_KEY;
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 500));

    await expect(generateImage(job({ engine: "qwen" }))).rejects.toBeInstanceOf(ImageUpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callUrl()).toContain("token-plan.maas.qwencloudapi.com");
  });
});

describe("provider faults", () => {
  it("keeps the upstream body out of the error and the log", async () => {
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: `blocked ${FAKE_GOOGLE_KEY}` } }),
      text: async () => `blocked ${FAKE_GOOGLE_KEY}`,
    });

    const fault = await generateImage(job()).catch((err: ImageUpstreamError) => err);
    expect(fault).toBeInstanceOf(ImageUpstreamError);
    expect((fault as ImageUpstreamError).providerStatus).toBe(400);
    expect(fault.message).toBe("The image engine failed. Please try again.");
    expect(fault.message).not.toContain(FAKE_GOOGLE_KEY);
    expect(logged()).not.toContain(FAKE_GOOGLE_KEY);
  });

  it("answers a provider deadline with the timeout fault", async () => {
    process.env.GEMINI_API_KEY = FAKE_GOOGLE_KEY;
    fetchMock.mockRejectedValue(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));

    await expect(generateImage(job())).rejects.toBeInstanceOf(ImageTimeoutError);
  });

  it("treats a Vertex credential problem as an engine failure, not a leak", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = CRED_PATH;
    auth.token = "";

    const fault = await generateImage(job()).catch((err: Error) => err);
    expect(fault).toBeInstanceOf(ImageUpstreamError);
    expect(fault.message).not.toContain(CRED_PATH);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the gateway key out of a thrown error", async () => {
    process.env.LITELLM_API_KEY = FAKE_LITELLM_KEY;
    fetchMock.mockRejectedValue(new Error(`connect failed with ${FAKE_LITELLM_KEY}`));

    const fault = await generateImage(job({ engine: "openai" })).catch((err: Error) => err);
    expect(fault).toBeInstanceOf(ImageUpstreamError);
    expect(fault.message).not.toContain(FAKE_LITELLM_KEY);
  });
});

describe("downloadImage", () => {
  it("accepts https to a public address only", async () => {
    fetchMock.mockResolvedValue(binaryResponse(pngBytes()));
    const out = await downloadImage("https://cdn.example.com/a.png");
    expect(out.buffer).toEqual(pngBytes());
    expect(out.mimeType).toBe("image/png");

    await expect(downloadImage("http://cdn.example.com/a.png")).rejects.toBeInstanceOf(ImageUpstreamError);
    await expect(downloadImage("https://127.0.0.1:8080/a.png")).rejects.toBeInstanceOf(ImageUpstreamError);
    await expect(downloadImage("https://localhost/a.png")).rejects.toBeInstanceOf(ImageUpstreamError);
    await expect(downloadImage("not a url")).rejects.toBeInstanceOf(ImageUpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a host that resolves to a private address", async () => {
    dnsState.addresses = [{ address: "10.0.0.8" }];
    await expect(downloadImage("https://cdn.example.com/a.png")).rejects.toBeInstanceOf(ImageUpstreamError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("holds the 15 MB cap", async () => {
    fetchMock.mockResolvedValue(binaryResponse(Buffer.alloc(16), "image/png", MAX_IMAGE_BYTES + 1));
    await expect(downloadImage("https://cdn.example.com/big.png")).rejects.toBeInstanceOf(ImageUpstreamError);
  });

  it("gives up on a download that outlives its own deadline", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockReturnValue(new Promise(() => {}));
      const pending = downloadImage("https://cdn.example.com/slow.png");
      const settled = pending.catch((fault: unknown) => fault);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await settled).toBeInstanceOf(ImageTimeoutError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects empty bytes rather than storing nothing", async () => {
    process.env.LITELLM_API_KEY = FAKE_LITELLM_KEY;
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: "" }] }));
    await expect(generateImage(job({ engine: "openai" }))).rejects.toBeInstanceOf(ImageUpstreamError);
  });
});

describe("imageDimensions", () => {
  it("reads PNG and JPEG headers", () => {
    expect(imageDimensions(pngBytes(1024, 1024))).toEqual({ width: 1024, height: 1024 });
    expect(imageDimensions(jpegBytes())).toEqual({ width: 768, height: 1376 });
  });

  it("says nothing about a format it does not know", () => {
    expect(imageDimensions(Buffer.from("GIF89a              "))).toEqual({});
    expect(imageDimensions(Buffer.alloc(0))).toEqual({});
  });
});

describe("storeImage", () => {
  it("puts the bytes under the caller's own images path and files the owner row", async () => {
    const bytes = pngBytes();
    const stored = await storeImage(7, "a lighthouse at dawn", image(bytes));

    expect(storage.put).toHaveBeenCalledTimes(1);
    const [key, buffer, mimeType, meta] = storage.put.mock.calls[0] as [string, Buffer, string, { userId: number; name: string }];
    expect(key).toMatch(/^users\/7\/images\/image-[0-9a-f]{8}\.png$/);
    expect(buffer).toEqual(bytes);
    expect(mimeType).toBe("image/png");
    expect(meta).toEqual({ userId: 7, name: expect.any(String) });
    expect(stored).toEqual({ key, url: `/files/${key}`, sizeBytes: bytes.length });

    expect(dbState.rows).toHaveLength(1);
    expect(dbState.rows[0]).toMatchObject({
      userId: 7,
      kind: "image",
      format: "md",
      fileKey: key,
      fileUrl: `/files/${key}`,
      mimeType: "image/png",
      fileSizeBytes: bytes.length,
      originalPrompt: "a lighthouse at dawn",
      storageProvider: "local",
    });
  });

  it("keeps the extension honest for the mime type it was given", async () => {
    await storeImage(7, "prompt", image(jpegBytes(), { mimeType: "image/jpeg" }));
    expect(storage.put.mock.calls[0][0]).toMatch(/\.jpg$/);

    await storeImage(7, "prompt", image(pngBytes(), { mimeType: "image/webp" }));
    expect(storage.put.mock.calls[1][0]).toMatch(/\.webp$/);
  });

  it("keeps a storage fault a fault", async () => {
    dbState.fail = true;
    await expect(storeImage(7, "prompt", image(pngBytes()))).rejects.toThrow("Database not available");
  });
});

describe("logImageUsage", () => {
  it("records the engine, the model, no tokens and the rough per-image cost", async () => {
    await logImageUsage(7, image(pngBytes(), { model: "gemini-3-pro-image" }));

    expect(dbState.rows).toHaveLength(1);
    expect(dbState.rows[0]).toEqual({
      userId: 7,
      sessionId: null,
      reportId: null,
      provider: "gemini",
      model: "gemini-3-pro-image",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: "0.13",
      purpose: "image_generate",
    });
  });

  it("estimates by the model family when the exact id is not in the table", () => {
    expect(roughImageCostUsd("gemini-3.1-flash-image")).toBe(0.04);
    expect(roughImageCostUsd("gemini-3-pro-image")).toBe(0.13);
    expect(roughImageCostUsd("wan2.7-image")).toBe(0.05);
    expect(roughImageCostUsd("wan2.7-image-pro")).toBe(0.05);
    expect(roughImageCostUsd("gpt-image-2")).toBe(0.06);
    expect(roughImageCostUsd("mystery-model")).toBe(0);
  });

  it("never fails a request over logging", async () => {
    dbState.available = false;
    await expect(logImageUsage(7, image(pngBytes(), { engine: "qwen", model: "wan2.7-image" }))).resolves.toBeUndefined();

    dbState.available = true;
    dbState.fail = true;
    await expect(logImageUsage(7, image(pngBytes(), { engine: "qwen", model: "wan2.7-image" }))).resolves.toBeUndefined();
    expect(logged()).toContain("failed to log usage");
  });

  it("logs nothing when there is no database", async () => {
    dbState.available = false;
    await logImageUsage(7, image(pngBytes()));
    expect(dbState.rows).toHaveLength(0);
  });
});
