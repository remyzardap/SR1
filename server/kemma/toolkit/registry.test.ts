/**
 * Registry mechanics: validation, timeout, abort, "never throws", destructive refusal, and
 * toolsFor's filtering rules. Builtin tool wiring and the engine's use of this module are covered
 * elsewhere (toolParity.test.ts, engine.audit.test.ts); this file exercises the registry itself
 * against small, self-contained test tools so it never depends on real executors, the network or
 * a database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import * as mcpClient from "../mcp/client";
import { __resetRegistryForTests, registerTool, runTool, toOpenAiTools, toolsFor } from "./registry";
import type { ToolContext, ToolSpec } from "./types";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 1,
    runId: "r1",
    tier: "trial",
    signal: new AbortController().signal,
    emit: () => {},
    ...overrides,
  };
}

const echoArgs = z.object({ text: z.string().describe("text to echo") });

function echoTool(overrides: Partial<ToolSpec<typeof echoArgs, unknown>> = {}): ToolSpec<typeof echoArgs, unknown> {
  return {
    name: "echo",
    description: "echoes text back",
    args: echoArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 1000,
    maxModelChars: 1000,
    execute: async (args) => ({ echoed: args.text }),
    ...overrides,
  };
}

beforeEach(() => {
  __resetRegistryForTests();
});

describe("registerTool", () => {
  it("rejects a bad name", () => {
    expect(() => registerTool(echoTool({ name: "has a space" }))).toThrow(/invalid tool name/);
  });

  it("throws at registration time for risk: destructive (G1)", () => {
    expect(() => registerTool(echoTool({ name: "delete_everything", risk: "destructive" }))).toThrow(/destructive/);
    // and it never made it into the registry
    expect(async () => toolsFor(ctx())).not.toThrow();
  });

  it("a destructive tool is never offered even if registration is attempted and swallowed elsewhere", async () => {
    try { registerTool(echoTool({ name: "wipe", risk: "destructive" })); } catch { /* expected */ }
    const specs = await toolsFor(ctx());
    expect(specs.map((s) => s.name)).not.toContain("wipe");
  });
});

describe("runTool: argument validation", () => {
  beforeEach(() => registerTool(echoTool()));

  it("returns INVALID_ARGS with a model-actionable summary on a missing field", async () => {
    const outcome = await runTool("echo", {}, ctx());
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
    if (!outcome.ok) expect(outcome.error).toContain("text");
  });

  it("returns INVALID_ARGS on a wrong type", async () => {
    const outcome = await runTool("echo", { text: 42 }, ctx());
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("runs with valid args and wraps the result as ok:true", async () => {
    const outcome = await runTool("echo", { text: "hi" }, ctx());
    expect(outcome).toEqual({ ok: true, data: { echoed: "hi" } });
  });
});

describe("runTool: unknown tool", () => {
  it("never throws for a name no spec was registered under", async () => {
    const outcome = await runTool("not_a_real_tool", {}, ctx());
    expect(outcome).toEqual({ ok: false, error: "Unknown tool: not_a_real_tool", code: "NOT_ALLOWED" });
  });
});

describe("runTool: timeout", () => {
  it("fires even if the executor hangs forever", async () => {
    registerTool(echoTool({
      name: "hangs",
      timeoutMs: 30,
      execute: () => new Promise(() => {}), // never resolves
    }));
    const outcome = await runTool("hangs", { text: "x" }, ctx());
    expect(outcome).toMatchObject({ ok: false, code: "TIMEOUT" });
  }, 2000);
});

describe("runTool: abort", () => {
  it("returns ABORTED immediately when ctx.signal is already aborted", async () => {
    registerTool(echoTool());
    const controller = new AbortController();
    controller.abort();
    const outcome = await runTool("echo", { text: "x" }, ctx({ signal: controller.signal }));
    expect(outcome).toEqual({ ok: false, error: "Run was cancelled.", code: "ABORTED" });
  });

  it("returns ABORTED when ctx.signal fires mid-execution, before the timeout", async () => {
    const controller = new AbortController();
    registerTool(echoTool({
      name: "slow",
      timeoutMs: 5000,
      execute: () => new Promise((resolve) => setTimeout(() => resolve({ echoed: "late" }), 5000)),
    }));
    const promise = runTool("slow", { text: "x" }, ctx({ signal: controller.signal }));
    setTimeout(() => controller.abort(), 20);
    const outcome = await promise;
    expect(outcome).toMatchObject({ ok: false, code: "ABORTED" });
  }, 2000);
});

describe("runTool: execute() throwing or returning garbage never escapes runTool", () => {
  it("a thrown Error becomes FAILED with its message", async () => {
    registerTool(echoTool({ name: "throws", execute: async () => { throw new Error("boom"); } }));
    const outcome = await runTool("throws", { text: "x" }, ctx());
    expect(outcome).toEqual({ ok: false, error: "boom", code: "FAILED" });
  });

  it("a thrown non-Error value becomes FAILED without throwing", async () => {
    registerTool(echoTool({ name: "throws_string", execute: async () => { throw "raw string failure"; } }));
    const outcome = await runTool("throws_string", { text: "x" }, ctx());
    expect(outcome).toEqual({ ok: false, error: "raw string failure", code: "FAILED" });
  });

  it("a rejected promise with no message still resolves to a FAILED outcome, not a throw", async () => {
    registerTool(echoTool({ name: "rejects_odd", execute: async () => { throw { weird: true }; } }));
    await expect(runTool("rejects_odd", { text: "x" }, ctx())).resolves.toMatchObject({ ok: false, code: "FAILED" });
  });
});

describe("toolsFor: availability and allow filtering", () => {
  it("excludes a tool whose available() returns false", async () => {
    registerTool(echoTool({ name: "gated", available: () => false }));
    registerTool(echoTool({ name: "open" }));
    const names = (await toolsFor(ctx())).map((s) => s.name);
    expect(names).toContain("open");
    expect(names).not.toContain("gated");
  });

  it("treats a throwing available() as unavailable rather than failing the whole listing", async () => {
    registerTool(echoTool({ name: "throws_available", available: () => { throw new Error("db down"); } }));
    registerTool(echoTool({ name: "open" }));
    const names = (await toolsFor(ctx())).map((s) => s.name);
    expect(names).toEqual(["open"]);
  });

  it("an explicit allow list narrows to just those names", async () => {
    registerTool(echoTool({ name: "a" }));
    registerTool(echoTool({ name: "b" }));
    const names = (await toolsFor(ctx(), ["a"])).map((s) => s.name);
    expect(names).toEqual(["a"]);
  });

  it("an empty allow list offers nothing", async () => {
    registerTool(echoTool({ name: "a" }));
    const names = (await toolsFor(ctx(), [])).map((s) => s.name);
    expect(names).toEqual([]);
  });
});

describe("toOpenAiTools", () => {
  it("produces the OpenAI function-calling wire shape from a zod schema", () => {
    const [def] = toOpenAiTools([echoTool()]);
    expect(def).toEqual({
      name: "echo",
      description: "echoes text back",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "text to echo" } },
        required: ["text"],
      },
    });
  });
});

describe("runTool: MCP approval and mode handling", () => {
  const mockCall = vi.fn();
  const mockModeOf = vi.fn();

  beforeEach(() => {
    vi.spyOn(mcpClient, "getMcpRegistry").mockReturnValue({
      modeOf: mockModeOf,
      call: mockCall,
    } as unknown as mcpClient.McpRegistry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("confirm tool with no gate returns NOT_ALLOWED", async () => {
    mockModeOf.mockResolvedValue("confirm");
    const outcome = await runTool("mcp__test__confirm_tool", { arg: 1 }, ctx({ approvals: undefined }));
    expect(outcome).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
      error: "This action needs your approval, which isn't available yet.",
    });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("confirm tool with gate saying no returns REJECTED", async () => {
    mockModeOf.mockResolvedValue("confirm");
    const request = vi.fn().mockResolvedValue(false);
    const outcome = await runTool("mcp__test__confirm_tool", { arg: 1 }, ctx({ approvals: { request } }));
    expect(outcome).toEqual({
      ok: false,
      code: "REJECTED",
      error: "Action rejected by user approval.",
    });
    expect(request).toHaveBeenCalledWith("mcp__test__confirm_tool", { arg: 1 });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("confirm tool with gate saying yes runs with confirmed: true", async () => {
    mockModeOf.mockResolvedValue("confirm");
    const request = vi.fn().mockResolvedValue(true);
    mockCall.mockResolvedValue({ ok: true, text: "action performed" });
    const outcome = await runTool("mcp__test__confirm_tool", { arg: 1 }, ctx({ approvals: { request } }));
    expect(outcome).toEqual({
      ok: true,
      data: { success: true, data: { output: "action performed" } },
    });
    expect(request).toHaveBeenCalledWith("mcp__test__confirm_tool", { arg: 1 });
    expect(mockCall).toHaveBeenCalledWith("mcp__test__confirm_tool", { arg: 1 }, { confirmed: true });
  });

  it("read tool runs without requiring approval", async () => {
    mockModeOf.mockResolvedValue("read");
    const request = vi.fn();
    mockCall.mockResolvedValue({ ok: true, text: "read result" });
    const outcome = await runTool("mcp__test__read_tool", {}, ctx({ approvals: { request } }));
    expect(outcome).toEqual({
      ok: true,
      data: { success: true, data: { output: "read result" } },
    });
    expect(request).not.toHaveBeenCalled();
    expect(mockCall).toHaveBeenCalledWith("mcp__test__read_tool", {}, { confirmed: true });
  });

  it("draft tool runs without requiring approval", async () => {
    mockModeOf.mockResolvedValue("draft");
    const request = vi.fn();
    mockCall.mockResolvedValue({ ok: true, text: "draft staged" });
    const outcome = await runTool("mcp__test__draft_tool", {}, ctx({ approvals: { request } }));
    expect(outcome).toEqual({
      ok: true,
      data: { success: true, data: { output: "draft staged" } },
    });
    expect(request).not.toHaveBeenCalled();
    expect(mockCall).toHaveBeenCalledWith("mcp__test__draft_tool", {}, { confirmed: true });
  });

  it("unknown MCP tool returns NOT_ALLOWED", async () => {
    mockModeOf.mockResolvedValue(undefined);
    const outcome = await runTool("mcp__test__unknown", {}, ctx());
    expect(outcome).toEqual({
      ok: false,
      code: "NOT_ALLOWED",
      error: "Unknown tool: mcp__test__unknown",
    });
  });
});

