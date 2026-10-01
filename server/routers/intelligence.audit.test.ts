import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";

// ─── Module fakes ─────────────────────────────────────────────────────────────

const agents = vi.hoisted(() => ({
  sendMessage: vi.fn(async () => ({ response: "agent answer" })),
  getAgentStatus: vi.fn(() => [{ id: "gemini", up: true }]),
  detectQueryType: vi.fn(() => "chat"),
  AGENTS: { gemini: { name: "Gemini" } },
}));

vi.mock("../services/blendedAgents", () => agents);

const wsState = vi.hoisted(() => ({
  handleUpgradeCalls: [] as Array<{ url: string }>,
  createdSockets: [] as string[],
}));

vi.mock("ws", () => {
  class FakeWebSocket {
    static OPEN = 1;
    readyState = 1;
    handlers: Record<string, Array<(arg?: unknown) => void>> = {};
    sent: string[] = [];
    constructor(url?: string) {
      if (url) wsState.createdSockets.push(url);
    }
    on(ev: string, cb: (arg?: unknown) => void) {
      (this.handlers[ev] ||= []).push(cb);
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      (this.handlers["close"] || []).forEach((cb) => cb());
    }
    emit(ev: string, ...args: unknown[]) {
      (this.handlers[ev] || []).forEach((cb) => (cb as (...a: unknown[]) => void)(...args));
    }
  }
  class FakeWebSocketServer {
    handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    on(ev: string, cb: (...args: unknown[]) => void) {
      (this.handlers[ev] ||= []).push(cb);
    }
    handleUpgrade(req: { url?: string }, _socket: unknown, _head: unknown, cb: (ws: unknown) => void) {
      wsState.handleUpgradeCalls.push({ url: String(req.url) });
      cb(new FakeWebSocket());
    }
    emit(ev: string, ...args: unknown[]) {
      (this.handlers[ev] || []).forEach((cb) => cb(...args));
    }
  }
  return { WebSocketServer: FakeWebSocketServer, WebSocket: FakeWebSocket };
});

const ENV_NAMES = ["ELEVEN_LABS_API_KEY", "ELEVEN_LABS_AGENT_ID", "ELEVEN_LABS_VOICE_ID"];
const saved = new Map<string, string | undefined>();

async function loadModule() {
  vi.resetModules();
  return import("./intelligence");
}

beforeEach(() => {
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.ELEVEN_LABS_API_KEY = "el-key";
  process.env.ELEVEN_LABS_AGENT_ID = "agent-1";
  process.env.ELEVEN_LABS_VOICE_ID = "voice-1";
  agents.sendMessage.mockClear();
  wsState.handleUpgradeCalls = [];
  wsState.createdSockets = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

function pickHandler(router: any, method: string, path: string) {
  for (const layer of router.stack ?? []) {
    const route = layer.route;
    if (route && route.path === path && route.methods[method]) {
      return route.stack[route.stack.length - 1].handle;
    }
  }
  throw new Error(`no ${method} ${path} route`);
}

function fakeRes() {
  const out: { status: number | null; json: unknown } = { status: null, json: null };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(payload: unknown) {
      out.json = payload;
      return this;
    },
  };
  return { res, out };
}

const okJson = (obj: unknown) =>
  new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });

// ─── HTTP handlers ───────────────────────────────────────────────────────────

describe("intelligence chat handler (audit)", () => {
  it("exposes only chat/agents/kemma routes: memory add/search/forget is NOT here", async () => {
    const { default: router } = await loadModule();
    const paths = (router.stack ?? [])
      .filter((l: any) => l.route)
      .map((l: any) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`)
      .sort();
    expect(paths).toEqual([
      "get /agents",
      "post /chat",
      "post /kemma/analyze",
      "post /kemma/call",
      "post /kemma/end",
    ]);
  });

  it("400s a message-less body", async () => {
    const { default: router } = await loadModule();
    const { res, out } = fakeRes();
    await pickHandler(router, "post", "/chat")({ body: {}, user: { id: 1 } }, res);
    expect(out.status).toBe(400);
  });

  it("blends through agents.sendMessage WITHOUT any user identity", async () => {
    const { default: router } = await loadModule();
    const { res, out } = fakeRes();
    await pickHandler(router, "post", "/chat")(
      { body: { message: "hi", options: { blend: true } }, user: { id: 7 } },
      res
    );
    expect(out.json).toEqual({ success: true, response: "agent answer", queryType: "chat" });
    // The req user id is read into a variable that is never used: no per-user
    // quota, attribution, or memory scoping happens on this route.
    expect(agents.sendMessage.mock.calls[0]).toEqual(["hi", { blend: true, preferredModel: undefined, activeAgentIds: undefined }]);
  });
});

describe("intelligence kemma/call handler (audit)", () => {
  it("creates the ElevenLabs session with the env key and returns the ws url", async () => {
    const fetchMock = vi.fn(async (url: unknown, init: any) => {
      if (String(url).includes("api.elevenlabs.io")) {
        return okJson({ signed_url: "wss://eleven.test/conversation", conversation_id: "conv-1" });
      }
      throw new Error("unexpected fetch " + String(url));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { default: router } = await loadModule();
    const { res, out } = fakeRes();
    await pickHandler(router, "post", "/kemma/call")(
      { body: { callerName: "Bob" }, user: { id: 1 } },
      res
    );
    expect(out.status).toBeNull();
    expect(out.json).toMatchObject({
      success: true,
      session: { conversationId: "conv-1", signedUrl: "wss://eleven.test/conversation" },
    });
    const [, init] = (fetchMock as any).mock.calls[0];
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("el-key");
    const sentBody = JSON.parse(String(init.body));
    expect(sentBody.agent_id).toBe("agent-1");
    expect(sentBody.conversation_config.tts.voice_id).toBe("voice-1");
  });

  it("with ELEVEN_LABS_API_KEY unset it still calls upstream with an EMPTY key and returns 500 details", async () => {
    delete process.env.ELEVEN_LABS_API_KEY;
    const fetchMock = vi.fn(async () => new Response("{\"detail\":\"Invalid API key\"}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const { default: router } = await loadModule();
    const { res, out } = fakeRes();
    await pickHandler(router, "post", "/kemma/call")({ body: { callerName: "Bob" } }, res);
    // No config guard: the request goes out with xi-api-key: "" ...
    const [, init] = (fetchMock as any).mock.calls[0];
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("");
    // ... and the 401 body text is reflected to the client inside details.
    expect(out.status).toBe(500);
    expect(String((out.json as Record<string, unknown>).details)).toContain("Invalid API key");
  });

  it("400s without a callerName", async () => {
    const { default: router } = await loadModule();
    const { res, out } = fakeRes();
    await pickHandler(router, "post", "/kemma/call")({ body: {} }, res);
    expect(out.status).toBe(400);
  });
});

describe("intelligence kemma/end handler (audit)", () => {
  it("ends the call then fetches history; history failure becomes 500", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init: any) => {
        urls.push(`${init?.method ?? "GET"} ${String(url)}`);
        if (String(url).endsWith("/end")) return okJson({});
        return okJson({ transcript: [{ speaker: "agent", text: "hi" }] });
      })
    );
    const { default: router } = await loadModule();
    const { res, out } = fakeRes();
    await pickHandler(router, "post", "/kemma/end")({ body: { conversationId: "c-9" } }, res);
    expect(out.json).toMatchObject({ success: true, history: { transcript: [{ speaker: "agent", text: "hi" }] } });
    expect(urls).toEqual([
      "POST https://api.elevenlabs.io/v1/convai/conversation/c-9/end",
      "GET https://api.elevenlabs.io/v1/convai/conversation/c-9",
    ]);

    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => (String(url).endsWith("/end") ? okJson({}) : new Response("nope", { status: 500 }))));
    const { res: res2, out: out2 } = fakeRes();
    await pickHandler(router, "post", "/kemma/end")({ body: { conversationId: "c-9" } }, res2);
    expect(out2.status).toBe(500);
  });

  it("400s without conversationId", async () => {
    const { default: router } = await loadModule();
    const { res, out } = fakeRes();
    await pickHandler(router, "post", "/kemma/end")({ body: {} }, res);
    expect(out.status).toBe(400);
  });
});

describe("intelligence kemma/analyze handler (audit)", () => {
  it("detects scheduling and urgency from caller lines only", async () => {
    const { default: router } = await loadModule();
    const { res, out } = fakeRes();
    await pickHandler(router, "post", "/kemma/analyze")(
      {
        body: {
          transcript: [
            { speaker: "agent", text: "emergency nonsense tomorrow" },
            { speaker: "caller", text: "Can we talk tomorrow at 3pm? It is urgent." },
          ],
        },
      },
      res
    );
    const a = (out.json as { analysis: Record<string, unknown> }).analysis;
    expect(a.hasSchedulingIntent).toBe(true);
    expect(a.isUrgent).toBe(true);
    expect(a.suggestedTimes).toContain("3pm");
    expect(a.suggestedTimes).toContain("tomorrow");
    expect(a.messageLeft).toContain("It is urgent");
  });

  it("400s when transcript is missing or not an array", async () => {
    const { default: router } = await loadModule();
    const { res, out } = fakeRes();
    await pickHandler(router, "post", "/kemma/analyze")({ body: {} }, res);
    expect(out.status).toBe(400);
    const { res: res2, out: out2 } = fakeRes();
    await pickHandler(router, "post", "/kemma/analyze")({ body: { transcript: "text" } }, res2);
    expect(out2.status).toBe(400);
  });

  it("empty transcript reports no transcript available", async () => {
    const { default: router } = await loadModule();
    const { res, out } = fakeRes();
    await pickHandler(router, "post", "/kemma/analyze")({ body: { transcript: [] } }, res);
    const a = (out.json as { analysis: Record<string, unknown> }).analysis;
    expect(a.summary).toBe("No transcript available");
    expect(a.hasSchedulingIntent).toBe(false);
  });
});

// ─── WebSocket /ws/intelligence ──────────────────────────────────────────────

describe("intelligence websocket (audit)", () => {
  it("accepts the /ws/intelligence upgrade with NO session check", async () => {
    const { setupIntelligenceWebSocket } = await loadModule();
    const server = new EventEmitter();
    setupIntelligenceWebSocket(server as any);
    const socket = new EventEmitter() as any;
    socket.write = () => {};
    socket.destroy = () => {};
    // Anonymous request: no Cookie header, nothing to authenticate against.
    server.emit("upgrade", { url: "/ws/intelligence?id=x&type=kemma", headers: { host: "srv" } }, socket, Buffer.alloc(0));
    expect(wsState.handleUpgradeCalls).toHaveLength(1);
  });

  it("ignores upgrades for other paths", async () => {
    const { setupIntelligenceWebSocket } = await loadModule();
    const server = new EventEmitter();
    setupIntelligenceWebSocket(server as any);
    const socket = new EventEmitter() as any;
    server.emit("upgrade", { url: "/ws/something-else", headers: { host: "srv" } }, socket, Buffer.alloc(0));
    expect(wsState.handleUpgradeCalls).toHaveLength(0);
  });

  it("opens a server-side WebSocket to ANY caller-supplied signedUrl (SSRF seam, unauthenticated)", async () => {
    const { setupIntelligenceWebSocket } = await loadModule();
    const { WebSocket: FakeWS } = await import("ws");
    const server = new EventEmitter();
    const wss = setupIntelligenceWebSocket(server as any) as any;
    const client = new (FakeWS as unknown as new () => any)();
    wss.emit("connection", client, { url: "/ws/intelligence?id=c1", headers: { host: "srv" } });
    // Handshake message proves the connection is live without any auth.
    const hello = JSON.parse(client.sent[0]);
    expect(hello.type).toBe("connected");
    client.emit(
      "message",
      Buffer.from(JSON.stringify({ type: "kemma_init", signedUrl: "ws://169.254.169.254/latest/meta-data/", conversationId: "c" }))
    );
    // The server connected out to the attacker-chosen URL.
    expect(wsState.createdSockets).toContain("ws://169.254.169.254/latest/meta-data/");
  });
});
