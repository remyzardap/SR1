import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerWebSearch } from "./webSearch";
import { runTool, __resetRegistryForTests } from "../registry";
import type { ToolContext } from "../types";
import { SearchUnavailableError } from "../../search";

const webSearchMock = vi.hoisted(() => vi.fn());
vi.mock("../../executors/webSearch", () => ({
  webSearch: webSearchMock,
}));

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 42,
    sessionId: "sess-123",
    runId: "run-456",
    tier: "trial",
    signal: new AbortController().signal,
    emit: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  __resetRegistryForTests();
  registerWebSearch();
  webSearchMock.mockReset();
});

describe("builtin web_search tool", () => {
  it("threads query, P1-08 arguments, and ctx metadata (userId, sessionId) to webSearch executor", async () => {
    webSearchMock.mockResolvedValueOnce([{ title: "Example", url: "https://example.com", snippet: "sample" }]);

    const outcome = await runTool(
      "web_search",
      {
        query: "typescript 5",
        recency: "month",
        include_domains: ["typescriptlang.org"],
        exclude_domains: ["spam.com"],
        vertical: "web",
        depth: "deep",
      },
      makeCtx({ userId: 99, sessionId: "sess-abc" }),
    );

    expect(outcome).toEqual({
      ok: true,
      data: {
        success: true,
        data: [{ title: "Example", url: "https://example.com", snippet: "sample" }],
      },
    });

    expect(webSearchMock).toHaveBeenCalledWith("typescript 5", {
      recency: "month",
      includeDomains: ["typescriptlang.org"],
      excludeDomains: ["spam.com"],
      vertical: "web",
      depth: "deep",
      userId: 99,
      sessionId: "sess-abc",
    });
  });

  it("handles SearchUnavailableError by returning a failed tool outcome without crashing", async () => {
    webSearchMock.mockRejectedValueOnce(new SearchUnavailableError("Search is currently unavailable."));

    const outcome = await runTool(
      "web_search",
      { query: "broken search" },
      makeCtx(),
    );

    expect(outcome).toEqual({
      ok: false,
      code: "FAILED",
      error: "Search is currently unavailable.",
    });
  });
});
