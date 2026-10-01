import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: Array<{ url: string; body: any }> = [];
function stub(fail: string[] = []) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const who = url.includes("perplexity") ? "sonar" : url.includes("googleapis") ? "gemini" : "qwen";
    if (fail.includes(who)) return new Response("boom", { status: 500 });
    return new Response(JSON.stringify({
      choices: [{ message: { content: `draft-from-${who}` } }],
      ...(who === "sonar" ? { citations: ["https://a.example"] } : {}),
    }), { status: 200 });
  }));
}
beforeEach(() => {
  vi.resetModules();
  process.env.GEMINI_API_KEY = "g"; process.env.QWEN_API_KEY = "q"; process.env.SONAR_API_KEY = "s";
  delete process.env.VERTEX_PROJECT; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});
const msgs = [{ role: "system", content: "SYS" }, { role: "user", content: "hello" }];

describe("s1Blend", () => {
  it("blends gemini+qwen drafts into one synthesis request", async () => {
    stub();
    const { s1Blend } = await import("./routers/s1Router");
    const plan = await s1Blend("explain recursion", msgs);
    expect(calls).toHaveLength(2);
    expect(plan.contributors.sort()).toEqual(["gemini", "qwen"]);
    expect(plan.config.baseUrl).toContain("googleapis");
    expect(plan.messages[0].content).toContain("draft-from-gemini");
    expect(plan.messages[0].content).toContain("draft-from-qwen");
    expect(plan.messages[0].content.startsWith("SYS")).toBe(true);
    expect(msgs[0].content).toBe("SYS"); // input not mutated
  });
  it("adds sonar (with citations) for web questions", async () => {
    stub();
    const { s1Blend } = await import("./routers/s1Router");
    const plan = await s1Blend("latest news today", msgs);
    expect(plan.contributors.sort()).toEqual(["gemini", "qwen", "sonar"]);
    expect(plan.messages[0].content).toContain("https://a.example");
  });
  it("falls back to a single answer when only one draft works", async () => {
    stub(["qwen"]);
    const { s1Blend } = await import("./routers/s1Router");
    const plan = await s1Blend("hi", msgs);
    expect(plan.contributors).toEqual(["gemini"]);
    expect(plan.messages).toEqual(msgs);
  });
  it("skips drafts entirely with one configured provider", async () => {
    stub(); delete process.env.QWEN_API_KEY; delete process.env.SONAR_API_KEY;
    const { s1Blend } = await import("./routers/s1Router");
    const plan = await s1Blend("hi", msgs);
    expect(calls).toHaveLength(0);
    expect(plan.contributors).toEqual(["gemini"]);
  });
  it("throws when nothing is configured", async () => {
    stub(); delete process.env.GEMINI_API_KEY; delete process.env.QWEN_API_KEY; delete process.env.SONAR_API_KEY;
    const { s1Blend } = await import("./routers/s1Router");
    await expect(s1Blend("hi", msgs)).rejects.toThrow(/No LLM provider/);
  });
});
