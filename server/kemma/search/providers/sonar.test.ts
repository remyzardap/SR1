import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV = ["SONAR_API_KEY", "PERPLEXITY_API_KEY", "KEMMA_SEARCH_RPM"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  vi.resetModules();
  for (const n of ENV) { saved.set(n, process.env[n]); delete process.env[n]; }
  process.env.KEMMA_SEARCH_RPM = "100000";
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [n, v] of saved) if (v === undefined) delete process.env[n]; else process.env[n] = v;
});

describe("sonarProvider", () => {
  it("is unconfigured without a key, configured with one", async () => {
    const { sonarProvider } = await import("./sonar");
    expect(sonarProvider.configured()).toBe(false);
    process.env.SONAR_API_KEY = "s";
    expect(sonarProvider.configured()).toBe(true);
  });

  it("reuses the existing Sonar upstream call and tags hits with provider \"sonar\"", async () => {
    process.env.SONAR_API_KEY = "s";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "x",
          model: "sonar-pro",
          object: "chat.completion",
          created: 1,
          choices: [{ index: 0, message: { role: "assistant", content: "answer" }, finish_reason: "stop" }],
          search_results: [{ title: "A", url: "https://a.example", snippet: "s" }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { sonarProvider } = await import("./sonar");
    const hits = await sonarProvider.search("q", { recency: "day" }); // recency is ignored, same as the legacy path
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hits[0].provider).toBe("sonar");
    expect(hits[0].url).toBe("https://a.example");
  });
});
