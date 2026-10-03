import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response } from "express";

const lib = vi.hoisted(() => {
  class VideoNotConfiguredError extends Error {
    constructor(public readonly label: string) {
      super(`${label} is not available right now.`);
      this.name = "VideoNotConfiguredError";
    }
  }
  class VideoSafetyError extends Error {
    constructor(message = "Refused: prompt contains prohibited or illegal content.") {
      super(message);
      this.name = "VideoSafetyError";
    }
  }
  class VideoReferenceError extends Error {
    constructor(public readonly label: string) {
      super(`${label} cannot use reference photos yet.`);
      this.name = "VideoReferenceError";
    }
  }

  const jobs = new Map<string, any>();

  return {
    VIDEO_ENGINE_IDS: ["openai", "gemini", "qwen", "forge"] as const,
    VIDEO_QUALITIES: ["standard", "high"] as const,
    VIDEO_ASPECT_RATIOS: ["16:9", "9:16", "1:1"] as const,
    VIDEO_ENGINE_LABELS: { openai: "OpenAI", gemini: "Gemini", qwen: "Qwen", forge: "Open-weight GPU" } as Record<string, string>,
    VideoNotConfiguredError,
    VideoSafetyError,
    VideoReferenceError,
    jobs,
    defaultVideoEngine: vi.fn(() => "gemini"),
    engineAvailable: vi.fn(() => true),
    supportsVideoReference: vi.fn((engine: string) => engine !== "forge"),
    resolveVideoEngine: vi.fn((prompt: string, requested?: string) => requested || "gemini"),
    clampDuration: vi.fn((engine: string, requested?: number) => requested || 5),
    videoModel: vi.fn((engine: string, quality: string) => `${engine}-${quality}-model`),
    listVideoEngines: vi.fn(() => [
      { id: "gemini", label: "Gemini", model: "veo-3.1-fast-generate-preview", qualityModel: "veo-3.1-generate-preview", available: true, defaultEngine: true, supportsReference: true, minDurationSec: 5, maxDurationSec: 8 },
    ]),
    assertVideoPromptSafe: vi.fn((prompt: string) => {
      if (/csam|underage|illegal/i.test(prompt)) {
        throw new VideoSafetyError();
      }
    }),
    queueVideoJob: vi.fn(async (userId: number, params: any) => {
      const id = "test-job-uuid-123";
      const record = {
        id,
        userId,
        params,
        state: "QUEUED",
        progress: 0,
        etaSeconds: 60,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      jobs.set(id, record);
      return record;
    }),
    getVideoJob: vi.fn((id: string) => jobs.get(id)),
    cancelVideoJob: vi.fn(async (userId: number, id: string) => {
      const job = jobs.get(id);
      if (!job || job.userId !== userId) return false;
      job.state = "CANCELLED";
      return true;
    }),
  };
});

const attachments = vi.hoisted(() => ({
  parseReferenceImages: vi.fn((value: unknown) => (Array.isArray(value) ? value : [])),
  resolveAttachment: vi.fn(async (_userId: number, att: any) => ({
    filename: att.filename ?? "photo.png",
    mediaType: att.mediaType ?? "image/png",
    bytes: Buffer.from("ref"),
  })),
  referenceLimits: vi.fn(() => ({ maxCount: 2, maxBytes: 8 * 1024 * 1024, imagesOnly: true })),
  hasDriveAttachment: vi.fn(() => false),
  requireDriveConnection: vi.fn(async () => {}),
}));

vi.mock("../../lib/fnVideo", () => lib);
vi.mock("../../lib/attachments", () => attachments);

import { FnError } from "../../lib/fnErrors";
import {
  handleCancelVideo,
  handleGetVideoStatus,
  handleStartVideo,
  handleVideo,
  videoRouter,
} from "./video";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    headersSent: false,
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
  };
  return res;
}

beforeEach(() => {
  lib.jobs.clear();
  lib.engineAvailable.mockReturnValue(true);
  lib.supportsVideoReference.mockImplementation((e: string) => e !== "forge");
});

describe("server/routes/fn/video handleStartVideo", () => {
  it("rejects empty prompt with 400", async () => {
    const req = { body: { prompt: "" } } as Request;
    const res = fakeRes() as unknown as Response;
    await expect(handleStartVideo(7, req.body, req, res)).rejects.toThrow(FnError);
    await expect(handleStartVideo(7, req.body, req, res)).rejects.toMatchObject({
      status: 400,
      message: "Prompt is required.",
    });
  });

  it("rejects prompt over 2000 chars with 400", async () => {
    const req = { body: { prompt: "a".repeat(2001) } } as Request;
    const res = fakeRes() as unknown as Response;
    await expect(handleStartVideo(7, req.body, req, res)).rejects.toMatchObject({
      status: 400,
      message: "Prompt is too long (max 2000).",
    });
  });

  it("rejects unsafe prompt before queuing", async () => {
    const req = { body: { prompt: "generate illegal underage content" } } as Request;
    const res = fakeRes() as unknown as Response;
    await expect(handleStartVideo(7, req.body, req, res)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("prohibited or illegal"),
    });
  });

  it("returns 503 when engine is unavailable", async () => {
    lib.engineAvailable.mockReturnValue(false);
    const req = { body: { prompt: "A calm river" } } as Request;
    const res = fakeRes() as unknown as Response;
    await expect(handleStartVideo(7, req.body, req, res)).rejects.toMatchObject({
      status: 503,
      message: "Gemini is not available right now.",
    });
  });

  it("enqueues valid job and returns jobId, state, etaSeconds", async () => {
    const req = { body: { prompt: "A calm river", aspectRatio: "16:9", quality: "standard" } } as Request;
    const res = fakeRes() as unknown as Response;
    const out = await handleStartVideo(7, req.body, req, res);

    expect(out).toMatchObject({
      ok: true,
      jobId: "test-job-uuid-123",
      state: "QUEUED",
      etaSeconds: 60,
    });
    expect(lib.queueVideoJob).toHaveBeenCalled();
  });
});

describe("server/routes/fn/video handleGetVideoStatus", () => {
  it("rejects missing jobId with 400", () => {
    expect(() => handleGetVideoStatus(7, "")).toThrow(FnError);
  });

  it("returns 404 when job not found", () => {
    expect(() => handleGetVideoStatus(7, "nonexistent-id")).toThrow(FnError);
    expect(() => handleGetVideoStatus(7, "nonexistent-id")).toThrow("Video job not found.");
  });

  it("returns 404 when owned by another user", () => {
    lib.jobs.set("job-1", {
      id: "job-1",
      userId: 42,
      params: { engine: "gemini", quality: "standard" },
      state: "DRAWING",
      progress: 0.3,
      etaSeconds: 45,
    });
    expect(() => handleGetVideoStatus(7, "job-1")).toThrow("Video job not found.");
  });

  it("returns status object when job exists and is owned", () => {
    lib.jobs.set("job-1", {
      id: "job-1",
      userId: 7,
      params: { engine: "gemini", quality: "standard" },
      state: "DRAWING",
      progress: 0.5,
      etaSeconds: 30,
      videoUrl: undefined,
    });

    const status = handleGetVideoStatus(7, "job-1");
    expect(status).toMatchObject({
      id: "job-1",
      state: "DRAWING",
      progress: 0.5,
      etaSeconds: 30,
      engine: "gemini",
      model: "gemini-standard-model",
    });
  });
});

describe("server/routes/fn/video handleCancelVideo", () => {
  it("returns 404 when job does not exist", async () => {
    await expect(handleCancelVideo(7, "nonexistent-job")).rejects.toThrow("Video job not found.");
  });

  it("cancels active job and returns ok: true", async () => {
    lib.jobs.set("job-active", {
      id: "job-active",
      userId: 7,
      state: "QUEUED",
    });

    const out = await handleCancelVideo(7, "job-active");
    expect(out).toEqual({ ok: true });
    expect(lib.cancelVideoJob).toHaveBeenCalledWith(7, "job-active");
  });
});

describe("server/routes/fn/video handleVideo (cloud function style)", () => {
  it("handles action: engines", async () => {
    const req = { body: { action: "engines" } } as Request;
    const res = fakeRes() as unknown as Response;
    await handleVideo(7, req, res);
    expect((res as any).body).toHaveProperty("engines");
  });

  it("handles action: status", async () => {
    lib.jobs.set("job-test", {
      id: "job-test",
      userId: 7,
      params: { engine: "gemini", quality: "standard" },
      state: "DONE",
      progress: 1.0,
      etaSeconds: 0,
      videoUrl: "https://example.com/video.mp4",
    });

    const req = { body: { action: "status", id: "job-test" } } as Request;
    const res = fakeRes() as unknown as Response;
    await handleVideo(7, req, res);
    expect((res as any).body).toMatchObject({
      id: "job-test",
      state: "DONE",
      videoUrl: "https://example.com/video.mp4",
    });
  });

  it("throws 400 for unknown action", async () => {
    const req = { body: { action: "unknown_action" } } as Request;
    const res = fakeRes() as unknown as Response;
    await expect(handleVideo(7, req, res)).rejects.toThrow(FnError);
  });
});
