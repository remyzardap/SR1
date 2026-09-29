import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { NextFunction, Request } from "express";
import type { Server } from "node:http";

const store = vi.hoisted(() => ({
  LIVING_MEMORY_KEY: "livingMemoryEnabled",
  getUserSetting: vi.fn(),
  setUserSetting: vi.fn(),
  listMonitors: vi.fn(),
  listMonitorRuns: vi.fn(),
  countMonitors: vi.fn(),
  createMonitor: vi.fn(),
  getMonitor: vi.fn(),
  insertMonitorRun: vi.fn(),
  markMonitorRun: vi.fn(),
  clearMonitorSchedule: vi.fn(),
  setActiveMonitor: vi.fn(),
  removeMonitor: vi.fn(),
}));
const voiceLib = vi.hoisted(() => ({
  speechToText: vi.fn(),
  textToSpeech: vi.fn(),
  voiceConfigured: vi.fn().mockReturnValue(true),
  VoiceNotConfiguredError: class VoiceNotConfiguredError extends Error {},
  VoiceUpstreamError: class VoiceUpstreamError extends Error {},
}));

vi.mock("../../lib/fnStore", () => store);
vi.mock("../../db", () => ({ getOrCreateIdentity: vi.fn(), getMemoriesByIdentity: vi.fn(), deleteMemory: vi.fn() }));
vi.mock("../../lib/fnLlm", () => ({ complete: vi.fn(), LlmUnavailableError: class extends Error {} }));
vi.mock("../../lib/fnVoice", () => voiceLib);
vi.mock("../../core/jobs", () => ({ enqueueJob: vi.fn(), registerJob: vi.fn() }));
vi.mock("../../kemma/engine", () => ({ kemmaExecute: vi.fn() }));
vi.mock("../../core/quotaCheck", () => ({ getQuotaSummary: vi.fn() }));

import { fnRouter } from "./index";
import { MAX_AUDIO_BYTES } from "./voice";

/** Stands in for the requireSession gate in server/_core/index.ts: it only attaches the user row. */
function buildApp(user: { id: number } | null) {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  const attach: NextFunction = (req, _res, next) => {
    if (user) (req as Request & { user?: unknown }).user = user;
    next();
  };
  app.use("/api/fn", attach, fnRouter);
  return app;
}

async function withServer(app: express.Express, run: (base: string) => Promise<void>): Promise<void> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const jsonCall = async (base: string, name: string, body: unknown, token?: string) => {
  const res = await fetch(`${base}/api/fn/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
};

beforeEach(() => {
  vi.clearAllMocks();
  store.getUserSetting.mockResolvedValue(undefined);
  voiceLib.voiceConfigured.mockReturnValue(true);
  voiceLib.speechToText.mockResolvedValue("order forty steel bolts");
});

describe("POST /api/fn/:name", () => {
  it("404s a function name that does not exist", async () => {
    await withServer(buildApp({ id: 7 }), async (base) => {
      const out = await jsonCall(base, "nope", { action: "list" });
      expect(out.status).toBe(404);
      expect(out.body).toEqual({ error: "Unknown function." });
    });
  });

  it("401s when no session user was attached", async () => {
    await withServer(buildApp(null), async (base) => {
      const out = await jsonCall(base, "memories", { action: "getSetting" });
      expect(out.status).toBe(401);
      expect(out.body).toEqual({ error: "Sign in to continue." });
      expect(store.getUserSetting).not.toHaveBeenCalled();
    });
  });

  it("serves the signed-in user with a bearer token", async () => {
    await withServer(buildApp({ id: 7 }), async (base) => {
      const out = await jsonCall(base, "memories", { action: "getSetting" }, "session-token");
      expect(out.status).toBe(200);
      expect(out.body).toEqual({ enabled: true });
      expect(store.getUserSetting).toHaveBeenCalledWith(7, "livingMemoryEnabled");
    });
  });

  it("answers an unknown action with { error } and a 400", async () => {
    await withServer(buildApp({ id: 7 }), async (base) => {
      const out = await jsonCall(base, "monitors", { action: "broadcast" });
      expect(out.status).toBe(400);
      expect(out.body).toEqual({ error: "Unknown action: broadcast" });
      expect(store.listMonitors).not.toHaveBeenCalled();
    });
  });

  it("answers a body without the action selector with a 400", async () => {
    await withServer(buildApp({ id: 7 }), async (base) => {
      const out = await jsonCall(base, "memories", {});
      expect(out.status).toBe(400);
      expect(out.body).toEqual({ error: "Action is required." });
    });
  });

  it("never leaks an exception message to the client", async () => {
    store.listMonitors.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    await withServer(buildApp({ id: 7 }), async (base) => {
      const out = await jsonCall(base, "monitors", { action: "list" });
      expect(out.status).toBe(500);
      expect(out.body).toEqual({ error: "The request failed. Please try again." });
    });
  });

  it("lists monitors for the caller and nothing else", async () => {
    store.listMonitors.mockResolvedValueOnce([{ id: "m-1", topic: "Nickel policy" }]);
    await withServer(buildApp({ id: 7 }), async (base) => {
      const out = await jsonCall(base, "monitors", { action: "list" });
      expect(out.status).toBe(200);
      expect(out.body).toEqual({ monitors: [{ id: "m-1", topic: "Nickel policy" }] });
      expect(store.listMonitors).toHaveBeenCalledWith(7);
    });
  });
});

describe("audio upload limits at the mounted route", () => {
  const formWith = (bytes: number) => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(bytes)], "recording.webm", { type: "audio/webm" }));
    return form;
  };

  it("refuses a recording over 10 MB with a JSON error", async () => {
    await withServer(buildApp({ id: 7 }), async (base) => {
      const res = await fetch(`${base}/api/fn/voice`, {
        method: "POST",
        headers: { Authorization: "Bearer session-token" },
        body: formWith(MAX_AUDIO_BYTES + 64 * 1024),
      });
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: "Audio is limited to 10 MB." });
      expect(voiceLib.speechToText).not.toHaveBeenCalled();
    });
  });

  it("transcribes a recording under the cap and streams the text back", async () => {
    voiceLib.speechToText.mockResolvedValueOnce("alpha bravo charlie".repeat(60));
    await withServer(buildApp({ id: 7 }), async (base) => {
      const res = await fetch(`${base}/api/fn/voice`, {
        method: "POST",
        headers: { Authorization: "Bearer session-token" },
        body: formWith(4096),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      // Read it the way kemmaCloud.transcribeAudio does: accumulate the delta
      // frames, then take the transcript.done text as the final answer.
      const long = "alpha bravo charlie".repeat(60);
      const text = await res.text();
      const frames = text.split("\n\n").filter((block) => block.startsWith("data:"));
      expect(frames.length).toBeGreaterThan(2);
      let accumulated = "";
      let final = "";
      for (const block of frames) {
        if (block.slice(5).trim() === "[DONE]") continue;
        const event = JSON.parse(block.slice(5)) as { type?: string; delta?: string; text?: string };
        if (typeof event.delta === "string") accumulated += event.delta;
        if (event.type === "transcript.done") final = event.text ?? "";
      }
      expect(accumulated).toBe(long);
      expect(final).toBe(long);
      expect(frames[frames.length - 1]).toBe("data: [DONE]");
    });
  });

  it("503s when the voice key is not configured", async () => {
    voiceLib.voiceConfigured.mockReturnValue(false);
    await withServer(buildApp({ id: 7 }), async (base) => {
      const res = await fetch(`${base}/api/fn/voice`, {
        method: "POST",
        headers: { Authorization: "Bearer session-token" },
        body: formWith(2048),
      });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "Voice is not configured." });
    });
  });
});
