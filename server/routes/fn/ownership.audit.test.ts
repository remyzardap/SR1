/**
 * Audit tests (area 3): who a function believes when the body argues with the session,
 * and the validation edges the per-function suites leave open.
 *
 * /api/fn is mounted behind requireSession, so (req as any).user is the signed-in row
 * and server/routes/fn/index.ts hands that id to every handler. These tests pin two
 * things: a body that carries its own userId / identityId changes nothing, and every
 * read or write is issued against the caller's own row.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  getOrCreateIdentity: vi.fn(),
  getMemoriesByIdentity: vi.fn(),
  deleteMemory: vi.fn(),
}));
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
const llm = vi.hoisted(() => ({
  complete: vi.fn(),
  stream: vi.fn(),
  LlmUnavailableError: class LlmUnavailableError extends Error {},
}));
const doc = vi.hoisted(() => ({ documentText: vi.fn() }));
const engine = vi.hoisted(() => ({ kemmaExecute: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn(), checkQuota: vi.fn() }));
const imageLib = vi.hoisted(() => ({
  generateImage: vi.fn(),
  storeImage: vi.fn(),
  listEngines: vi.fn(),
  engineAvailable: vi.fn(),
  defaultEngine: vi.fn().mockReturnValue("gemini"),
  logImageUsage: vi.fn(),
  ImageNotConfiguredError: class ImageNotConfiguredError extends Error {},
  ImageTimeoutError: class ImageTimeoutError extends Error {},
  ImageUpstreamError: class ImageUpstreamError extends Error {},
  ImageBlockedError: class ImageBlockedError extends Error {},
  resolveImageEngine: vi.fn(async (o: { engine: string }) => ({ blocked: false, engine: o.engine, routed: false })),
  ENGINE_IDS: ["gemini", "qwen", "openai"],
  ENGINE_LABELS: { gemini: "Gemini", qwen: "Qwen", openai: "OpenAI" },
  QUALITIES: ["standard", "high"],
  ASPECT_RATIOS: ["1:1", "16:9", "9:16", "4:3", "3:4"],
}));
const jobs = vi.hoisted(() => ({ enqueueJob: vi.fn(), registerJob: vi.fn() }));

vi.mock("../../db", () => db);
vi.mock("../../kemma/executors/vpsFiles", () => ({ isAdminUser: vi.fn(async () => false) }));
vi.mock("../../lib/fnStore", () => store);
vi.mock("../../lib/fnLlm", () => ({ complete: llm.complete, stream: llm.stream, LlmUnavailableError: llm.LlmUnavailableError }));
vi.mock("../../lib/fnDocument", () => doc);
vi.mock("../../lib/fnImage", () => imageLib);
vi.mock("../../core/jobs", () => jobs);
vi.mock("../../kemma/engine", () => engine);
vi.mock("../../core/quotaCheck", () => quota);

import { handleMemories } from "./memories";
import { handleMonitors } from "./monitors";
import { handleDocumentBrief } from "./documentBrief";
import { handleImage } from "./image";
import { handleResearch } from "./research";
import { FnError } from "../../lib/fnErrors";

const CALLER = 7;
const FOREIGN = 99;

function fakeRes() {
  return {
    statusCode: 200,
    body: null as unknown,
    frames: [] as string[],
    writableEnded: false,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader() {},
    flushHeaders() {
      this.headersSent = true;
    },
    write(chunk: string) {
      this.frames.push(chunk);
    },
    end() {
      this.writableEnded = true;
    },
    on() {},
  };
}

const req = (body: unknown) => ({ body, on: () => {} } as never);

const memoryRow = {
  id: 11,
  type: "fact" as const,
  content: "Ships on Tuesdays.",
  sourceApp: "chat",
  title: null,
  createdAt: new Date("2026-03-01T10:00:00.000Z"),
};

async function call(handler: (userId: number, req: never, res: never) => Promise<void>, body: unknown) {
  const res = fakeRes();
  await handler(CALLER, req(body), res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.getOrCreateIdentity.mockResolvedValue({ id: 400, userId: CALLER });
  db.getMemoriesByIdentity.mockResolvedValue([memoryRow]);
  db.deleteMemory.mockResolvedValue(undefined);
  store.getUserSetting.mockResolvedValue(undefined);
  store.listMonitors.mockResolvedValue([]);
  store.listMonitorRuns.mockResolvedValue([]);
  store.countMonitors.mockResolvedValue(0);
  store.getMonitor.mockResolvedValue(null);
  llm.complete.mockResolvedValue({ text: '{"memories":[]}', model: "m", provider: "qwen", inputTokens: 1, outputTokens: 1 });
  llm.stream.mockResolvedValue({ text: "brief", model: "m", provider: "qwen", inputTokens: 0, outputTokens: 0 });
  doc.documentText.mockResolvedValue({ text: "a readable document", chars: 19 });
  imageLib.engineAvailable.mockReturnValue(true);
  imageLib.listEngines.mockReturnValue([]);
  imageLib.storeImage.mockResolvedValue({ key: "k", url: "/files/k.png", sizeBytes: 10 });
  imageLib.generateImage.mockResolvedValue({ engine: "gemini", model: "m", mimeType: "image/png", buffer: Buffer.alloc(10), width: 1, height: 1 });
  quota.checkQuota.mockResolvedValue({ allowed: true, remaining: 5 });
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  engine.kemmaExecute.mockResolvedValue({
    response: "answer",
    toolCalls: [],
    isAgentic: false,
    tokensUsed: { input: 1, output: 1, total: 2 },
    modelsUsed: ["m"],
    stepsUsed: 1,
    durationMs: 1,
    sources: [],
  });
});

describe("the session id wins over anything in the body", () => {
  it("memories list reads the caller's identity and ignores an identityId in the body", async () => {
    await call(handleMemories, { action: "list", identityId: FOREIGN, userId: FOREIGN, id: FOREIGN });
    expect(db.getOrCreateIdentity).toHaveBeenCalledWith(CALLER);
    expect(db.getMemoriesByIdentity).toHaveBeenCalledWith(400, undefined);
  });

  it("memories delete passes the caller's identity next to the row id", async () => {
    await call(handleMemories, { action: "delete", id: 11, identityId: FOREIGN });
    expect(db.deleteMemory).toHaveBeenCalledWith(11, 400);
  });

  it("memories setSetting stores against the caller only", async () => {
    await call(handleMemories, { action: "setSetting", enabled: false, userId: FOREIGN });
    expect(store.setUserSetting).toHaveBeenCalledWith(CALLER, "livingMemoryEnabled", false);
  });

  it("monitors list, runs and create all use the caller", async () => {
    await call(handleMonitors, { action: "list", userId: FOREIGN });
    expect(store.listMonitors).toHaveBeenCalledWith(CALLER);
    await call(handleMonitors, { action: "runs", userId: FOREIGN });
    expect(store.listMonitorRuns).toHaveBeenCalledWith(CALLER, 50);
    await call(handleMonitors, { action: "create", topic: "nickel export policy", frequency: "daily", userId: FOREIGN });
    expect(store.createMonitor).toHaveBeenCalledWith(expect.objectContaining({ userId: CALLER }));
  });

  it("research runs the engine as the caller whatever the body claims", async () => {
    await call(handleResearch, { messages: [{ role: "user", content: "nickel?" }], userId: FOREIGN });
    expect(quota.checkQuota).toHaveBeenCalledWith(CALLER, "message");
    expect(engine.kemmaExecute).toHaveBeenCalledWith(expect.objectContaining({ userId: CALLER }));
  });

  it("document-brief extracts and bills as the caller", async () => {
    await call(handleDocumentBrief, { filename: "notes.md", text: "a note", userId: FOREIGN });
    expect(doc.documentText).toHaveBeenCalledWith(expect.objectContaining({ filename: "notes.md" }), CALLER);
  });

  it("image stores for the caller", async () => {
    await call(handleImage, { action: "generate", prompt: "a lighthouse", userId: FOREIGN });
    expect(imageLib.storeImage).toHaveBeenCalledWith(CALLER, "a lighthouse", expect.anything());
  });
});

describe("rows that are not the caller's stay out of reach", () => {
  it("setActive on someone else's monitor is a 404 before any write", async () => {
    // getMonitor is the (userId, id) pair, so a foreign row simply is not found.
    store.getMonitor.mockResolvedValueOnce(null);
    await expect(call(handleMonitors, { action: "setActive", id: "other-monitor", active: false })).rejects.toMatchObject({ status: 404 });
    expect(store.getMonitor).toHaveBeenCalledWith(CALLER, "other-monitor");
    expect(store.setActiveMonitor).not.toHaveBeenCalled();
  });

  it("remove on someone else's monitor is a 404 and deletes nothing", async () => {
    await expect(call(handleMonitors, { action: "remove", id: "other-monitor" })).rejects.toMatchObject({ status: 404 });
    expect(store.removeMonitor).not.toHaveBeenCalled();
  });

  it("the monitor id has to be an opaque id the caller could not have forged into a row", async () => {
    await expect(call(handleMonitors, { action: "remove", id: "a".repeat(65) })).rejects.toMatchObject({ status: 400, message: "Id is too long (max 64)." });
    await expect(call(handleMonitors, { action: "remove", id: 7 })).rejects.toMatchObject({ status: 400, message: "Id is required." });
  });
});

describe("validation edges the per-function suites leave open", () => {
  it("a body that is an array or a scalar is a 400, not a crash", async () => {
    for (const body of [[], "text", 42, null, undefined]) {
      await expect(call(handleMemories, body as never)).rejects.toMatchObject({ status: 400, message: "A JSON body is required." });
    }
  });

  it("an action longer than the selector window is refused", async () => {
    await expect(call(handleMemories, { action: `x${"a".repeat(80)}` })).rejects.toMatchObject({ status: 400, message: "Action is too long (max 64)." });
  });

  it("memory ids accept the numeric string form and refuse everything else", async () => {
    await call(handleMemories, { action: "delete", id: "11" });
    expect(db.deleteMemory).toHaveBeenCalledWith(11, 400);
    for (const id of ["11.5", "1e3", " 11", "abc", "", true, 0, -3, null, undefined]) {
      await expect(call(handleMemories, { action: "delete", id })).rejects.toMatchObject({ status: 400 });
    }
  });

  it("a monitor frequency is matched after trimming, and nothing else is", async () => {
    await call(handleMonitors, { action: "create", topic: "nickel export policy", frequency: " daily " });
    expect(store.createMonitor).toHaveBeenCalledWith(expect.objectContaining({ frequency: "daily" }));
    await expect(call(handleMonitors, { action: "create", topic: "nickel export policy", frequency: "hourly" })).rejects.toMatchObject({ status: 400 });
  });

  it("control characters and emoji survive the text readers untouched but a whitespace-only field does not", async () => {
    await expect(call(handleMemories, { action: "delete", id: " " })).rejects.toBeInstanceOf(FnError);
    const out = await call(handleMonitors, { action: "create", topic: "nickel\u0000 policy \u{1F500} here", frequency: "daily" });
    expect(store.createMonitor).toHaveBeenCalledWith(expect.objectContaining({ topic: "nickel\u0000 policy \u{1F500} here" }));
    expect(out.body).toMatchObject({ ok: true });
  });

  it("a prompt counted in UTF-16 units: the 2000 limit is code units, not characters", async () => {
    const emoji = "\u{1F5FC}".repeat(1000); // 2000 code units, 1000 visible characters
    await call(handleImage, { action: "generate", prompt: emoji });
    expect(imageLib.generateImage).toHaveBeenCalledTimes(1);
    await expect(call(handleImage, { action: "generate", prompt: `${emoji}\u{1F5FC}` })).rejects.toMatchObject({
      status: 400,
      message: "Prompt is too long (max 2000).",
    });
  });

  it("an empty messages array and an empty files array are not the same thing", async () => {
    await expect(call(handleResearch, { messages: [] })).rejects.toMatchObject({ status: 400, message: "messages required" });
    await call(handleResearch, { messages: [{ role: "user", content: "q" }], files: [] });
    expect(engine.kemmaExecute).toHaveBeenCalled();
    await call(handleResearch, { messages: [{ role: "user", content: "q" }], files: null });
    expect(engine.kemmaExecute).toHaveBeenCalledTimes(2);
  });
});

// No helper: the handlers take the session id from index.ts and nothing else.
