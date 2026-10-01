/**
 * Batch 2 audit test, item 5: /ws/intelligence must reject anonymous upgrades
 * (same cookie/bearer logic as the HTTP intelligence routes) and the server-side
 * proxy must only dial the ElevenLabs host, never a caller-supplied arbitrary URL
 * (the previous behavior was an open SSRF relay reachable with no session at all).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const state = vi.hoisted(() => ({
  upgraded: [] as string[],
  dialed: [] as string[],
  authOk: false,
}));

class FakeWebSocket {
  static OPEN = 1;
  handlers: Record<string, Array<(d?: any) => void>> = {};
  constructor(public url: string) {
    state.dialed.push(url);
  }
  on(event: string, cb: (d?: any) => void) {
    (this.handlers[event] ??= []).push(cb);
  }
  send(payload: string) {
    (this.handlers["__sent"] ??= []).forEach((cb) => cb(payload));
  }
  close() {}
}

class FakeWebSocketServer {
  static OPEN = 1;
  listeners: Record<string, Array<(...a: any[]) => void>> = {};
  on(event: string, cb: (...a: any[]) => void) {
    (this.listeners[event] ??= []).push(cb);
  }
  emit(event: string, ...args: any[]) {
    for (const cb of this.listeners[event] ?? []) cb(...args);
  }
  handleUpgrade(_req: any, _socket: any, _head: any, cb: (ws: any) => void) {
    state.upgraded.push("handleUpgrade");
    const client: any = new FakeWebSocket("client");
    client.send = (payload: string) => {
      client.__sent.push(payload);
    };
    client.__sent = [];
    cb(client);
  }
}

vi.mock("ws", () => ({
  WebSocketServer: FakeWebSocketServer,
  WebSocket: FakeWebSocket,
  default: { WebSocketServer: FakeWebSocketServer, WebSocket: FakeWebSocket },
}));

vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async (req: any) => {
      if (state.authOk) return { id: 1, openId: "open-1" };
      throw new Error("Invalid session");
    }),
  },
}));

import { setupIntelligenceWebSocket } from "./intelligence";

function upgradeRequest(path = "/ws/intelligence?id=c1&type=kemma") {
  return {
    url: path,
    headers: { host: "sutaeru.test", authorization: state.authOk ? "Bearer fake" : "" },
  };
}

function runUpgrade(server: EventEmitter, socket: any) {
  server.emit("upgrade", upgradeRequest(), socket, Buffer.alloc(0));
}

async function flush() {
  await new Promise((r) => setTimeout(r, 20));
}

let server: EventEmitter;
let socket: any;

beforeEach(() => {
  vi.resetModules();
  state.upgraded = [];
  state.dialed = [];
  state.authOk = false;
  socket = { destroy: vi.fn(), writableEnded: false };
  server = new EventEmitter();
});

describe("/ws/intelligence session gate", () => {
  it("anonymous upgrade is refused and the socket destroyed", async () => {
    const mod = await import("./intelligence");
    mod.setupIntelligenceWebSocket(server as any);
    runUpgrade(server, socket);
    await flush();
    expect(state.upgraded, "anonymous caller was upgraded to a WebSocket").not.toContain("handleUpgrade");
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("an authenticated upgrade proceeds", async () => {
    state.authOk = true;
    const mod = await import("./intelligence");
    mod.setupIntelligenceWebSocket(server as any);
    runUpgrade(server, socket);
    await flush();
    expect(state.upgraded).toContain("handleUpgrade");
    expect(socket.destroy).not.toHaveBeenCalled();
  });
});

describe("signedUrl host allowlist", () => {
  async function connectAndInit(signedUrl: string) {
    state.authOk = true;
    const mod = await import("./intelligence");
    const wssEmitter: any = mod;
    mod.setupIntelligenceWebSocket(server as any);
    runUpgrade(server, socket);
    await flush();
    // grab the fake client ws through the connection listener
    const client = lastClient;
    if (!client) throw new Error("no client ws captured");
    client.handlers["message"]![0](Buffer.from(JSON.stringify({ type: "kemma_init", signedUrl })));
    await flush();
    return client;
  }

  let lastClient: any = null;

  it("refuses to dial a non-ElevenLabs host (SSRF relay closed)", async () => {
    // capture the upgraded client by patching handleUpgrade cb
    const origEmit = FakeWebSocketServer.prototype.emit;
    FakeWebSocketServer.prototype.emit = function (this: any, ev: string, ...args: any[]) {
      if (ev === "connection") lastClient = args[0];
      return origEmit.call(this, ev, ...args);
    };
    await connectAndInit("ws://169.254.169.254/latest/meta-data/");
    expect(state.dialed).not.toContain("ws://169.254.169.254/latest/meta-data/");
  });

  it("dials a genuine wss://api.elevenlabs.io signed URL", async () => {
    const origEmit = FakeWebSocketServer.prototype.emit;
    FakeWebSocketServer.prototype.emit = function (this: any, ev: string, ...args: any[]) {
      if (ev === "connection") lastClient = args[0];
      return origEmit.call(this, ev, ...args);
    };
    const good = "wss://api.elevenlabs.io/v1/realtime?conversation_id=abc";
    await connectAndInit(good);
    expect(state.dialed).toContain(good);
  });
});
