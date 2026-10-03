import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const storage = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("../storageAdapter", () => ({
  getStorageAdapter: () => ({ put: storage.put }),
}));

const dbState = vi.hoisted(() => ({ available: true, rows: [] as unknown[], fail: false }));
vi.mock("../db", () => ({
  createFile: vi.fn(async (data: unknown) => {
    if (dbState.fail) throw new Error("Database not available");
    dbState.rows.push(data);
    return { id: 42, ...((data as object) || {}) };
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

const jobsState = vi.hoisted(() => ({ enqueued: [] as any[], handler: null as any }));
vi.mock("../core/jobs", () => ({
  registerJob: vi.fn((name: string, handler: any) => {
    jobsState.handler = handler;
  }),
  enqueueJob: vi.fn(async (name: string, data: any) => {
    jobsState.enqueued.push({ name, data });
    return "boss-job-123";
  }),
}));

import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATION_LIMITS,
  VIDEO_ENGINE_IDS,
  VIDEO_ENGINE_LABELS,
  VIDEO_QUALITIES,
  VideoNotConfiguredError,
  VideoReferenceError,
  VideoSafetyError,
  VideoTimeoutError,
  VideoUpstreamError,
  assertVideoPromptSafe,
  cancelVideoJob,
  clampDuration,
  defaultVideoEngine,
  engineAvailable,
  generateVideo,
  getVideoJob,
  isMp4,
  listVideoEngines,
  logVideoUsage,
  queueVideoJob,
  resolveVideoEngine,
  roughVideoCostUsd,
  storeVideo,
  supportsVideoReference,
  videoModel,
  type VideoJobParams,
} from "./fnVideo";

const ENV_NAMES = [
  "VIDEO_ENGINE_DEFAULT",
  "KEMMA_MODEL_VIDEO",
  "KEMMA_MODEL_VIDEO_PRO",
  "QWEN_VIDEO_MODEL",
  "QWEN_VIDEO_MODEL_PRO",
  "OPENAI_VIDEO_MODEL",
  "OPENAI_VIDEO_MODEL_PRO",
  "FORGE_VIDEO_MODEL",
  "FORGE_VIDEO_MODEL_PRO",
  "OPENAI_VIDEO_API_KEY",
  "OPENAI_VIDEO_BASE_URL",
  "QWEN_VIDEO_API_KEY",
  "QWEN_VIDEO_BASE_URL",
  "FORGE_MANAGER_URL",
  "FORGE_MANAGER_TOKEN",
  "GEMINI_API_KEY",
  "GEMINI_BACKEND",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "QWEN_API_KEY",
  "LITELLM_API_KEY",
];

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const n of ENV_NAMES) savedEnv[n] = process.env[n];
  dbState.rows = [];
  jobsState.enqueued = [];
  storage.put.mockReset();
  storage.put.mockResolvedValue({
    key: "users/7/videos/video-123.mp4",
    url: "https://example.com/files/users/7/videos/video-123.mp4",
    sizeBytes: 1024,
    provider: "local",
  });
});

afterEach(() => {
  for (const n of ENV_NAMES) {
    if (savedEnv[n] === undefined) delete process.env[n];
    else process.env[n] = savedEnv[n];
  }
  vi.restoreAllMocks();
});

describe("fnVideo duration clamping", () => {
  it("clamps Gemini duration between 5 and 8 seconds", () => {
    expect(clampDuration("gemini", undefined)).toBe(5);
    expect(clampDuration("gemini", 2)).toBe(5);
    expect(clampDuration("gemini", 6)).toBe(6);
    expect(clampDuration("gemini", 8)).toBe(8);
    expect(clampDuration("gemini", 12)).toBe(8);
  });

  it("clamps Qwen duration to 5 seconds", () => {
    expect(clampDuration("qwen", 3)).toBe(5);
    expect(clampDuration("qwen", 5)).toBe(5);
    expect(clampDuration("qwen", 10)).toBe(5);
  });

  it("clamps OpenAI duration between 5 and 20 seconds", () => {
    expect(clampDuration("openai", 2)).toBe(5);
    expect(clampDuration("openai", 10)).toBe(10);
    expect(clampDuration("openai", 25)).toBe(20);
  });

  it("clamps Forge duration between 2 and 5 seconds", () => {
    expect(clampDuration("forge", undefined)).toBe(3);
    expect(clampDuration("forge", 1)).toBe(2);
    expect(clampDuration("forge", 4)).toBe(4);
    expect(clampDuration("forge", 10)).toBe(5);
  });
});

describe("fnVideo engine availability", () => {
  it("gemini is available with GEMINI_API_KEY", () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_BACKEND;
    expect(engineAvailable("gemini")).toBe(true);
  });

  it("openai is unavailable on LiteLLM gateway without dedicated key", () => {
    process.env.LITELLM_API_KEY = "gateway-key";
    delete process.env.OPENAI_VIDEO_API_KEY;
    expect(engineAvailable("openai")).toBe(false);
  });

  it("openai is available with OPENAI_VIDEO_API_KEY", () => {
    process.env.OPENAI_VIDEO_API_KEY = "sk-video-key";
    expect(engineAvailable("openai")).toBe(true);
  });

  it("qwen is unavailable with token plan key alone", () => {
    process.env.QWEN_API_KEY = "token-plan-key";
    delete process.env.QWEN_VIDEO_API_KEY;
    expect(engineAvailable("qwen")).toBe(false);
  });

  it("qwen is available with QWEN_VIDEO_API_KEY", () => {
    process.env.QWEN_VIDEO_API_KEY = "dashscope-video-key";
    expect(engineAvailable("qwen")).toBe(true);
  });

  it("forge is available when gpu manager url and token are set", () => {
    delete process.env.FORGE_MANAGER_URL;
    delete process.env.FORGE_MANAGER_TOKEN;
    expect(engineAvailable("forge")).toBe(false);

    process.env.FORGE_MANAGER_URL = "http://172.18.0.1:8788";
    process.env.FORGE_MANAGER_TOKEN = "secret-token";
    expect(engineAvailable("forge")).toBe(true);
  });
});

describe("fnVideo default engine & selection", () => {
  it("falls back to gemini when gemini is available", () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.VIDEO_ENGINE_DEFAULT;
    delete process.env.OPENAI_VIDEO_API_KEY;
    delete process.env.QWEN_VIDEO_API_KEY;
    delete process.env.FORGE_MANAGER_URL;

    expect(defaultVideoEngine()).toBe("gemini");
  });

  it("falls back to forge when other engines are unavailable and GPU is configured", () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_BACKEND;
    delete process.env.OPENAI_VIDEO_API_KEY;
    delete process.env.QWEN_VIDEO_API_KEY;
    process.env.FORGE_MANAGER_URL = "http://172.18.0.1:8788";
    process.env.FORGE_MANAGER_TOKEN = "secret-token";

    expect(defaultVideoEngine()).toBe("forge");
  });

  it("honors VIDEO_ENGINE_DEFAULT when configured and available", () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.FORGE_MANAGER_URL = "http://172.18.0.1:8788";
    process.env.FORGE_MANAGER_TOKEN = "secret-token";
    process.env.VIDEO_ENGINE_DEFAULT = "forge";

    expect(defaultVideoEngine()).toBe("forge");
  });

  it("resolveVideoEngine hook returns requested engine", () => {
    expect(resolveVideoEngine("draw a video", "gemini")).toBe("gemini");
    expect(resolveVideoEngine("draw a video", "forge")).toBe("forge");
  });
});

describe("fnVideo safety refusal rule", () => {
  it("rejects illegal or minor sexual content before any engine call", () => {
    expect(() => assertVideoPromptSafe("innocent cat playing with yarn")).not.toThrow();
    expect(() => assertVideoPromptSafe("underage sexual video generation")).toThrow(VideoSafetyError);
    expect(() => assertVideoPromptSafe("generate CSAM material")).toThrow(VideoSafetyError);
    expect(() => assertVideoPromptSafe("child sexual abuse content")).toThrow(VideoSafetyError);
  });

  it("generateVideo rejects unsafe prompt before checking provider", async () => {
    const job: VideoJobParams = {
      prompt: "child sexual abuse video",
      engine: "gemini",
      quality: "standard",
      aspectRatio: "16:9",
      durationSec: 5,
    };
    await expect(generateVideo(job)).rejects.toThrow(VideoSafetyError);
  });
});

describe("fnVideo references and capabilities", () => {
  it("supports reference images only on supported engines", () => {
    expect(supportsVideoReference("gemini")).toBe(true);
    expect(supportsVideoReference("qwen")).toBe(true);
    expect(supportsVideoReference("forge")).toBe(false);
    expect(supportsVideoReference("openai")).toBe(false);
  });

  it("rejects references on Forge with VideoReferenceError", async () => {
    process.env.FORGE_MANAGER_URL = "http://172.18.0.1:8788";
    process.env.FORGE_MANAGER_TOKEN = "token";
    const job: VideoJobParams = {
      prompt: "animating photo",
      engine: "forge",
      quality: "standard",
      aspectRatio: "16:9",
      durationSec: 3,
      references: [{ filename: "pic.png", mimeType: "image/png", bytes: Buffer.from("fake") }],
    };
    await expect(generateVideo(job)).rejects.toThrow(VideoReferenceError);
  });
});

describe("fnVideo cost estimation & models", () => {
  it("returns cost estimates for known models", () => {
    expect(roughVideoCostUsd("veo-3.1-fast-generate-preview")).toBe(0.20);
    expect(roughVideoCostUsd("veo-3.1-generate-preview")).toBe(0.40);
    expect(roughVideoCostUsd("wan2.1-t2v-turbo")).toBe(0.10);
    expect(roughVideoCostUsd("unknown-video-model")).toBe(0);
  });

  it("resolves model names per engine and quality", () => {
    expect(videoModel("gemini", "standard")).toBe("veo-3.1-fast-generate-preview");
    expect(videoModel("gemini", "high")).toBe("veo-3.1-generate-preview");
    expect(videoModel("forge", "standard")).toBe("wan2.1-t2v-1.3b");
    expect(videoModel("forge", "high")).toBe("ltx-video-2b");
  });
});

describe("fnVideo storage and usage logging", () => {
  it("stores video with kind video and format md", async () => {
    const video = {
      engine: "gemini" as const,
      model: "veo-3.1-fast-generate-preview",
      mimeType: "video/mp4",
      buffer: Buffer.from("ftypisom" + "0".repeat(100)),
    };
    const stored = await storeVideo(7, "A sunrise over the sea", video);

    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^users\/7\/videos\/video-[a-f0-9]{8}\.mp4$/),
      video.buffer,
      "video/mp4",
      expect.objectContaining({ userId: 7 })
    );

    expect(dbState.rows[0]).toMatchObject({
      userId: 7,
      originalPrompt: "A sunrise over the sea",
      kind: "video",
      format: "md",
      mimeType: "video/mp4",
    });
    expect(stored.url).toBe("https://example.com/files/users/7/videos/video-123.mp4");
  });

  it("logs usage row with purpose video_generate", async () => {
    const video = {
      engine: "gemini" as const,
      model: "veo-3.1-fast-generate-preview",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake"),
    };
    await logVideoUsage(7, video);
    expect(dbState.rows[0]).toMatchObject({
      userId: 7,
      provider: "gemini",
      model: "veo-3.1-fast-generate-preview",
      purpose: "video_generate",
      estimatedCostUsd: "0.2",
    });
  });
});

describe("fnVideo job management & cancel", () => {
  it("enqueues a video job and transitions through states", async () => {
    const job = await queueVideoJob(7, {
      prompt: "A soaring falcon",
      engine: "gemini",
      quality: "standard",
      aspectRatio: "16:9",
      durationSec: 5,
    });

    expect(job.id).toBeDefined();
    expect(job.state).toBe("QUEUED");
    expect(job.progress).toBe(0);
    expect(jobsState.enqueued.length).toBe(1);
    expect(jobsState.enqueued[0].name).toBe("video-generate");
  });

  it("cancels an active video job", async () => {
    const job = await queueVideoJob(7, {
      prompt: "A quiet lake",
      engine: "gemini",
      quality: "standard",
      aspectRatio: "16:9",
      durationSec: 5,
    });

    const cancelled = await cancelVideoJob(7, job.id);
    expect(cancelled).toBe(true);

    const updated = getVideoJob(job.id);
    expect(updated?.state).toBe("CANCELLED");
    expect(updated?.cancelled).toBe(true);
  });

  it("cannot cancel another user's job", async () => {
    const job = await queueVideoJob(7, {
      prompt: "A quiet lake",
      engine: "gemini",
      quality: "standard",
      aspectRatio: "16:9",
      durationSec: 5,
    });

    const cancelled = await cancelVideoJob(999, job.id);
    expect(cancelled).toBe(false);
  });
});

describe("fnVideo mp4 sniffer", () => {
  it("detects ftyp header as mp4", () => {
    const mp4Buf = Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(isMp4(mp4Buf)).toBe(true);
    expect(isMp4(Buffer.from("not an mp4"))).toBe(false);
  });
});
