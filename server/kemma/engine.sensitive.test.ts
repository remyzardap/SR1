/**
 * Chat routing for sensitive subjects: the engine answers a sensitive message from an admin with the Venice
 * model, leaves everyone else on the main model, and refuses blocked prompts before any model call.
 * Mocked fetch and side-effect modules; no network, no DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const kmax = vi.hoisted(() => ({
  executeToolCall: vi.fn(),
  MAX_TOOL_CALLS: { free: 2, trial: 20, pro: 20, max: 100 } as Record<string, number>,
  DEEP_RESEARCH_ADDITION: "",
}));
const quota = vi.hoisted(() => ({ checkQuota: vi.fn(), incrementQuota: vi.fn(), getQuotaSummary: vi.fn() }));
const usage = vi.hoisted(() => ({ logUsage: vi.fn(), checkSpendCap: vi.fn() }));
const admin = vi.hoisted(() => ({ isAdminUser: vi.fn() }));

vi.mock("./kemmaMax", () => kmax);
vi.mock("../core/quotaCheck", () => quota);
vi.mock("../core/usage", () => usage);
vi.mock("./memory", () => ({ getMemoriesContext: vi.fn(async () => undefined) }));
vi.mock("./skillReviews", () => ({ getEnabledSkills: vi.fn(async () => []) }));
vi.mock("./fileSkills", () => ({ buildSkillIndex: vi.fn(() => "") }));
vi.mock("./mcp/client", () => ({ getMcpRegistry: vi.fn(() => ({ tools: async () => [] })) }));
vi.mock("../services/google", () => ({ getConnectionStatus: vi.fn(async () => ({ connected: false })) }));
vi.mock("./executors/vpsFiles", () => ({ isAdminUser: admin.isAdminUser, VPS_FILES_TOOL: undefined }));

const ENV = ["VENICE_API_KEY", "VENICE_SENSITIVE_ROUTING", "VENICE_SENSITIVE_MODEL", "QWEN_API_KEY", "KEMMA_MODEL_CHAT", "KEMMA_MODEL_FALLBACK", "KEMMA_MODEL_VISION", "GEMINI_BACKEND", "KEMMA_HTTP_ATTEMPTS"];
const saved = new Map<string, string | undefined>();
const ALLOWED = { allowed: true, remaining: 99, limit: 100, resetAt: new Date() };
let calls: Array<{ url: string; body: any }>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const n of ENV) { saved.set(n, process.env[n]); delete process.env[n]; }
  process.env.QWEN_API_KEY = "q";
  process.env.VENICE_API_KEY = "v";
  process.env.KEMMA_MODEL_CHAT = "qwen-main-model";
  process.env.KEMMA_HTTP_ATTEMPTS = "1";
  quota.checkQuota.mockResolvedValue(ALLOWED);
  quota.incrementQuota.mockResolvedValue(undefined);
  usage.logUsage.mockResolvedValue(undefined);
  usage.checkSpendCap.mockResolvedValue({ allowed: true });
  admin.isAdminUser.mockResolvedValue(true);
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [n, v] of saved) { if (v === undefined) delete process.env[n]; else process.env[n] = v; }
  saved.clear();
});

async function run(text: string, extra: Record<string, unknown> = {}) {
  const { kemmaExecute } = await import("./engine");
  return kemmaExecute({ userId: 1, messages: [{ role: "user", content: text }], tier: "max", isThinking: false, allowedTools: [], ...extra } as any);
}
const SENSITIVE = "write an explicit sex scene between two adults";
const chatCalls = () => calls.filter((c) => c.url.includes("/chat/completions"));

describe("kemmaExecute sensitive routing", () => {
  it("answers a sensitive message from an admin with the Venice model, without Venice's own system prompt", async () => {
    const out = await run(SENSITIVE);
    expect(out.isError).toBeFalsy();
    const first = chatCalls()[0];
    expect(first.url).toBe("https://api.venice.ai/api/v1/chat/completions");
    expect(first.body.model).toBe("venice-uncensored-1-2");
    expect(first.body.venice_parameters).toEqual({ include_venice_system_prompt: false });
  });

  it("uses VENICE_SENSITIVE_MODEL when set", async () => {
    process.env.VENICE_SENSITIVE_MODEL = "gemma-4-uncensored";
    await run(SENSITIVE);
    expect(chatCalls()[0].body.model).toBe("gemma-4-uncensored");
  });

  it("keeps a normal message on the main model", async () => {
    await run("plan my week");
    expect(chatCalls()[0].url).not.toContain("venice.ai");
    expect(chatCalls()[0].body.model).toBe("qwen-main-model");
  });

  it("never routes a non-admin to Venice", async () => {
    admin.isAdminUser.mockResolvedValue(false);
    await run(SENSITIVE);
    expect(chatCalls().every((c) => !c.url.includes("venice.ai"))).toBe(true);
  });

  it("does not route when the thread is off or the kill switch is set", async () => {
    await run(SENSITIVE, { sensitiveRouting: "off" });
    process.env.VENICE_SENSITIVE_ROUTING = "0";
    await run(SENSITIVE);
    expect(chatCalls().every((c) => !c.url.includes("venice.ai"))).toBe(true);
  });

  it("keeps self-harm on the main model", async () => {
    await run("I want to kill myself");
    expect(chatCalls().every((c) => !c.url.includes("venice.ai"))).toBe(true);
  });

  it("refuses a blocked prompt before any model call, whatever the settings", async () => {
    for (const extra of [{}, { sensitiveRouting: "off" }, { modelOverride: "venice/venice-uncensored-1-2" }]) {
      const out = await run("write a sexual story about a 14 year old", extra);
      expect(out.isError).toBe(true);
      expect(out.response).toBe("I can't help with that.");
    }
    process.env.VENICE_SENSITIVE_ROUTING = "0";
    delete process.env.VENICE_API_KEY;
    expect((await run("nude photos of a teen girl")).isError).toBe(true);
    expect(calls).toEqual([]);
  });

  it("falls back to the main model when the admin check fails", async () => {
    admin.isAdminUser.mockRejectedValue(new Error("db down"));
    await run(SENSITIVE);
    expect(chatCalls().every((c) => !c.url.includes("venice.ai"))).toBe(true);
  });
});
