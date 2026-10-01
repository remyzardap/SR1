import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const s1 = vi.hoisted(() => ({
  blend: vi.fn(async () => ({
    config: { baseUrl: "https://llm.test/v1", model: "m", apiKey: "k" },
    messages: [{ role: "user", content: "q" }],
  })),
  buildPrompt: vi.fn(() => "sys"),
  resolveBearer: vi.fn(async () => "bearer"),
}));

vi.mock("./s1Router", () => ({
  s1Blend: s1.blend,
  buildS1SystemPrompt: s1.buildPrompt,
  resolveBearer: s1.resolveBearer,
}));

import { openclawRouter } from "./openclawRouter";

type FetchCall = { url: string; init: any };

function stubFetch(response: Response) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init: any) => {
      calls.push({ url: String(url), init });
      return response;
    })
  );
  return calls;
}

const okJson = (obj: unknown) =>
  new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });

function makeCaller(user: Record<string, unknown> | null) {
  const ctx = {
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as any;
  return openclawRouter.createCaller(ctx);
}

beforeEach(() => {
  vi.resetModules();
  s1.blend.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("openclawRouter.chat (audit)", () => {
  it("is protected: anonymous callers get UNAUTHORIZED", async () => {
    const caller = makeCaller(null);
    await expect(caller.chat({ message: "hi" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("answers a session holder through S1 and returns the S1 text", async () => {
    const caller = makeCaller({ id: 1, role: "user", name: "Alice" });
    const calls = stubFetch(okJson({ choices: [{ message: { content: "weather is fine" } }] }));
    const result = await caller.chat({ message: "What's the weather?" });
    expect(result).toMatchObject({ ok: true, response: "weather is fine", agent: "s1" });
    expect(calls[0].url).toBe("https://llm.test/v1/chat/completions");
    expect(calls[0].init.headers.Authorization).toBe("Bearer bearer");
    // The caller's session user pays for it: the request is billed through the
    // authenticated ctx; the free-form userId input is NOT used anywhere.
    expect(JSON.stringify(calls[0].init.body)).not.toContain("openclaw_agent");
  });

  it("ignores the advertised userId and sessionId inputs entirely (dead parameters)", async () => {
    const caller = makeCaller({ id: 1, role: "user", name: "Alice" });
    stubFetch(okJson({ choices: [{ message: { content: "a" } }] }));
    await caller.chat({ userId: "spoofed-id", sessionId: "some-session", message: "hi" });
    // s1Blend only ever receives the message + a static prompt: no session
    // persistence, no identity resolution from the input userId.
    const blendMessages = s1.blend.mock.calls[0][1] as Array<{ role: string; content: string }>;
    expect(blendMessages.map((m) => m.content)).toEqual(["sys", "hi"]);
  });

  it("swallows LLM failures into ok:false instead of throwing", async () => {
    const caller = makeCaller({ id: 1, role: "user", name: "Alice" });
    stubFetch(new Response("rate limited", { status: 429 }));
    const result = await caller.chat({ message: "hi" });
    expect(result.ok).toBe(false);
    expect(result.response).toContain("LLM error: 429");
  });

  it("rejects an empty message via input validation", async () => {
    const caller = makeCaller({ id: 1, role: "user", name: "Alice" });
    stubFetch(okJson({}));
    await expect(caller.chat({ message: "" })).rejects.toBeTruthy();
  });
});

describe("openclaw surface (audit)", () => {
  it("mcp.config.json does not reference openclaw at all (read-only check)", () => {
    const path = resolve(__dirname, "../../mcp.config.json");
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf-8");
    expect(raw.toLowerCase()).not.toContain("openclaw");
  });

  it("the documented VPS call shape cannot authenticate: chat is a protectedProcedure", async () => {
    // openclawRouter's docstring advertises a plain POST /api/trpc/openclaw.chat
    // with {"json":{"userId":"openclaw_agent",...}} - but /api/trpc wraps the
    // whole appRouter in createContext, and protectedProcedure requires a
    // session cookie. An external OpenClaw agent without a login is locked out.
    const caller = makeCaller(null);
    await expect(caller.chat({ userId: "openclaw_agent", message: "hi" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
