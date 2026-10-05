import { describe, it, expect } from "vitest";
import { splitIntoChunks, selectRelevantChunks, selectForBudget } from "./select";

function para(topic: string, sentences = 6): string {
  return Array.from({ length: sentences }, (_, i) => `This paragraph about ${topic} has sentence number ${i + 1} for padding purposes.`).join(" ");
}

describe("splitIntoChunks", () => {
  it("returns nothing for blank input", () => {
    expect(splitIntoChunks("")).toEqual([]);
    expect(splitIntoChunks("   \n\n  ")).toEqual([]);
  });

  it("keeps a short document as one chunk", () => {
    expect(splitIntoChunks("Hello world.")).toEqual(["Hello world."]);
  });

  it("splits a long document into multiple roughly-1500-char chunks", () => {
    const markdown = Array.from({ length: 8 }, (_, i) => `## Section ${i}\n\n${para(`topic${i}`, 10)}`).join("\n\n");
    const chunks = splitIntoChunks(markdown, 1500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThan(1500 * 2); // generous slack for one oversized block
  });
});

describe("selectRelevantChunks", () => {
  it("keeps the intro chunk and the query-relevant chunk, drops irrelevant middles", () => {
    const intro = `# Introduction\n\n${para("overview", 20)}`;
    const irrelevant1 = `## History\n\n${para("unrelated history filler", 20)}`;
    const irrelevant2 = `## Trivia\n\n${para("random trivia filler", 20)}`;
    const relevant = `## Pricing\n\nThe quarterly pricing for the enterprise plan increased by twelve percent this year, driven by rising server costs. ${para(
      "pricing details",
      20
    )}`;
    const markdown = [intro, irrelevant1, irrelevant2, relevant].join("\n\n");

    const chunks = splitIntoChunks(markdown);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    const pricingIndex = chunks.findIndex((c) => c.includes("Pricing"));
    expect(pricingIndex).toBeGreaterThan(0);

    // A budget that can only fit the intro plus one more chunk.
    const budget = chunks[0].length + chunks[pricingIndex].length + 50;
    const { text, truncated } = selectRelevantChunks(markdown, "quarterly pricing enterprise plan", budget);

    expect(truncated).toBe(true);
    expect(text).toContain("Introduction");
    expect(text).toContain("Pricing");
    expect(text).not.toContain("History");
    expect(text).not.toContain("Trivia");
    expect(text).toContain("[…]");
  });

  it("keeps the first chunk even when it scores zero against the query", () => {
    const intro = `# Intro\n\n${para("generic filler with no overlap", 6)}`;
    const relevant = `## Zebra\n\nZebra stripes zebra zebra zebra habitat zebra. ${para("zebra facts", 6)}`;
    const markdown = [intro, relevant].join("\n\n");
    const { text } = selectRelevantChunks(markdown, "zebra", intro.length + 20);
    expect(text).toContain("Intro");
  });
});

describe("selectForBudget", () => {
  it("returns the whole markdown untruncated when it fits", () => {
    const { text, truncated } = selectForBudget("short content", "whatever", 10_000);
    expect(text).toBe("short content");
    expect(truncated).toBe(false);
  });

  it("plain-truncates when there is no query", () => {
    const long = "x".repeat(5000);
    const { text, truncated } = selectForBudget(long, undefined, 100);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(130);
  });

  it("uses query-focused selection when a query is given and the page is too long", () => {
    const markdown = [`# Intro\n\n${para("intro", 8)}`, `## Target\n\nunique-marker-term here. ${para("target", 8)}`, `## Filler\n\n${para("filler", 8)}`].join(
      "\n\n"
    );
    const { text } = selectForBudget(markdown, "unique-marker-term", 900);
    expect(text).toContain("unique-marker-term");
  });
});
