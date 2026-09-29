import { describe, it, expect, vi, beforeEach } from "vitest";

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
const handlers = vi.hoisted(() => ({
  handleMemories: vi.fn(),
  handleMonitors: vi.fn(),
  handleDocumentBrief: vi.fn(),
  handleChatInsights: vi.fn(),
  handleResearch: vi.fn(),
  handleVoice: vi.fn(),
  parseAudio: vi.fn(),
}));

vi.mock("../../lib/fnStore", () => store);
vi.mock("./memories", () => ({ handleMemories: handlers.handleMemories }));
vi.mock("./monitors", () => ({ handleMonitors: handlers.handleMonitors }));
vi.mock("./documentBrief", () => ({ handleDocumentBrief: handlers.handleDocumentBrief }));
vi.mock("./chatInsights", () => ({ handleChatInsights: handlers.handleChatInsights }));
vi.mock("./research", () => ({ handleResearch: handlers.handleResearch }));
vi.mock("./voice", () => ({ handleVoice: handlers.handleVoice, parseAudio: handlers.parseAudio }));

import { handleFnRequest, resolveFunction } from "./index";
import { FnError } from "../../lib/fnErrors";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    headersSent: false,
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
    },
  };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.parseAudio.mockImplementation((_req: unknown, _res: unknown, next: () => void) => next());
});

describe("the /api/fn mount point", () => {
  it("routes the six names the client calls", () => {
    expect(resolveFunction("memories")).toBe(handlers.handleMemories);
    expect(resolveFunction("monitors")).toBe(handlers.handleMonitors);
    expect(resolveFunction("document-brief")).toBe(handlers.handleDocumentBrief);
    expect(resolveFunction("chat-insights")).toBe(handlers.handleChatInsights);
    expect(resolveFunction("research")).toBe(handlers.handleResearch);
    expect(resolveFunction("voice")).toBe(handlers.handleVoice);
  });

  it("does not resolve object properties that are not functions", () => {
    for (const name of ["constructor", "toString", "__proto__", "nope"]) {
      expect(resolveFunction(name)).toBeUndefined();
    }
  });

  it("404s an unknown function without touching a handler", async () => {
    const res = fakeRes();
    await handleFnRequest({ params: { name: "unknown" }, user: { id: 7 } } as never, res as never);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Unknown function." });
    expect(handlers.handleMemories).not.toHaveBeenCalled();
  });

  it("requires a signed-in user before dispatching", async () => {
    await expect(handleFnRequest({ params: { name: "memories" } } as never, fakeRes() as never)).rejects.toMatchObject({
      status: 401,
      message: "Sign in to continue.",
    });
    await expect(handleFnRequest({ params: { name: "research" }, user: { id: "7" } } as never, fakeRes() as never)).rejects.toMatchObject({
      status: 401,
    });
    expect(handlers.handleResearch).not.toHaveBeenCalled();
  });

  it("hands each handler the session user id, so every query is scoped", async () => {
    const res = fakeRes();
    const req = { params: { name: "monitors" }, user: { id: 7 } };
    await handleFnRequest(req as never, res as never);
    expect(handlers.handleMonitors).toHaveBeenCalledWith(7, req, res);

    const insightsRes = fakeRes();
    const insightsReq = { params: { name: "chat-insights" }, user: { id: 9 } };
    await handleFnRequest(insightsReq as never, insightsRes as never);
    expect(handlers.handleChatInsights).toHaveBeenCalledWith(9, insightsReq, insightsRes);
  });

  it("passes a handler's FnError up for the router error handler", async () => {
    handlers.handleMemories.mockRejectedValueOnce(new FnError(429, "You can monitor up to 20 topics."));
    await expect(handleFnRequest({ params: { name: "memories" }, user: { id: 7 } } as never, fakeRes() as never)).rejects.toBeInstanceOf(FnError);
  });
});
