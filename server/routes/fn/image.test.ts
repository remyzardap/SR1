import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";

// The engines are mocked here: this suite is about the function contract, the
// request shapes and the storage path, all of which live in server/lib/fnImage.test.ts.
const lib = vi.hoisted(() => {
  class ImageNotConfiguredError extends Error {
    constructor(public readonly label: string) {
      super(`${label} is not available right now.`);
      this.name = "ImageNotConfiguredError";
    }
  }
  class ImageUpstreamError extends Error {
    constructor(public readonly providerStatus?: number) {
      super("The image engine failed. Please try again.");
      this.name = "ImageUpstreamError";
    }
  }
  class ImageTimeoutError extends Error {
    constructor() {
      super("The image engine timed out. Please try again.");
      this.name = "ImageTimeoutError";
    }
  }
  class ImageReferenceError extends Error {
    constructor(public readonly label: string) {
      super(`${label} on the GPU cannot use reference photos yet.`);
      this.name = "ImageReferenceError";
    }
  }
  return {
    ENGINE_IDS: ["gemini", "qwen", "openai", "forge"] as const,
    QUALITIES: ["standard", "high"] as const,
    ASPECT_RATIOS: ["1:1", "16:9", "9:16", "4:3", "3:4"] as const,
    ENGINE_LABELS: { gemini: "Gemini", qwen: "Qwen", openai: "OpenAI", forge: "Stable Diffusion" } as Record<string, string>,
    ImageNotConfiguredError,
    ImageUpstreamError,
    ImageTimeoutError,
    ImageReferenceError,
    ImageBlockedError: class ImageBlockedError extends Error {},
    resolveImageEngine: vi.fn(async (o: { engine: string }) => ({ blocked: false, engine: o.engine, routed: false })),
    defaultEngine: vi.fn(() => "gemini"),
    engineAvailable: vi.fn(() => true),
    // The real module answers false for forge only; the fake follows the same rule.
    supportsReference: vi.fn((engine: string) => engine !== "forge"),
    referenceRejection: vi.fn((engine: string) => new ImageReferenceError(engine === "forge" ? "Stable Diffusion" : engine).message),
    listEngines: vi.fn(),
    generateImage: vi.fn(),
    storeImage: vi.fn(),
    logImageUsage: vi.fn(),
  };
});

// The attachment module is exercised by its own suite: here the contract of the
// function is what matters, so parsing and reading are stand-ins.
const attachments = vi.hoisted(() => ({
  parseReferenceImages: vi.fn((value: unknown) => (Array.isArray(value) ? value : [])),
  resolveAttachment: vi.fn(async (_userId: number, att: any) => ({
    filename: att.filename ?? "photo.png",
    mediaType: att.mediaType ?? "image/png",
    bytes: Buffer.from("reference bytes"),
  })),
  referenceLimits: vi.fn(() => ({ maxCount: 2, maxBytes: 8 * 1024 * 1024, imagesOnly: true })),
  hasDriveAttachment: vi.fn((atts: any[]) => atts.some((a) => a?.source === "drive")),
  requireDriveConnection: vi.fn(async () => {}),
}));

vi.mock("../../lib/fnImage", () => lib);
vi.mock("../../kemma/executors/vpsFiles", () => ({ isAdminUser: vi.fn(async () => false) }));
vi.mock("../../lib/attachments", () => attachments);

import { rateLimitConfig } from "../../config/rate-limits";
import { FnError } from "../../lib/fnErrors";
import { MAX_PROMPT_CHARS, handleImage, readJob } from "./image";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    headersSent: false,
    writableEnded: false,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      res.headersSent = true;
      return res;
    },
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
    end() {
      res.writableEnded = true;
    },
  };
  return res;
}

let userId = 1000;
const nextUserId = () => ++userId;

/** A request as the function router hands it over: the session row is already attached. */
const request = (body: unknown, id: number) =>
  ({ body, user: { id }, headers: {}, ip: "203.0.113.7", on: () => {}, app: { get: () => false } }) as never;

const generated = (overrides: Record<string, unknown> = {}) => ({
  engine: "gemini",
  model: "gemini-3.1-flash-image",
  mimeType: "image/png",
  width: 1024,
  height: 1024,
  buffer: Buffer.from("fake-bytes"),
  ...overrides,
});

const saved = new Map<string, string | undefined>();
let errorSpy: ReturnType<typeof vi.spyOn>;

/** Drives one generate call and reports the status and body, or the thrown fault. */
async function attempt(body: unknown, id: number) {
  const res = fakeRes();
  try {
    await handleImage(id, request(body, id), res as never);
    return { status: res.statusCode, body: res.body, res };
  } catch (err) {
    if (err instanceof FnError) return { status: err.status, body: { error: err.message }, res };
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ["IMAGE_ENGINE_DEFAULT"]) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  lib.engineAvailable.mockReturnValue(true);
  lib.defaultEngine.mockReturnValue("gemini");
  lib.generateImage.mockResolvedValue(generated());
  lib.storeImage.mockResolvedValue({ key: "users/7/images/image-abcd1234.png", url: "/files/users/7/images/image-abcd1234.png", sizeBytes: 10 });
  lib.logImageUsage.mockResolvedValue(undefined);
  lib.listEngines.mockReturnValue([
    {
      id: "gemini",
      label: "Gemini",
      model: "gemini-3.1-flash-image",
      qualityModel: "gemini-3-pro-image",
      available: true,
      defaultEngine: true,
      supportsReference: true,
    },
  ]);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("action engines", () => {
  it("returns the catalogue the engine layer builds", async () => {
    const id = nextUserId();
    const { status, body } = await attempt({ action: "engines" }, id);

    expect(status).toBe(200);
    expect(body).toEqual({
      engines: [
        {
          id: "gemini",
          label: "Gemini",
          model: "gemini-3.1-flash-image",
          qualityModel: "gemini-3-pro-image",
          available: true,
          defaultEngine: true,
          supportsReference: true,
        },
      ],
    });
    expect(lib.generateImage).not.toHaveBeenCalled();
  });

  it("tells the picker which engines can take a reference photo", async () => {
    lib.listEngines.mockReturnValue([
      { id: "gemini", label: "Gemini", model: "m", qualityModel: "M", available: true, defaultEngine: true, supportsReference: true },
      { id: "forge", label: "Stable Diffusion", model: "v6", qualityModel: "flux", available: true, defaultEngine: false, supportsReference: false },
    ]);
    const { body } = await attempt({ action: "engines" }, nextUserId());
    const engines = (body as { engines: { id: string; supportsReference: boolean }[] }).engines;
    expect(engines.map((entry) => [entry.id, entry.supportsReference])).toEqual([
      ["gemini", true],
      ["forge", false],
    ]);
  });

  it("is not rate limited, so a picker can be opened often", async () => {
    const id = nextUserId();
    for (let i = 0; i < rateLimitConfig.imageGenerateHourly.requests + 5; i++) {
      const { status } = await attempt({ action: "engines" }, id);
      expect(status).toBe(200);
    }
  });
});

describe("body validation", () => {
  it("takes the prompt trimmed and refuses an empty one", () => {
    expect(readJob({ action: "generate", prompt: "  a lighthouse at dawn  " }).prompt).toBe("a lighthouse at dawn");
    expect(() => readJob({ action: "generate", prompt: "   " })).toThrow(FnError);
    expect(() => readJob({ action: "generate" })).toThrow(FnError);
  });

  it("holds the 2000 character prompt ceiling", () => {
    expect(MAX_PROMPT_CHARS).toBe(2000);
    expect(readJob({ action: "generate", prompt: "x".repeat(MAX_PROMPT_CHARS) }).prompt).toHaveLength(MAX_PROMPT_CHARS);
    expect(() => readJob({ action: "generate", prompt: "x".repeat(MAX_PROMPT_CHARS + 1) })).toThrow("Prompt is too long (max 2000).");
    expect(() => readJob({ action: "generate", prompt: 42 })).toThrow("Prompt is not valid.");
  });

  it("refuses an engine, quality or ratio outside the lists", () => {
    expect(() => readJob({ action: "generate", prompt: "p", engine: "dall-e" })).toThrow("Engine is not valid.");
    expect(() => readJob({ action: "generate", prompt: "p", quality: "ultra" })).toThrow("Quality is not valid.");
    expect(() => readJob({ action: "generate", prompt: "p", aspectRatio: "3:2" })).toThrow("Aspect ratio is not valid.");
  });

  it("answers a bad body with a 400 before anything is paid for", async () => {
    const id = nextUserId();
    const { status, body } = await attempt({ action: "generate", prompt: "" }, id);

    expect(status).toBe(400);
    expect(body).toEqual({ error: "Prompt is required." });
    expect(lib.generateImage).not.toHaveBeenCalled();
  });

  it("answers an unknown action with a 400 like the other functions", async () => {
    const id = nextUserId();
    const { status, body } = await attempt({ action: "paint", prompt: "p" }, id);

    expect(status).toBe(400);
    expect(body).toEqual({ error: "Unknown action: paint" });
  });

  it("needs a JSON body object", async () => {
    await expect(handleImage(nextUserId(), request(null, 7), fakeRes() as never)).rejects.toMatchObject({ status: 400 });
  });
});

describe("defaults", () => {
  it("fills in standard quality and a square frame", () => {
    const job = readJob({ action: "generate", prompt: "a lighthouse at dawn" });
    expect(job).toEqual({ prompt: "a lighthouse at dawn", engine: "gemini", quality: "standard", aspectRatio: "1:1" });
  });

  it("takes the engine from IMAGE_ENGINE_DEFAULT when the client does not pick one", () => {
    lib.defaultEngine.mockReturnValue("qwen");
    expect(readJob({ action: "generate", prompt: "a lighthouse" }).engine).toBe("qwen");

    lib.defaultEngine.mockReturnValue("openai");
    expect(readJob({ action: "generate", prompt: "a lighthouse" }).engine).toBe("openai");
  });

  it("keeps the engine the client picked", () => {
    lib.defaultEngine.mockReturnValue("gemini");
    expect(readJob({ action: "generate", prompt: "a lighthouse", engine: "qwen", quality: "high", aspectRatio: "9:16" })).toEqual({
      prompt: "a lighthouse",
      engine: "qwen",
      quality: "high",
      aspectRatio: "9:16",
    });
  });
});

describe("availability", () => {
  it("answers 503 with the engine name when it is not configured", async () => {
    const id = nextUserId();
    lib.engineAvailable.mockImplementation((engine: string) => engine !== "qwen");

    const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse", engine: "qwen" }, id);

    expect(status).toBe(503);
    expect(body).toEqual({ error: "Qwen is not available right now." });
    expect(lib.generateImage).not.toHaveBeenCalled();
  });

  it("reports the name of the default engine when that one is missing", async () => {
    const id = nextUserId();
    lib.defaultEngine.mockReturnValue("openai");
    lib.engineAvailable.mockReturnValue(false);

    const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse" }, id);

    expect(status).toBe(503);
    expect(body).toEqual({ error: "OpenAI is not available right now." });
  });

  it("still answers 503 if the key disappears between the check and the call", async () => {
    const id = nextUserId();
    lib.generateImage.mockRejectedValue(new lib.ImageNotConfiguredError("Gemini"));

    const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse" }, id);

    expect(status).toBe(503);
    expect(body).toEqual({ error: "Gemini is not available right now." });
  });

  it("never switches to another engine", async () => {
    const id = nextUserId();
    lib.generateImage.mockRejectedValue(new lib.ImageUpstreamError(503));

    await attempt({ action: "generate", prompt: "a lighthouse", engine: "qwen" }, id);

    expect(lib.generateImage).toHaveBeenCalledTimes(1);
    expect(lib.generateImage.mock.calls[0][0]).toMatchObject({ engine: "qwen" });
  });
});

describe("rate limit", () => {
  const hourlyMax = rateLimitConfig.imageGenerateHourly.requests;
  const dailyMax = rateLimitConfig.imageGenerateDaily.requests;

  it("declares 20 an hour and 100 a day per user", () => {
    expect(hourlyMax).toBe(20);
    expect(dailyMax).toBe(100);
    expect(rateLimitConfig.imageGenerateHourly.windowMs).toBe(60 * 60 * 1000);
    expect(rateLimitConfig.imageGenerateDaily.windowMs).toBe(24 * 60 * 60 * 1000);
  });

  it("allows the hourly quota and answers 429 beyond it", async () => {
    const id = nextUserId();
    for (let i = 0; i < hourlyMax; i++) {
      const { status } = await attempt({ action: "generate", prompt: "a lighthouse" }, id);
      expect(status).toBe(200);
    }

    const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse" }, id);
    expect(status).toBe(429);
    expect(body).toEqual({ error: `You can generate ${hourlyMax} images per hour. Please try again later.` });
    expect(lib.generateImage).toHaveBeenCalledTimes(hourlyMax);
  });

  it("counts one user, not the next one", async () => {
    const first = nextUserId();
    const second = nextUserId();
    for (let i = 0; i < hourlyMax; i++) await attempt({ action: "generate", prompt: "a lighthouse" }, first);

    expect((await attempt({ action: "generate", prompt: "a lighthouse" }, first)).status).toBe(429);
    expect((await attempt({ action: "generate", prompt: "a lighthouse" }, second)).status).toBe(200);
  });

  it("closes the hour and opens the day window at 100", async () => {
    vi.useFakeTimers();
    try {
      const id = nextUserId();
      let blocked = 0;
      for (let i = 0; i < dailyMax + 1; i++) {
        if (i > 0 && i % hourlyMax === 0) vi.advanceTimersByTime(rateLimitConfig.imageGenerateHourly.windowMs);
        const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse" }, id);
        if (status === 429) {
          blocked++;
          expect(body).toEqual({ error: `You can generate ${dailyMax} images per day. Please try again tomorrow.` });
        }
      }
      expect(blocked).toBe(1);
      expect(lib.generateImage).toHaveBeenCalledTimes(dailyMax);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts an attempt that the engine could not fulfil", async () => {
    const id = nextUserId();
    lib.generateImage.mockRejectedValue(new lib.ImageUpstreamError(500));

    for (let i = 0; i < hourlyMax; i++) {
      expect((await attempt({ action: "generate", prompt: "a lighthouse" }, id)).status).toBe(502);
    }
    expect((await attempt({ action: "generate", prompt: "a lighthouse" }, id)).status).toBe(429);
  });
});

describe("a successful generation", () => {
  it("stores the bytes for the caller and returns only the engine answer fields", async () => {
    const id = nextUserId();
    const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse", aspectRatio: "16:9" }, id);

    expect(status).toBe(200);
    expect(body).toEqual({
      engine: "gemini",
      model: "gemini-3.1-flash-image",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      imageUrl: "/files/users/7/images/image-abcd1234.png",
    });
    expect(JSON.stringify(body)).not.toContain("buffer");
    expect(lib.storeImage).toHaveBeenCalledWith(id, "a lighthouse", expect.objectContaining({ engine: "gemini" }));
    expect(lib.logImageUsage).toHaveBeenCalledWith(id, expect.objectContaining({ model: "gemini-3.1-flash-image" }));
  });

  it("keeps the frame size out when the engine did not report one", async () => {
    const id = nextUserId();
    lib.generateImage.mockResolvedValue({ engine: "qwen", model: "wan2.7-image", mimeType: "image/png", buffer: Buffer.from("x") });

    const { body } = await attempt({ action: "generate", prompt: "a lighthouse", engine: "qwen" }, id);

    expect(body).not.toHaveProperty("width");
    expect(body).not.toHaveProperty("height");
  });

  it("hands the job to the engine layer exactly as validated", async () => {
    const id = nextUserId();
    await attempt({ action: "generate", prompt: "  a lighthouse  ", engine: "openai", quality: "high", aspectRatio: "3:4" }, id);

    expect(lib.generateImage).toHaveBeenCalledWith({
      prompt: "a lighthouse",
      engine: "openai",
      quality: "high",
      aspectRatio: "3:4",
      references: [],
    });
  });

  it("reads the reference photos and hands them to the engine with the job", async () => {
    const id = nextUserId();
    const sources = [
      { source: "device", filename: "a.png", mediaType: "image/png", dataUrl: "data:image/png;base64,QQ==" },
      { source: "drive", fileId: "drive-photo", filename: "b.jpg", mediaType: "image/jpeg" },
    ];
    attachments.parseReferenceImages.mockReturnValueOnce(sources);

    await attempt({ action: "generate", prompt: "same lighthouse at night", engine: "gemini", referenceImages: sources }, id);

    expect(attachments.resolveAttachment).toHaveBeenCalledTimes(2);
    const job = lib.generateImage.mock.calls[0][0];
    expect(job.engine).toBe("gemini");
    expect(job.references).toEqual([
      { filename: "a.png", mimeType: "image/png", bytes: Buffer.from("reference bytes") },
      { filename: "b.jpg", mimeType: "image/jpeg", bytes: Buffer.from("reference bytes") },
    ]);
  });

  it("asks for the Drive connection when a reference comes from Drive", async () => {
    const id = nextUserId();
    attachments.parseReferenceImages.mockReturnValueOnce([{ source: "drive", fileId: "drive-photo" }]);
    await attempt({ action: "generate", prompt: "a lighthouse", engine: "gemini", referenceImages: [{ fileId: "drive-photo" }] }, id);
    expect(attachments.requireDriveConnection).toHaveBeenCalledWith(id);
  });
});

describe("reference photos", () => {
  const device = { source: "device", filename: "a.png", mediaType: "image/png", dataUrl: "data:image/png;base64,QQ==" };

  it("answers the agreed 400 for Stable Diffusion and pays for nothing", async () => {
    const id = nextUserId();
    attachments.parseReferenceImages.mockReturnValueOnce([device]);
    const hourly = rateLimitConfig.imageGenerateHourly.requests;

    const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse", engine: "forge", referenceImages: [device] }, id);

    expect(status).toBe(400);
    expect(body).toEqual({ error: "Stable Diffusion on the GPU cannot use reference photos yet." });
    expect(lib.generateImage).not.toHaveBeenCalled();
    expect(attachments.resolveAttachment).not.toHaveBeenCalled();
    // The refused attempt did not spend the hourly budget.
    for (let i = 0; i < hourly; i++) {
      expect((await attempt({ action: "generate", prompt: "a lighthouse" }, id)).status).toBe(200);
    }
  });

  it("keeps the engine's own refusal a 400 when the list arrives anyway", async () => {
    const id = nextUserId();
    lib.supportsReference.mockReturnValueOnce(false);
    const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse", engine: "forge", referenceImages: [device] }, id);
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Stable Diffusion on the GPU cannot use reference photos yet." });
  });

  it("turns a reference that cannot be read into a 400 before the engine runs", async () => {
    const id = nextUserId();
    attachments.parseReferenceImages.mockReturnValueOnce([device]);
    attachments.resolveAttachment.mockRejectedValueOnce(new FnError(413, "a.png is over the 8 MB limit."));

    const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse", referenceImages: [device] }, id);
    expect(status).toBe(413);
    expect(body).toEqual({ error: "a.png is over the 8 MB limit." });
    expect(lib.generateImage).not.toHaveBeenCalled();
  });

  it("reads the photos only after the rate limit has agreed", async () => {
    const id = nextUserId();
    const hourly = rateLimitConfig.imageGenerateHourly.requests;
    for (let i = 0; i < hourly; i++) await attempt({ action: "generate", prompt: "a lighthouse" }, id);

    const { status } = await attempt({ action: "generate", prompt: "a lighthouse", referenceImages: [device] }, id);
    expect(status).toBe(429);
    expect(attachments.resolveAttachment).not.toHaveBeenCalled();
  });

  it("is not asked for at all when the body carries none", async () => {
    const id = nextUserId();
    await attempt({ action: "generate", prompt: "a lighthouse" }, id);
    expect(attachments.parseReferenceImages).toHaveBeenCalledWith(undefined);
    expect(attachments.resolveAttachment).not.toHaveBeenCalled();
  });
});

describe("engine faults", () => {
  it("answers a provider failure with the agreed 502 and logs only the status", async () => {
    const id = nextUserId();
    lib.generateImage.mockRejectedValue(new lib.ImageUpstreamError(429));

    const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse" }, id);

    expect(status).toBe(502);
    expect(body).toEqual({ error: "The image engine failed. Please try again." });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("status 429");
    expect(JSON.stringify(body)).not.toContain("429");
  });

  it("answers a provider deadline with a 504", async () => {
    const id = nextUserId();
    lib.generateImage.mockRejectedValue(new lib.ImageTimeoutError());

    const { status, body } = await attempt({ action: "generate", prompt: "a lighthouse" }, id);

    expect(status).toBe(504);
    expect(body).toEqual({ error: "The image engine timed out. Please try again." });
  });

  it("leaves a fault that is not the engine's for the router to answer as a 500", async () => {
    const id = nextUserId();
    lib.storeImage.mockRejectedValue(new Error("disk exploded"));

    await expect(handleImage(id, request({ action: "generate", prompt: "a lighthouse" }, id), fakeRes() as never)).rejects.toThrow("disk exploded");
  });

  it("never carries a key, a token or a hosted URL into the reply", async () => {
    const id = nextUserId();
    lib.generateImage.mockRejectedValue(new Error("connect refused to fake-litellm-key at https://signed.example.com/tmp"));

    const res = fakeRes();
    const fault = await handleImage(id, request({ action: "generate", prompt: "a lighthouse" }, id), res as never).catch((err: Error) => err.message);

    expect(fault).toContain("connect refused");
    expect(JSON.stringify(res.body)).toBe("null");
  });
});

/**
 * The rate limiter is middleware, so it is checked against a real Express
 * response: the headers it writes and the `{ error }` body the router's error
 * handler produces.
 */
describe("mounted behind a session gate", () => {
  async function withServer(id: number, run: (base: string) => Promise<void>): Promise<void> {
    const app = express();
    app.use(express.json());
    app.post("/api/fn/image", (req: Request, res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = { id };
      handleImage(id, req, res).catch(next);
    });
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof FnError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "The request failed. Please try again." });
    });

    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      await run(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  const post = async (base: string, body: unknown) => {
    const res = await fetch(`${base}/api/fn/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };

  it("serves the generated image over http", async () => {
    const id = nextUserId();
    await withServer(id, async (base) => {
      const out = await post(base, { action: "generate", prompt: "a lighthouse at dawn" });
      expect(out.status).toBe(200);
      expect(out.body).toEqual({
        engine: "gemini",
        model: "gemini-3.1-flash-image",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        imageUrl: "/files/users/7/images/image-abcd1234.png",
      });
      expect(out.headers.get("ratelimit-policy")).toBeNull();
    });
  });

  it("answers the 21st image of the hour with a 429 and a { error } body", async () => {
    const id = nextUserId();
    await withServer(id, async (base) => {
      for (let i = 0; i < rateLimitConfig.imageGenerateHourly.requests; i++) {
        expect((await post(base, { action: "generate", prompt: "a lighthouse" })).status).toBe(200);
      }
      const blocked = await post(base, { action: "generate", prompt: "a lighthouse" });
      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual({ error: `You can generate ${rateLimitConfig.imageGenerateHourly.requests} images per hour. Please try again later.` });
      expect(lib.generateImage).toHaveBeenCalledTimes(rateLimitConfig.imageGenerateHourly.requests);
    });
  });

  it("answers a body the client should not have sent with a 400 and { error }", async () => {
    const id = nextUserId();
    await withServer(id, async (base) => {
      const out = await post(base, { action: "generate", prompt: "a lighthouse", engine: "dall-e" });
      expect(out.status).toBe(400);
      expect(out.body).toEqual({ error: "Engine is not valid." });
    });
  });
});
