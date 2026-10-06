import { describe, it, expect } from "vitest";
import {
  type Source,
  citedSubset,
  dedupeSources,
  appendCitations,
  extractSources,
  annotateSearchResult,
  keepCitedSources,
} from "./sources";

describe("citedSubset", () => {
  const sampleSources: Source[] = [
    { id: 1, title: "Alpha", url: "https://alpha.example", snippet: "About alpha" },
    { id: 2, title: "Beta", url: "https://beta.example", snippet: "About beta" },
    { id: 3, title: "Gamma", url: "https://gamma.example", snippet: "About gamma" },
    { id: 4, title: "Delta", url: "https://delta.example", snippet: "About delta" },
  ];

  it("keeps only cited sources and preserves their stable IDs without renumbering", () => {
    // Answer cites source 3 and source 1 (out of order)
    const text = "According to [3], gamma happened. Alpha is confirmed [1].";
    const res = citedSubset(text, sampleSources);

    // Kept sources must retain their original IDs: 1 and 3 (never renumbered to 1 and 2)
    expect(res.sources).toHaveLength(2);
    expect(res.sources.map((s) => s.id)).toEqual([1, 3]);
    expect(res.sources[0].title).toBe("Alpha");
    expect(res.sources[1].title).toBe("Gamma");
    expect(res.unknownIds).toEqual([]);
    // In streaming mode (dropUnknown default false), text is untouched
    expect(res.text).toBe(text);
  });

  it("handles multi-citation brackets like [1, 3] and [1; 4]", () => {
    const text = "Both agree [1, 3] and also [4; 2].";
    const res = citedSubset(text, sampleSources);
    expect(res.sources.map((s) => s.id)).toEqual([1, 2, 3, 4]);
    expect(res.unknownIds).toEqual([]);
  });

  it("returns all sources unchanged when text contains no citation markers", () => {
    const text = "The sky is blue and grass is green.";
    const res = citedSubset(text, sampleSources);
    expect(res.sources).toEqual(sampleSources);
    expect(res.unknownIds).toEqual([]);
    expect(res.text).toBe(text);
  });

  it("returns empty sources when text contains only unknown citation markers", () => {
    const text = "Reference [99] only.";
    const res = citedSubset(text, sampleSources);
    expect(res.sources).toEqual([]);
    expect(res.unknownIds).toEqual([99]);
  });

  describe("unknown citation IDs", () => {
    it("in streaming mode (dropUnknown: false): leaves text untouched and reports unknownIds", () => {
      const text = "Known fact [2], unknown claim [99], another unknown [100, 2].";
      const res = citedSubset(text, sampleSources, { dropUnknown: false });

      // Unknown markers remain in text
      expect(res.text).toBe(text);
      // Only source 2 is in kept sources
      expect(res.sources.map((s) => s.id)).toEqual([2]);
      // Unknown IDs are reported for usage logging
      expect(res.unknownIds).toEqual([99, 100]);
    });

    it("in non-streamed mode (dropUnknown: true): drops unknown markers from text", () => {
      const text = "Known [1]. Unknown [99]. Mixed [2, 99].";
      const res = citedSubset(text, sampleSources, { dropUnknown: true });

      // [99] dropped completely, [2, 99] becomes [2]
      expect(res.text).toBe("Known [1]. Unknown. Mixed [2].");
      expect(res.sources.map((s) => s.id)).toEqual([1, 2]);
      expect(res.unknownIds).toEqual([99]);
    });

    it("drops unknown marker at end of sentence cleanly without extra space", () => {
      const text = "The moon is made of cheese [99].";
      const res = citedSubset(text, sampleSources, { dropUnknown: true });
      expect(res.text).toBe("The moon is made of cheese.");
    });

    it("handles multiple unknown IDs in a single group [98, 99]", () => {
      const text = "Dangling reference [98, 99] disappears.";
      const res = citedSubset(text, sampleSources, { dropUnknown: true });
      expect(res.text).toBe("Dangling reference disappears.");
    });
  });

  describe("property test: every [n] in streamed text maps to a source with id n", () => {
    it("satisfies the mapping property across 100 random citation subsets", () => {
      const allSources: Source[] = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        title: `Source ${i + 1}`,
        url: `https://example.com/s${i + 1}`,
      }));

      // Run 100 randomized trials
      for (let trial = 0; trial < 100; trial++) {
        // Pick a random non-empty subset of source IDs to cite
        let chosenIds = allSources
          .map((s) => s.id)
          .filter(() => Math.random() < 0.4);
        if (chosenIds.length === 0) {
          chosenIds = [allSources[Math.floor(Math.random() * allSources.length)].id];
        }

        // Generate synthetic streamed text containing those markers
        const sentenceParts: string[] = ["Introduction."];
        for (const id of chosenIds) {
          sentenceParts.push(`Claim backed by [${id}].`);
        }
        // Randomly combine some into multi-markers
        if (chosenIds.length >= 2 && Math.random() < 0.5) {
          sentenceParts.push(`Combined claim [${chosenIds[0]}, ${chosenIds[1]}].`);
        }
        const streamedText = sentenceParts.join(" ");

        const { sources: eventSources } = citedSubset(streamedText, allSources, { dropUnknown: false });
        const sourceMap = new Map(eventSources.map((s) => [s.id, s]));

        // Extract every [n] from the streamed text
        const matches = [...streamedText.matchAll(/\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g)];
        const markerIds = matches.flatMap((m) =>
          m[1].split(/[,;]/).map((d) => Number(d.trim())),
        );

        // Every marker ID in the streamed text MUST map to a source with id === markerId
        for (const markerId of markerIds) {
          const matchedSource = sourceMap.get(markerId);
          expect(matchedSource, `Marker [${markerId}] must map to source with id ${markerId}`).toBeDefined();
          expect(matchedSource!.id).toBe(markerId);
        }

        // And eventSources contains no extra uncited sources
        const citedSet = new Set(markerIds);
        for (const s of eventSources) {
          expect(citedSet.has(s.id)).toBe(true);
        }
      }
    });
  });
});

describe("appendCitations", () => {
  it("appends numbered sources section to answer", () => {
    const sources: Source[] = [
      { id: 2, title: "Two", url: "https://two.example" },
      { id: 5, title: "Five", url: "https://five.example", date: "2026-01-01" },
    ];
    const res = appendCitations("The answer.", sources);
    expect(res.text).toBe("The answer.\n\nSources:\n[2] Two: https://two.example\n[5] Five (2026-01-01): https://five.example");
  });

  it("returns original text unmodified if sources is empty", () => {
    const res = appendCitations("Plain answer.", []);
    expect(res.text).toBe("Plain answer.");
    expect(res.sources).toEqual([]);
  });
});

describe("dedupeSources", () => {
  it("assigns stable IDs 1, 2, ... in order of first appearance and dedupes by URL/title", () => {
    const raw: Source[] = [
      { id: 99, title: "A", url: "https://a.example" },
      { id: 99, title: "B", url: "https://b.example" },
      { id: 99, title: "A duplicate", url: "https://a.example" },
      { id: 99, title: "C", url: "https://c.example" },
    ];
    const deduped = dedupeSources(raw);
    expect(deduped).toHaveLength(3);
    expect(deduped.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(deduped.map((s) => s.url)).toEqual(["https://a.example", "https://b.example", "https://c.example"]);
  });
});

describe("extractSources failure paths", () => {
  it("returns empty array for failed tool outputs", () => {
    expect(extractSources("web_search", { success: false, data: [{ url: "https://x.com" }] })).toEqual([]);
    expect(extractSources("web_search", null)).toEqual([]);
    expect(extractSources("web_search", "not an object")).toEqual([]);
    expect(extractSources("browse", { success: false })).toEqual([]);
  });

  it("filters out search items missing URLs", () => {
    const items = [{ title: "No URL" }, { url: "https://valid.com", title: "Valid" }];
    const res = extractSources("web_search", items);
    expect(res).toHaveLength(1);
    expect(res[0].url).toBe("https://valid.com");
  });
});

describe("keepCitedSources backwards compatibility", () => {
  it("calls citedSubset with dropUnknown=true and returns stable ids", () => {
    const sources: Source[] = [
      { id: 1, title: "One", url: "https://one.com" },
      { id: 2, title: "Two", url: "https://two.com" },
    ];
    const res = keepCitedSources("Answer [2].", sources);
    expect(res.text).toBe("Answer [2].");
    expect(res.sources).toHaveLength(1);
    expect(res.sources[0].id).toBe(2);
  });
});
