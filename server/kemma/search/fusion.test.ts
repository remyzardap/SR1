import { describe, it, expect } from "vitest";
import { canonicalizeUrl, dedupeByCanonicalUrl, reciprocalRankFusion } from "./fusion";
import type { SearchHit } from "./types";

const hit = (url: string, provider = "x"): SearchHit => ({ title: url, url, snippet: "", provider });

describe("canonicalizeUrl", () => {
  it("lowercases the host", () => {
    expect(canonicalizeUrl("https://Example.COM/page")).toBe("https://example.com/page");
  });

  it("strips utm_ params, fbclid and gclid", () => {
    expect(canonicalizeUrl("https://example.com/page?utm_source=x&utm_campaign=y&fbclid=abc&gclid=def&q=1")).toBe(
      "https://example.com/page?q=1",
    );
  });

  it("strips the trailing slash but keeps a bare root slash", () => {
    expect(canonicalizeUrl("https://example.com/page/")).toBe("https://example.com/page");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("strips the fragment", () => {
    expect(canonicalizeUrl("https://example.com/page#section-2")).toBe("https://example.com/page");
  });

  it("returns a lowercased, trimmed string for an unparseable URL instead of throwing", () => {
    expect(canonicalizeUrl("  Not A Url  ")).toBe("not a url");
  });

  it("treats differently-tracked URLs to the same page as equal", () => {
    const a = canonicalizeUrl("https://Example.com/page/?utm_source=newsletter");
    const b = canonicalizeUrl("https://example.com/page?fbclid=zzz#top");
    expect(a).toBe(b);
  });
});

describe("dedupeByCanonicalUrl", () => {
  it("keeps the first occurrence and drops later duplicates by canonical URL", () => {
    const hits = [hit("https://example.com/a"), hit("https://EXAMPLE.com/a/?utm_source=x"), hit("https://example.com/b")];
    const out = dedupeByCanonicalUrl(hits);
    expect(out.map((h) => h.url)).toEqual(["https://example.com/a", "https://example.com/b"]);
  });
});

describe("reciprocalRankFusion", () => {
  it("fuses two ranked lists with k=60 and sorts by descending score", () => {
    const listA = [hit("https://a.example/1", "a"), hit("https://a.example/2", "a"), hit("https://a.example/3", "a")];
    const listB = [hit("https://a.example/2", "b"), hit("https://a.example/4", "b")];
    const fused = reciprocalRankFusion([listA, listB], 60);

    // url 2 appears at rank 2 in A (1/62) and rank 1 in B (1/61): highest combined score.
    expect(fused[0].url).toBe("https://a.example/2");
    expect(fused[0].score).toBeCloseTo(1 / 62 + 1 / 61, 10);

    // url 1 (rank 1 in A only) beats url 4 (rank 2 in B only): both single-list, but rank 1 > rank 2.
    const urls = fused.map((h) => h.url);
    expect(urls.indexOf("https://a.example/1")).toBeLessThan(urls.indexOf("https://a.example/4"));
    expect(urls).toHaveLength(4);
  });

  it("merges hits that canonicalize to the same URL across lists into one entry", () => {
    const listA = [hit("https://example.com/x?utm_source=a")];
    const listB = [hit("https://example.com/x/")];
    const fused = reciprocalRankFusion([listA, listB]);
    expect(fused).toHaveLength(1);
  });

  it("returns an empty array for empty input", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});
