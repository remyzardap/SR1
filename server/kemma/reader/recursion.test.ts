import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => dns);

const kv = vi.hoisted(() => ({ kvGet: vi.fn(), kvSet: vi.fn() }));
vi.mock("../../core/kvCache", () => kv);

const flagsMock = vi.hoisted(() => ({ flag: vi.fn() }));
vi.mock("../../core/flags", () => flagsMock);

const browserUseRun = vi.hoisted(() => vi.fn());
vi.mock("browser-use-sdk", () => ({
  BrowserUse: vi.fn().mockImplementation(() => ({ run: browserUseRun })),
}));

import { browse } from "../kemmaMax";

beforeEach(() => {
  vi.clearAllMocks();
  dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  kv.kvGet.mockResolvedValue(null);
  kv.kvSet.mockResolvedValue(undefined);
  flagsMock.flag.mockReturnValue(true);
  process.env.BROWSER_USE_API_KEY = "bu-test-key";
  delete process.env.READER_FALLBACK;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tier 3 escalation recursion guard integration", () => {
  it("does not recurse infinitely when browse() delegates to readPage() and escalates to tier 3", async () => {
    // Tier 1 fetch returns 503, triggering escalation to Tier 3 (Tier 2 not configured)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Service Unavailable", { status: 503 })));
    browserUseRun.mockResolvedValue({
      output: JSON.stringify({
        title: "Escalated Page",
        content: "Content produced by tier 3 browser-use agent",
      }),
    });

    const result = await browse("https://example.com/app");
    expect(result.tier).toBe(3);
    expect(result.title).toBe("Escalated Page");
    expect(result.content).toContain("Content produced by tier 3");
    expect(browserUseRun).toHaveBeenCalledTimes(1);
  });

  it("does not recurse infinitely on interactive: true browse calls", async () => {
    browserUseRun.mockResolvedValue({
      output: JSON.stringify({
        title: "Interactive Page",
        content: "Content from interactive browse",
      }),
    });

    const result = await browse("https://example.com/interactive-app", { interactive: true });
    expect(result.tier).toBe(3);
    expect(result.title).toBe("Interactive Page");
    expect(result.content).toContain("Content from interactive browse");
    expect(browserUseRun).toHaveBeenCalledTimes(1);
  });
});
