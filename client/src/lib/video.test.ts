import { describe, it, expect, vi, beforeEach } from "vitest";

const authSession = vi.hoisted(() => ({
  getAuthToken: vi.fn(() => "test-jwt-token"),
}));
vi.mock("./authSession", () => authSession);

import {
  cancelVideo,
  getVideoStatus,
  listVideoEngines,
  pollVideo,
  startVideo,
} from "./video";

beforeEach(() => {
  vi.restoreAllMocks();
  authSession.getAuthToken.mockReturnValue("test-jwt-token");
});

describe("client/src/lib/video", () => {
  it("startVideo sends POST request to /api/fn/video/start", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, jobId: "job-123", state: "QUEUED", etaSeconds: 60 }),
    });
    global.fetch = fetchMock;

    const res = await startVideo({
      prompt: "A soaring falcon",
      engine: "gemini",
      aspectRatio: "16:9",
    });

    expect(res.jobId).toBe("job-123");
    expect(res.state).toBe("QUEUED");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/fn/video/start"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-jwt-token",
        }),
      })
    );
  });

  it("getVideoStatus sends GET request to /api/fn/video/status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "job-123",
        state: "DRAWING",
        progress: 0.5,
        etaSeconds: 30,
      }),
    });
    global.fetch = fetchMock;

    const status = await getVideoStatus("job-123");
    expect(status.id).toBe("job-123");
    expect(status.state).toBe("DRAWING");
    expect(status.progress).toBe(0.5);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/fn/video/status?id=job-123"),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("cancelVideo sends POST request to /api/fn/video/cancel", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock;

    const res = await cancelVideo("job-123");
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/fn/video/cancel"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ jobId: "job-123" }),
      })
    );
  });

  it("pollVideo resolves when status is DONE", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({ id: "job-123", state: "DRAWING", progress: 0.5, etaSeconds: 20 }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          id: "job-123",
          state: "DONE",
          progress: 1.0,
          etaSeconds: 0,
          videoUrl: "https://example.com/video.mp4",
        }),
      };
    });
    global.fetch = fetchMock;

    const updates: any[] = [];
    const finalStatus = await pollVideo("job-123", {
      intervalMs: 10,
      onUpdate: (s) => updates.push(s.state),
    });

    expect(finalStatus.state).toBe("DONE");
    expect(finalStatus.videoUrl).toBe("https://example.com/video.mp4");
    expect(updates).toEqual(["DRAWING", "DONE"]);
  });

  it("pollVideo aborts immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      pollVideo("job-123", { signal: controller.signal })
    ).rejects.toThrow("Polling aborted by user");
  });
});
