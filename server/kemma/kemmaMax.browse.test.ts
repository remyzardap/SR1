/**
 * browse() in kemmaMax.ts: flag("READER_V2") off must behave exactly as it did before P1-09
 * (unchanged browser-use path); on, it delegates to the tiered reader (server/kemma/reader).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const flagsMock = vi.hoisted(() => ({ flag: vi.fn() }));
vi.mock("../core/flags", () => flagsMock);

const readerMock = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock("./reader", () => readerMock);

const browserUseRun = vi.hoisted(() => vi.fn());
vi.mock("browser-use-sdk", () => ({
  BrowserUse: vi.fn().mockImplementation(() => ({ run: browserUseRun })),
}));

import { browse, browseWithAgent } from "./kemmaMax";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BROWSER_USE_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browse() with READER_V2 off", () => {
  beforeEach(() => flagsMock.flag.mockReturnValue(false));

  it("never calls the tiered reader and delegates to browseWithAgent", async () => {
    process.env.BROWSER_USE_API_KEY = "bu-key";
    browserUseRun.mockResolvedValue({ output: JSON.stringify({ title: "Legacy", content: "legacy content" }) });
    const result = await browse("https://example.com/page");
    expect(readerMock.readPage).not.toHaveBeenCalled();
    expect(result).toEqual({ title: "Legacy", content: "legacy content" });
  });

  it("fails the same way as before when BROWSER_USE_API_KEY is unset", async () => {
    await expect(browse("https://example.com/page")).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(readerMock.readPage).not.toHaveBeenCalled();
  });
});

describe("browseWithAgent()", () => {
  it("executes the browser agent directly regardless of flag state", async () => {
    flagsMock.flag.mockReturnValue(true); // flag is ON, but browseWithAgent must NOT consult reader
    process.env.BROWSER_USE_API_KEY = "bu-key";
    browserUseRun.mockResolvedValue({ output: JSON.stringify({ title: "Direct Agent", content: "agent body" }) });

    const result = await browseWithAgent("https://example.com/direct", { interactive: true });
    expect(readerMock.readPage).not.toHaveBeenCalled();
    expect(result).toEqual({ title: "Direct Agent", content: "agent body" });
    expect(browserUseRun).toHaveBeenCalled();
  });
});

describe("browse() with READER_V2 on", () => {
  beforeEach(() => flagsMock.flag.mockReturnValue(true));

  it("delegates to readPage and maps its result onto BrowseResult", async () => {
    readerMock.readPage.mockResolvedValue({
      url: "https://example.com/page",
      finalUrl: "https://example.com/page",
      title: "Reader Title",
      markdown: "reader markdown",
      tier: 1,
      truncated: false,
    });

    const result = await browse("https://example.com/page", { query: "topic", maxLength: 5000 });

    expect(readerMock.readPage).toHaveBeenCalledWith("https://example.com/page", {
      query: "topic",
      maxChars: 5000,
      interactive: undefined,
      userId: undefined,
      signal: undefined,
    });
    expect(result).toMatchObject({ title: "Reader Title", content: "reader markdown", tier: 1, truncated: false });
    expect(browserUseRun).not.toHaveBeenCalled();
  });

  it("forwards the caller's AbortSignal so the tool loop can cancel a reader call", async () => {
    const controller = new AbortController();
    readerMock.readPage.mockResolvedValue({ url: "u", finalUrl: "u", title: "T", markdown: "m", tier: 1, truncated: false });

    await browse("https://example.com/page", { signal: controller.signal });

    expect(readerMock.readPage).toHaveBeenCalledWith("https://example.com/page", {
      query: undefined,
      maxChars: undefined,
      interactive: undefined,
      userId: undefined,
      signal: controller.signal,
    });
  });

  it("never calls the browser-use agent directly from this path when tier 1/2 succeed", async () => {
    readerMock.readPage.mockResolvedValue({ url: "u", finalUrl: "u", title: "T", markdown: "m", tier: 2, truncated: true });
    await browse("https://example.com/page");
    expect(browserUseRun).not.toHaveBeenCalled();
  });
});
