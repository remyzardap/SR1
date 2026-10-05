/**
 * P1-02's MCP adapter: mode -> risk mapping, and confirm-mode tools staying hidden from the model
 * until flag("APPROVALS") is on. The SDK is mocked (no process spawned, no socket opened).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ctl = vi.hoisted(() => ({
  listTools: async (): Promise<{ tools: unknown[] }> => ({
    tools: [
      { name: "read_thing", description: "reads", inputSchema: { type: "object", properties: {} } },
      { name: "draft_thing", description: "drafts", inputSchema: { type: "object", properties: {} } },
      { name: "confirm_thing", description: "needs confirmation", inputSchema: { type: "object", properties: {} } },
    ],
  }),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class FakeClient {
    constructor(_i: unknown, _v: unknown) {}
    connect() { return Promise.resolve(); }
    listTools() { return ctl.listTools(); }
    callTool() { return Promise.resolve({ content: [] }); }
    close() { return Promise.resolve(); }
  },
}));
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class { constructor(public opts: unknown) {} },
}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class { constructor(public opts: unknown) {} },
}));

import { McpRegistry, riskForMcpMode } from "./client";
import { parseMcpConfig } from "./config";

const cfg = () =>
  parseMcpConfig({
    servers: {
      s: {
        enabled: true,
        transport: "stdio",
        command: "npx",
        args: [],
        envVars: [],
        tools: { read_thing: "read", draft_thing: "draft", confirm_thing: "confirm" },
      },
    },
  });

const savedFF = process.env.FF_APPROVALS;
afterEach(() => {
  if (savedFF === undefined) delete process.env.FF_APPROVALS;
  else process.env.FF_APPROVALS = savedFF;
});
beforeEach(() => {
  delete process.env.FF_APPROVALS;
});

describe("riskForMcpMode", () => {
  it("maps read -> read, no approval", () => {
    expect(riskForMcpMode("read")).toEqual({ risk: "read", requiresApproval: false });
  });
  it("maps draft -> write, no approval (it only stages a draft)", () => {
    expect(riskForMcpMode("draft")).toEqual({ risk: "write", requiresApproval: false });
  });
  it("maps confirm -> write, requires approval", () => {
    expect(riskForMcpMode("confirm")).toEqual({ risk: "write", requiresApproval: true });
  });
});

describe("confirm-mode tools stay hidden until flag(\"APPROVALS\") is on", () => {
  it("FF_APPROVALS unset (default off): confirm tool is not offered", async () => {
    const reg = new McpRegistry(cfg());
    const names = (await reg.tools()).map((t) => t.name);
    expect(names).toEqual(["mcp__s__read_thing", "mcp__s__draft_thing"]);
    await reg.close();
  });

  it("FF_APPROVALS=1: confirm tool is now offered alongside read/draft", async () => {
    process.env.FF_APPROVALS = "1";
    const reg = new McpRegistry(cfg());
    const names = (await reg.tools()).map((t) => t.name).sort();
    expect(names).toEqual(["mcp__s__confirm_thing", "mcp__s__draft_thing", "mcp__s__read_thing"]);
    await reg.close();
  });

  it("even with the flag on, calling a confirm tool is still refused (P1-11 wires real approval)", async () => {
    process.env.FF_APPROVALS = "1";
    const reg = new McpRegistry(cfg());
    const r = await reg.call("mcp__s__confirm_thing", {});
    expect(r.ok).toBe(false);
    await reg.close();
  });
});
