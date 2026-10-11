/**
 * P1-12 part 2: the image and video generation tools' contracts.
 *
 * `generate_image` maps its arguments onto the image pipeline (generateImage + storeImage),
 * respects the engine resolver (resolveImageEngine), the image rate limits and the blocked-prompt
 * check (isBlockedPrompt). It emits an `image` event {url, fileId, prompt, engine}.
 *
 * `generate_video` enqueues a job on the existing video job queue and returns
 * {jobId, status} immediately, emitting a `job` event so the UI can poll.
 *
 * Both tools are mocked at their service boundaries so no credentials are needed.
 * The blocked-prompt check is mocked to return true for "BLOCKED_PROMPT_FIXTURE".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sensitiveMock = vi.hoisted(() => ({
  isBlockedPrompt: vi.fn(),
}));

vi.mock("../../../lib/sensitive", () => sensitiveMock);

const fnImageMock = vi.hoisted(() => ({
  ASPECT_RATIOS: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  ENGINE_IDS: ["gemini", "qwen", "openai", "forge", "venice"],
  ENGINE_LABELS: { gemini: "Gemini", qwen: "Qwen", openai: "OpenAI", forge: "Stable Diffusion", venice: "Venice" },
  QUALITIES: ["standard", "high"],
  generateImage: vi.fn(),
  storeImage: vi.fn(),
  logImageUsage: vi.fn(),
  resolveImageEngine: vi.fn(),
  engineAvailable: vi.fn(),
  defaultEngine: vi.fn(() => "gemini"),
  supportsReference: vi.fn(() => false),
  ImageBlockedError: class ImageBlockedError extends Error { constructor() { super("I can't help with that."); this.name = "ImageBlockedError"; } },
  ImageNotConfiguredError: class ImageNotConfiguredError extends Error { constructor(label: string) { super(`${label} is not available right now.`); this.name = "ImageNotConfiguredError"; } },
  ImageReferenceError: class ImageReferenceError extends Error { constructor(label: string) { super(`${label} cannot use reference photos yet.`); this.name = "ImageReferenceError"; } },
  ImageTimeoutError: class ImageTimeoutError extends Error { constructor() { super("The image engine timed out. Please try again."); this.name = "ImageTimeoutError"; } },
  ImageUpstreamError: class ImageUpstreamError extends Error { constructor(public readonly providerStatus?: number) { super("The image engine failed. Please try again."); this.name = "ImageUpstreamError"; } },
}));

vi.mock("../../../lib/fnImage", () => fnImageMock);

const fnVideoMock = vi.hoisted(() => ({
  VIDEO_ASPECT_RATIOS: ["16:9", "9:16", "1:1"],
  VIDEO_ENGINE_IDS: ["openai", "gemini", "qwen", "forge"],
  VIDEO_ENGINE_LABELS: { openai: "OpenAI", gemini: "Gemini", qwen: "Qwen", forge: "Open-weight GPU" },
  VIDEO_QUALITIES: ["standard", "high"],
  queueVideoJob: vi.fn(),
  engineAvailable: vi.fn(),
  defaultVideoEngine: vi.fn(() => "gemini"),
  resolveVideoEngine: vi.fn((p, e) => e),
  clampDuration: vi.fn((e, d) => d ?? 5),
  assertVideoPromptSafe: vi.fn(),
  supportsVideoReference: vi.fn(() => false),
  VideoNotConfiguredError: class VideoNotConfiguredError extends Error { constructor(label: string) { super(`${label} is not available right now.`); this.name = "VideoNotConfiguredError"; } },
  VideoReferenceError: class VideoReferenceError extends Error { constructor(label: string) { super(`${label} cannot use reference photos yet.`); this.name = "VideoReferenceError"; } },
  VideoSafetyError: class VideoSafetyError extends Error { constructor(message = "This prompt cannot be processed because it violates safety policies.") { super(message); this.name = "VideoSafetyError"; } },
  VideoTimeoutError: class VideoTimeoutError extends Error { constructor() { super("The video engine timed out. Please try again."); this.name = "VideoTimeoutError"; } },
  VideoUpstreamError: class VideoUpstreamError extends Error { constructor(public readonly providerStatus?: number, message = "The video engine failed. Please try again.") { super(message); this.name = "VideoUpstreamError"; } },
}));

vi.mock("../../../lib/fnVideo", () => fnVideoMock);

const executorsMock = vi.hoisted(() => ({
  isAdminUser: vi.fn(async () => false),
}));

vi.mock("../../../kemma/executors/vpsFiles", () => executorsMock);

import { registerMediaTools } from "./media";
import { runTool, toolsFor, __resetRegistryForTests } from "../registry";
import type { ToolContext } from "../types";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 7,
    runId: "r-media",
    tier: "trial",
    signal: new AbortController().signal,
    emit: vi.fn(),
    ...overrides,
  };
}

const GENERATE_IMAGE_ARGS = {
  prompt: "A cyberpunk cityscape at sunset, neon lights, rain-slick streets",
  engine: "gemini",
  quality: "standard",
  aspectRatio: "16:9",
};

const GENERATE_VIDEO_ARGS = {
  prompt: "A cat walking through a cyberpunk city at night",
  engine: "gemini",
  quality: "standard",
  aspectRatio: "16:9",
  durationSec: 5,
};

beforeEach(() => {
  __resetRegistryForTests();
  vi.resetAllMocks();

  // Default mock implementations
  fnImageMock.engineAvailable.mockReturnValue(true);
  fnImageMock.defaultEngine.mockReturnValue("gemini");
  fnImageMock.resolveImageEngine.mockResolvedValue({ blocked: false, engine: "gemini", routed: false });
  fnImageMock.generateImage.mockResolvedValue({
    engine: "gemini",
    model: "gemini-3.1-flash-image",
    mimeType: "image/png",
    width: 1024,
    height: 576,
    buffer: Buffer.from("fake-image"),
  });
  fnImageMock.storeImage.mockResolvedValue({ key: "users/7/images/abc123.png", url: "https://files.example/users/7/images/abc123.png", sizeBytes: 12345 });
  fnImageMock.logImageUsage.mockResolvedValue(undefined);
  sensitiveMock.isBlockedPrompt.mockReturnValue(false);

  fnVideoMock.engineAvailable.mockReturnValue(true);
  fnVideoMock.defaultVideoEngine.mockReturnValue("gemini");
  fnVideoMock.resolveVideoEngine.mockImplementation((p, e) => e ?? "gemini");
  fnVideoMock.clampDuration.mockImplementation((e, d) => d ?? 5);
  fnVideoMock.assertVideoPromptSafe.mockImplementation(() => {});
  fnVideoMock.queueVideoJob.mockResolvedValue({
    id: "video-job-1",
    state: "QUEUED",
    etaSeconds: 60,
    params: GENERATE_VIDEO_ARGS,
  });

  executorsMock.isAdminUser.mockResolvedValue(false);

  registerMediaTools();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("generate_image", () => {
  it("maps arguments onto the image pipeline and returns the stored URL", async () => {
    const outcome = await runTool("generate_image", GENERATE_IMAGE_ARGS, ctx());

    expect(fnImageMock.resolveImageEngine).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: GENERATE_IMAGE_ARGS.prompt, engine: "gemini", isAdmin: expect.any(Function), hasReferences: false })
    );
    expect(fnImageMock.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: GENERATE_IMAGE_ARGS.prompt,
        engine: "gemini",
        quality: "standard",
        aspectRatio: "16:9",
        references: [],
      })
    );
    expect(fnImageMock.storeImage).toHaveBeenCalledWith(7, GENERATE_IMAGE_ARGS.prompt, expect.any(Object));
    expect(fnImageMock.logImageUsage).toHaveBeenCalledWith(7, expect.any(Object));
    expect(outcome).toEqual({
      ok: true,
      data: {
        success: true,
        data: {
          engine: "gemini",
          model: "gemini-3.1-flash-image",
          mimeType: "image/png",
          width: 1024,
          height: 576,
          url: "https://files.example/users/7/images/abc123.png",
        },
      },
    });
  });

  it("uses the default engine when none is specified", async () => {
    await runTool("generate_image", { prompt: "A house" }, ctx());

    expect(fnImageMock.resolveImageEngine).toHaveBeenCalledWith(
      expect.objectContaining({ engine: "gemini" })
    );
  });

  it("emits an image event with the stored URL and prompt", async () => {
    const emit = vi.fn();
    await runTool("generate_image", GENERATE_IMAGE_ARGS, ctx({ emit }));

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image",
        url: "https://files.example/users/7/images/abc123.png",
        prompt: GENERATE_IMAGE_ARGS.prompt,
        engine: "gemini",
      })
    );
  });

  it("refuses a blocked prompt before any engine call", async () => {
    sensitiveMock.isBlockedPrompt.mockReturnValue(true);

    const outcome = await runTool("generate_image", { prompt: "BLOCKED_PROMPT_FIXTURE" }, ctx());

    expect(fnImageMock.generateImage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "BLOCKED_PROMPT" } });
  });

  it("refuses a blocked prompt via resolveImageEngine", async () => {
    fnImageMock.resolveImageEngine.mockResolvedValue({ blocked: true, engine: "gemini", routed: false });

    const outcome = await runTool("generate_image", { prompt: "anything" }, ctx());

    expect(fnImageMock.generateImage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "BLOCKED_PROMPT" } });
  });

  it("refuses Venice for non-admin accounts", async () => {
    executorsMock.isAdminUser.mockResolvedValue(false);
    fnImageMock.resolveImageEngine.mockResolvedValue({ blocked: false, engine: "venice", routed: true });

    const outcome = await runTool("generate_image", { ...GENERATE_IMAGE_ARGS, engine: "venice" }, ctx());

    expect(fnImageMock.generateImage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "NOT_ALLOWED" } });
  });

  it("allows Venice for admin accounts", async () => {
    executorsMock.isAdminUser.mockResolvedValue(true);
    fnImageMock.resolveImageEngine.mockResolvedValue({ blocked: false, engine: "venice", routed: true });

    await runTool("generate_image", { ...GENERATE_IMAGE_ARGS, engine: "venice" }, ctx());

    expect(fnImageMock.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ engine: "venice" })
    );
  });

  it("refuses an engine that is not configured", async () => {
    fnImageMock.engineAvailable.mockReturnValue(false);

    const outcome = await runTool("generate_image", { ...GENERATE_IMAGE_ARGS, engine: "forge" }, ctx());

    expect(fnImageMock.generateImage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "ENGINE_UNAVAILABLE" } });
  });

  it("maps ImageBlockedError to BLOCKED_PROMPT", async () => {
    fnImageMock.generateImage.mockRejectedValue(new fnImageMock.ImageBlockedError());

    const outcome = await runTool("generate_image", GENERATE_IMAGE_ARGS, ctx());

    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "BLOCKED_PROMPT" } });
  });

  it("maps ImageNotConfiguredError to ENGINE_UNAVAILABLE", async () => {
    fnImageMock.generateImage.mockRejectedValue(new fnImageMock.ImageNotConfiguredError("Gemini"));

    const outcome = await runTool("generate_image", GENERATE_IMAGE_ARGS, ctx());

    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "ENGINE_UNAVAILABLE" } });
  });

  it("maps ImageReferenceError to INVALID_ARGS", async () => {
    fnImageMock.generateImage.mockRejectedValue(new fnImageMock.ImageReferenceError("Gemini"));

    const outcome = await runTool("generate_image", GENERATE_IMAGE_ARGS, ctx());

    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "INVALID_ARGS" } });
  });

  it("maps ImageTimeoutError to TIMEOUT", async () => {
    fnImageMock.generateImage.mockRejectedValue(new fnImageMock.ImageTimeoutError());

    const outcome = await runTool("generate_image", GENERATE_IMAGE_ARGS, ctx());

    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "TIMEOUT" } });
  });

  it("maps ImageUpstreamError to FAILED", async () => {
    fnImageMock.generateImage.mockRejectedValue(new fnImageMock.ImageUpstreamError(500));

    const outcome = await runTool("generate_image", GENERATE_IMAGE_ARGS, ctx());

    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "FAILED" } });
  });

  it("is not offered when no image engine is configured", async () => {
    fnImageMock.engineAvailable.mockReturnValue(false);

    const names = (await toolsFor(ctx())).map((s) => s.name);
    expect(names).not.toContain("generate_image");
  });

  it("validates prompt length (zod)", async () => {
    const longPrompt = "x".repeat(2001);
    const outcome = await runTool("generate_image", { prompt: longPrompt }, ctx());

    expect(fnImageMock.generateImage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("validates required prompt (zod)", async () => {
    const outcome = await runTool("generate_image", {}, ctx());

    expect(fnImageMock.generateImage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });
});

describe("generate_video", () => {
  it("maps arguments onto the video queue and returns jobId and status", async () => {
    const outcome = await runTool("generate_video", GENERATE_VIDEO_ARGS, ctx());

    expect(fnVideoMock.resolveVideoEngine).toHaveBeenCalledWith(GENERATE_VIDEO_ARGS.prompt, "gemini");
    expect(fnVideoMock.assertVideoPromptSafe).toHaveBeenCalledWith(GENERATE_VIDEO_ARGS.prompt);
    expect(fnVideoMock.queueVideoJob).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        prompt: GENERATE_VIDEO_ARGS.prompt,
        engine: "gemini",
        quality: "standard",
        aspectRatio: "16:9",
        durationSec: 5,
        references: [],
      })
    );
    expect(outcome).toEqual({
      ok: true,
      data: {
        success: true,
        data: {
          jobId: "video-job-1",
          status: "QUEUED",
          etaSeconds: 60,
        },
      },
    });
  });

  it("uses the default engine when none is specified", async () => {
    await runTool("generate_video", { prompt: "A cat" }, ctx());

    expect(fnVideoMock.resolveVideoEngine).toHaveBeenCalledWith("A cat", "gemini");
  });

  it("emits a job event with the job id and status", async () => {
    const emit = vi.fn();
    await runTool("generate_video", GENERATE_VIDEO_ARGS, ctx({ emit }));

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "job",
        jobId: "video-job-1",
        kind: "video",
        status: "QUEUED",
        etaSeconds: 60,
      })
    );
  });

  it("refuses a safety-violating prompt before queueing", async () => {
    fnVideoMock.assertVideoPromptSafe.mockImplementation(() => {
      throw new fnVideoMock.VideoSafetyError("Refused: prompt contains prohibited or illegal content.");
    });

    const outcome = await runTool("generate_video", { prompt: "BLOCKED_PROMPT_FIXTURE" }, ctx());

    expect(fnVideoMock.queueVideoJob).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "BLOCKED_PROMPT" } });
  });

  it("refuses an engine that is not configured", async () => {
    fnVideoMock.engineAvailable.mockReturnValue(false);

    const outcome = await runTool("generate_video", { ...GENERATE_VIDEO_ARGS, engine: "forge" }, ctx());

    expect(fnVideoMock.queueVideoJob).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "ENGINE_UNAVAILABLE" } });
  });

  it("maps VideoReferenceError to INVALID_ARGS", async () => {
    fnVideoMock.queueVideoJob.mockRejectedValue(new fnVideoMock.VideoReferenceError("Gemini"));

    const outcome = await runTool("generate_video", GENERATE_VIDEO_ARGS, ctx());

    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "INVALID_ARGS" } });
  });

  it("maps VideoNotConfiguredError to ENGINE_UNAVAILABLE", async () => {
    fnVideoMock.queueVideoJob.mockRejectedValue(new fnVideoMock.VideoNotConfiguredError("Gemini"));

    const outcome = await runTool("generate_video", GENERATE_VIDEO_ARGS, ctx());

    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "ENGINE_UNAVAILABLE" } });
  });

  it("maps VideoSafetyError to BLOCKED_PROMPT", async () => {
    fnVideoMock.queueVideoJob.mockRejectedValue(new fnVideoMock.VideoSafetyError("Refused."));

    const outcome = await runTool("generate_video", GENERATE_VIDEO_ARGS, ctx());

    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "BLOCKED_PROMPT" } });
  });

  it("maps VideoTimeoutError to TIMEOUT", async () => {
    fnVideoMock.queueVideoJob.mockRejectedValue(new fnVideoMock.VideoTimeoutError());

    const outcome = await runTool("generate_video", GENERATE_VIDEO_ARGS, ctx());

    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "TIMEOUT" } });
  });

  it("maps VideoUpstreamError to FAILED", async () => {
    fnVideoMock.queueVideoJob.mockRejectedValue(new fnVideoMock.VideoUpstreamError(500));

    const outcome = await runTool("generate_video", GENERATE_VIDEO_ARGS, ctx());

    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "FAILED" } });
  });

  it("is not offered when no video engine is configured", async () => {
    fnVideoMock.engineAvailable.mockReturnValue(false);

    const names = (await toolsFor(ctx())).map((s) => s.name);
    expect(names).not.toContain("generate_video");
  });

  it("validates prompt length (zod)", async () => {
    const longPrompt = "x".repeat(2001);
    const outcome = await runTool("generate_video", { prompt: longPrompt }, ctx());

    expect(fnVideoMock.queueVideoJob).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("validates required prompt (zod)", async () => {
    const outcome = await runTool("generate_video", {}, ctx());

    expect(fnVideoMock.queueVideoJob).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });
});