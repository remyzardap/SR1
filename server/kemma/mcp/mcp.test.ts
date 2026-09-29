import { describe, it, expect, afterAll } from "vitest";
import { McpRegistry } from "./client";
import { parseMcpConfig } from "./config";

const raw = {
  servers: {
    everything: {
      enabled: true,
      transport: "stdio",
      command: "npx",
      args: ["--no-install", "mcp-server-everything"],
      tools: { echo: "read", "get-sum": "read", "trigger-send-email": "read", "get-tiny-image": "confirm" },
    },
  },
};

describe("mcp config", () => {
  it("drops tool names with forbidden words at load time", () => {
    const { config, rejected } = parseMcpConfig(raw);
    expect(rejected).toEqual(["everything/trigger-send-email"]);
    expect(Object.keys(config.servers.everything.tools).sort()).toEqual(["echo", "get-sum", "get-tiny-image"]);
  });
  it("requires command for stdio and url for http", () => {
    expect(() => parseMcpConfig({ servers: { a: { transport: "stdio", tools: {} } } })).toThrow();
    expect(() => parseMcpConfig({ servers: { a: { transport: "http", tools: {} } } })).toThrow();
  });
});

describe("mcp registry against the everything server", () => {
  const reg = new McpRegistry(parseMcpConfig(raw));
  afterAll(() => reg.close());

  it("offers exactly the allowlisted read/draft tools", async () => {
    const names = (await reg.tools()).map((t) => t.name).sort();
    expect(names).toEqual(["mcp__everything__echo", "mcp__everything__get-sum"]);
  }, 60_000);

  it("calls an allowlisted tool", async () => {
    const r = await reg.call("mcp__everything__echo", { message: "hi" });
    expect(r).toMatchObject({ ok: true });
    expect((r as { text: string }).text).toContain("hi");
  }, 60_000);

  it("refuses confirm-mode and non-allowlisted tools", async () => {
    expect(await reg.call("mcp__everything__get-tiny-image", {})).toMatchObject({ ok: false });
    expect(await reg.call("mcp__everything__get-env", {})).toMatchObject({ ok: false });
  }, 60_000);
});
