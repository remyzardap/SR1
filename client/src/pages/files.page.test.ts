import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilesView, formatBytes, formatStorage, type FileItem } from "@/components/files/FilesView";
import { SAMPLE_FILES, FILES_LAB_STATES } from "@/lab/fixtures/files";

describe("Files Page and Container Integration", () => {
  it("maps files correctly to display miniature document cards and formatted metadata", () => {
    const onPreview = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(FilesView, {
        files: SAMPLE_FILES,
        searchQuery: "",
        onSearchChange: vi.fn(),
        activeFilter: "all",
        onFilterChange: vi.fn(),
        storageUsedBytes: 2.4 * 1024 * 1024 * 1024,
        storageCapBytes: 10 * 1024 * 1024 * 1024,
        onPreviewFile: onPreview,
      })
    );

    // Verifies report, deck, sheet, image kinds render proper card structures
    expect(html).toContain("Off grid solar cost per kWh");
    expect(html).toContain("doc-report");
    expect(html).toContain("TGWI investor update Q3");
    expect(html).toContain("doc-deck");
    expect(html).toContain("Villa BOQ and budget");
    expect(html).toContain("doc-sheet");
    expect(html).toContain("Ceramic mug, morning light");
    expect(html).toContain('class="ph-img"');
  });

  it("handles empty list per kind (e.g., video filter) with designed empty state", () => {
    const onAskSutaeru = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(FilesView, {
        files: SAMPLE_FILES,
        searchQuery: "",
        onSearchChange: vi.fn(),
        activeFilter: "video",
        onFilterChange: vi.fn(),
        storageUsedBytes: 2.4 * 1024 * 1024 * 1024,
        storageCapBytes: 10 * 1024 * 1024 * 1024,
        onAskSutaeru,
      })
    );

    expect(html).toContain("Nothing here yet.");
    expect(html).toContain("Videos Sutaeru makes will land here.");
    expect(html).toContain("Ask Sutaeru to make one");
    expect(html).toContain("empty-sphere");
  });

  it("handles search queries with no matches and allows clearing search", () => {
    const onSearchChange = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(FilesView, {
        files: SAMPLE_FILES,
        searchQuery: "nonexistent term",
        onSearchChange,
        activeFilter: "all",
        onFilterChange: vi.fn(),
        storageUsedBytes: 2.4 * 1024 * 1024 * 1024,
        storageCapBytes: 10 * 1024 * 1024 * 1024,
      })
    );

    expect(html).toContain("No files match.");
    expect(html).toContain("Nothing called “nonexistent term” in All.");
    expect(html).toContain("Clear search");
  });

  it("handles live writing file with animated progress bar and ETA", () => {
    const liveFile: FileItem = {
      id: "live-1",
      name: "Quarterly Energy Synthesis",
      kind: "report",
      meta: "Writing...",
      live: true,
    };

    const html = renderToStaticMarkup(
      React.createElement(FilesView, {
        files: [liveFile],
        searchQuery: "",
        onSearchChange: vi.fn(),
        activeFilter: "all",
        onFilterChange: vi.fn(),
        storageUsedBytes: 500 * 1024 * 1024,
      })
    );

    expect(html).toContain("Writing");
    expect(html).toContain("live-dot pulse");
    expect(html).toContain("Quarterly Energy Synthesis");
    expect(html).toContain("bar-holder");
    expect(html).toContain("About 40 sec left");
  });

  it("handles storage nearly full state (23 segments filled)", () => {
    const html = renderToStaticMarkup(
      React.createElement(FilesView, {
        files: SAMPLE_FILES,
        searchQuery: "",
        onSearchChange: vi.fn(),
        activeFilter: "all",
        onFilterChange: vi.fn(),
        storageUsedBytes: 9.4 * 1024 * 1024 * 1024,
        storageCapBytes: 10 * 1024 * 1024 * 1024,
      })
    );

    expect(html).toContain("9.4 of 10 GB");
    const onMatches = html.match(/<i\b[^>]*class="on"[^>]*>/g);
    expect(onMatches?.length).toBe(23);
  });

  it("supports failure paths and edge cases gracefully", () => {
    // Empty files array
    const emptyHtml = renderToStaticMarkup(
      React.createElement(FilesView, {
        files: [],
        searchQuery: "",
        onSearchChange: vi.fn(),
        activeFilter: "all",
        onFilterChange: vi.fn(),
        storageUsedBytes: 0,
      })
    );
    expect(emptyHtml).toContain("Nothing here yet.");
    expect(emptyHtml).toContain("0.0 of 10 GB");

    // File with missing metadata / unusual kind
    const weirdFile: FileItem = {
      id: 999,
      name: "untitled-binary.bin",
      kind: "unknown",
      meta: "0 B",
    };
    const weirdHtml = renderToStaticMarkup(
      React.createElement(FilesView, {
        files: [weirdFile],
        searchQuery: "",
        onSearchChange: vi.fn(),
        activeFilter: "all",
        onFilterChange: vi.fn(),
        storageUsedBytes: 0,
      })
    );
    expect(weirdHtml).toContain("untitled-binary.bin");
    expect(weirdHtml).toContain("doc-report"); // falls back to report miniature safely
  });

  it("verifies all lab fixture states conform to schema", () => {
    expect(Object.keys(FILES_LAB_STATES)).toEqual([
      "populated",
      "filtered",
      "searching_no_match",
      "empty_per_kind",
      "uploading",
      "writing",
      "storage_nearly_full",
    ]);

    for (const [key, state] of Object.entries(FILES_LAB_STATES)) {
      expect(state.name).toBe(key);
      expect(typeof state.label).toBe("string");
      expect(Array.isArray(state.files)).toBe(true);
      expect(state.storageUsedBytes).toBeGreaterThanOrEqual(0);
      expect(state.storageCapBytes).toBeGreaterThan(0);
    }
  });
});
