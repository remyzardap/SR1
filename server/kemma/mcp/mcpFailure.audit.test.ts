import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// MCP failure paths with the SDK mocked, so no process is spawned and no socket
// is opened. Goal: a broken MCP server (bad command, failed connect, hanging or
// failing callTool, invalid config file) must degrade to "no mcp tools", never
// crash or block the chat run.

const ctl = vi.hoisted(() => ({
  connectBehavior: async (_t: unknown): Promise<void> => {},
  listTools: async (): Promise<{ tools: unknown[] }> => ({ tools: [] }),
  callTool: async (): Promise<any> => ({ content: [{ type: "text", text: "ok" }] }),
  close: async (): Promise<void> => {},
  connects: [] as unknown[],
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class FakeClient {
    constructor(_i: unknown, _v: unknown) {}
    connect(transport: unknown) {
      ctl.connects.push(transport);
      return ctl.connectBehavior(transport);
    }
    listTools() {
      return ctl.listTools();
    }
    callTool(...args: unknown[]) {
      return (ctl.callTool as (...a: unknown[]) => Promise<any>)(...args);
    }
    close() {
      return ctl.close();
    }
  },
}));
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class FakeStdio {
    constructor(public opts: unknown) {}
  },
}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class FakeHttp {
    constructor(public opts: unknown) {}
  },
}));

import { McpRegistry, getMcpRegistry } from "./client";
import { loadMcpConfig, parseMcpConfig } from "./config";

const stdioCfg = (command: string, tools: Record<string, string> = { echo: "read" }) => ({
  servers: { broken: { enabled: true, transport: "stdio", command, args: [], envVars: [], tools } },
});

beforeEach(() => {
  ctl.connectBehavior = async () => {};
  ctl.listTools = async () => ({ tools: [{ name: "echo", description: "echo it", inputSchema: { type: "object", properties: { message: { type: "string" } } } }] });
  ctl.callTool = async () => ({ content: [{ type: "text", text: "ok" }] });
  ctl.close = async () => {};
  ctl.connects = [];
});

describe("config loading is boot-safe", () => {
  const tmpFiles: string[] = [];
  afterEach(async () => {
    for (const f of tmpFiles) await fs.rm(f, { force: true });
    tmpFiles.length = 0;
  });

  it("missing config file means an empty registry, no throw", () => {
    const loaded = loadMcpConfig(path.join(os.tmpdir(), `nope-${process.pid}-mcp.json`));
    expect(loaded.config.servers).toEqual({});
    expect(loaded.rejected).toEqual([]);
  });

  it("the checked-in mcp.config.json parses and every server ships disabled", () => {
    const loaded = loadMcpConfig(path.resolve(process.cwd(), "mcp.config.json"));
    const servers = Object.entries(loaded.config.servers);
    expect(servers.length).toBeGreaterThan(0);
    expect(servers.every(([, cfg]) => !cfg.enabled)).toBe(true);
    // so a boot with zero credentials spawns nothing: tools() resolves to []
  });

  it("invalid JSON throws from loadMcpConfig, and a registry built from it never starts", async () => {
    const file = path.join(os.tmpdir(), `bad-${process.pid}-mcp.json`);
    tmpFiles.push(file);
    await fs.writeFile(file, "{ this is not json ");
    expect(() => loadMcpConfig(file)).toThrow();
    // the engine call site wraps getMcpRegistry().tools() in try/catch; emulate it:
    // a throw here must be containable with no partial state leaking
    let caught = "";
    try {
      await new McpRegistry(loadMcpConfig(file)).tools();
    } catch (err) {
      caught = (err as Error).message;
    }
    expect(caught).not.toBe("");
    expect(ctl.connects).toHaveLength(0);
  });
});

describe("spawn/connect failures never reach the chat", () => {
  it("a stdio server whose connect throws is skipped: tools() resolves to []", async () => {
    ctl.connectBehavior = async () => {
      throw new Error("spawn /nonexistent-mcp-binary ENOENT");
    };
    const reg = new McpRegistry(parseMcpConfig(stdioCfg("/nonexistent-mcp-binary")));
    await expect(reg.tools()).resolves.toEqual([]);
  });

  it("an http server whose connect throws (timeout/DNS) is skipped", async () => {
    ctl.connectBehavior = async () => {
      const e = new Error("Request timed out");
      throw e;
    };
    const reg = new McpRegistry(parseMcpConfig({
      servers: { remote: { enabled: true, transport: "http", url: "https://example.invalid/mcp", args: [], envVars: [], tools: { thing: "read" } } },
    }));
    await expect(reg.tools()).resolves.toEqual([]);
  });

  it("a model calling an unknown/broken MCP tool gets an error result, not an exception", async () => {
    ctl.connectBehavior = async () => {
      throw new Error("ENOENT");
    };
    const reg = new McpRegistry(parseMcpConfig(stdioCfg("nope")));
    const r = await reg.call("mcp__broken__echo", { message: "hi" });
    expect(r).toEqual({ ok: false, error: "Unknown MCP tool: mcp__broken__echo" });
  });

  it("a listTools failure skips the server too", async () => {
    ctl.listTools = async () => {
      throw new Error("server exited mid-handshake");
    };
    const reg = new McpRegistry(parseMcpConfig(stdioCfg("npx")));
    await expect(reg.tools()).resolves.toEqual([]);
  });

  it("FIXED: connect/listTools have a 15s timeout; a hanging MCP server can never wedge tools()", async () => {
    vi.useFakeTimers();
    try {
      ctl.connectBehavior = () => new Promise<void>(() => {}); // never settles
      const reg = new McpRegistry(parseMcpConfig(stdioCfg("npx")));
      let out: unknown = "pending";
      reg.tools().then((t) => (out = t));
      await vi.advanceTimersByTimeAsync(16_000); // past CONNECT_TIMEOUT_MS
      expect(out).toEqual([]); // server skipped via the timeout path, run continues
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("callTool failure and shaping", () => {
  async function registryWith(tools: Record<string, unknown>) {
    ctl.listTools = async () => ({
      tools: Object.keys(tools).map((n) => ({ name: n, description: `does ${n}`, inputSchema: { type: "object", properties: {} } })),
    });
    return new McpRegistry(parseMcpConfig({
      servers: { s: { enabled: true, transport: "stdio", command: "npx", args: [], envVars: [], tools } },
    }));
  }

  it("only allowlisted, non-forbidden, non-confirm tools are offered", async () => {
    ctl.listTools = async () => ({
      tools: [
        { name: "read_ok", description: "r", inputSchema: { type: "object", properties: {} } },
        { name: "make_draft", description: "d", inputSchema: { type: "object", properties: {} } },
        { name: "do-send-mail", description: "f", inputSchema: { type: "object", properties: {} } },
        { name: "confirm-thing", description: "c", inputSchema: { type: "object", properties: {} } },
        { name: "ghost_not_in_allowlist", description: "g", inputSchema: { type: "object", properties: {} } },
      ],
    });
    const reg = new McpRegistry(parseMcpConfig({
      servers: { s: { enabled: true, transport: "stdio", command: "npx", args: [], envVars: [], tools: { read_ok: "read", make_draft: "draft", "do-send-mail": "read", "confirm-thing": "confirm" } } },
    }));
    const names = (await reg.tools()).map((t) => t.name);
    expect(names).toContain("mcp__s__read_ok");
    expect(names).toContain("mcp__s__make_draft");
    expect(names.some((n) => n.includes("send"))).toBe(false); // forbidden word
    expect(names.some((n) => n.includes("confirm"))).toBe(false); // held back
    expect(names.some((n) => n.includes("ghost"))).toBe(false); // not in allowlist
  });

  it("a confirm-mode tool cannot be invoked even by exact name", async () => {
    const reg = await registryWith({ "approve-me": "confirm" } as any);
    const r = await reg.call("mcp__s__approve-me", {});
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/confirmation/);
  });

  it("a callTool that rejects (timeout) returns ok:false with the message", async () => {
    const reg = await registryWith({ echo: "read" } as any);
    ctl.callTool = async () => {
      throw new Error("McpError: MCP error -32001: Request timed out");
    };
    const r = await reg.call("mcp__s__echo", {});
    expect(r).toEqual({ ok: false, error: "McpError: MCP error -32001: Request timed out" });
  });

  it("isError results surface as ok:false; long text is capped at 20k chars; non-text parts are elided", async () => {
    const reg = await registryWith({ echo: "read" } as any);
    ctl.callTool = async () => ({ isError: true, content: [{ type: "text", text: "bad input" }] });
    expect(await reg.call("mcp__s__echo", {})).toEqual({ ok: false, error: "bad input" });

    // image part first so the elision marker survives the 20k slice
    ctl.callTool = async () => ({ content: [{ type: "image", data: "x" }, { type: "text", text: "y".repeat(25_000) }] });
    const big = await reg.call("mcp__s__echo", {});
    expect(big.ok).toBe(true);
    expect((big as { text: string }).text.length).toBe(20_000);
    expect((big as { text: string }).text).toContain("[image content omitted]");
  });
});

describe("shared registry with the real env-driven config", () => {
  const savedEnv = process.env.MCP_CONFIG;
  const tmpFile = path.join(os.tmpdir(), `shared-${process.pid}-mcp.json`);

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.MCP_CONFIG;
    else process.env.MCP_CONFIG = savedEnv;
  });

  it("all servers disabled => tools() resolves with none offered and nothing connects", async () => {
    await fs.writeFile(tmpFile, JSON.stringify({ servers: { a: { enabled: false, transport: "stdio", command: "npx", args: [], tools: { x: "read" } } } }));
    process.env.MCP_CONFIG = tmpFile;
    ctl.connectBehavior = async () => {
      throw new Error("must not be called when every server is disabled");
    };
    const reg = getMcpRegistry();
    await expect(reg.tools()).resolves.toEqual([]);
    expect(reg.rejected).toEqual([]);
    expect(ctl.connects).toHaveLength(0);
    await fs.rm(tmpFile, { force: true });
  });
});
