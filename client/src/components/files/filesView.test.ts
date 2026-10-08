import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilesView, formatBytes, formatStorage, type FileItem } from "./FilesView";
import { SAMPLE_FILES } from "@/lab/fixtures/files";

describe("FilesView Component", () => {
  const defaultProps = {
    files: SAMPLE_FILES,
    searchQuery: "",
    onSearchChange: vi.fn(),
    activeFilter: "all",
    onFilterChange: vi.fn(),
    storageUsedBytes: 2.4 * 1024 * 1024 * 1024,
    storageCapBytes: 10 * 1024 * 1024 * 1024,
  };

  it("renders large Files title with Upload button and lede", () => {
    const html = renderToStaticMarkup(React.createElement(FilesView, defaultProps));
    expect(html).toContain("files-head");
    expect(html).toContain('<h1 class="title">Files</h1>');
    expect(html).toContain("Upload");
    expect(html).toContain("Everything Sutaeru made for you, and everything you gave it.");
  });

  it("renders storage card with stepped segmented meter (6 of 24 on for 2.4 GB)", () => {
    const html = renderToStaticMarkup(React.createElement(FilesView, defaultProps));
    expect(html).toContain("card storage");
    expect(html).toContain("2.4 of 10 GB");
    expect(html).toContain("segs");

    // Count segments with "on"
    const onMatches = html.match(/<i\b[^>]*class="on"[^>]*>/g);
    expect(onMatches).not.toBeNull();
    expect(onMatches!.length).toBe(6);
  });

  it("renders storage card with nearly full segments (23 of 24 on for 9.4 GB)", () => {
    const html = renderToStaticMarkup(
      React.createElement(FilesView, {
        ...defaultProps,
        storageUsedBytes: 9.4 * 1024 * 1024 * 1024,
      })
    );
    expect(html).toContain("9.4 of 10 GB");
    const onMatches = html.match(/<i\b[^>]*class="on"[^>]*>/g);
    expect(onMatches).not.toBeNull();
    expect(onMatches!.length).toBe(23);
  });

  it("renders search input and horizontally scrollable filter chips", () => {
    const html = renderToStaticMarkup(React.createElement(FilesView, defaultProps));
    expect(html).toContain('placeholder="Search files"');
    expect(html).toContain("hscroll filters");
    expect(html).toContain("All");
    expect(html).toContain("Reports");
    expect(html).toContain("Decks");
    expect(html).toContain("Sheets");
    expect(html).toContain("Images");
    expect(html).toContain("Videos");
  });

  it("renders file cards with miniature documents and metadata", () => {
    const html = renderToStaticMarkup(React.createElement(FilesView, defaultProps));
    expect(html).toContain("file-grid");
    expect(html).toContain("Off grid solar cost per kWh");
    expect(html).toContain("Edited 2 h ago · 14 sources");
    expect(html).toContain("TGWI investor update Q3");
    expect(html).toContain("Villa BOQ and budget");
    expect(html).toContain("Ceramic mug, morning light");
    expect(html).toContain("Weekly market brief");
  });

  it("renders live writing file with pulsating dot and progress bar", () => {
    const html = renderToStaticMarkup(React.createElement(FilesView, defaultProps));
    expect(html).toContain("live-dot pulse");
    expect(html).toContain("Writing");
    expect(html).toContain("Weekly market brief");
    expect(html).toContain("bar-holder");
    expect(html).toContain('id="liveEta"');
  });

  it("renders active vs trashed view toggles when onViewChange is provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(FilesView, {
        ...defaultProps,
        view: "active",
        onViewChange: vi.fn(),
      })
    );
    expect(html).toContain("Active");
    expect(html).toContain("Trash");
  });

  it("renders empty state when search query produces no results", () => {
    const html = renderToStaticMarkup(
      React.createElement(FilesView, {
        ...defaultProps,
        searchQuery: "quantum battery",
      })
    );
    expect(html).toContain("panel empty");
    expect(html).toContain("No files match.");
    expect(html).toContain("Nothing called “quantum battery” in All.");
    expect(html).toContain("Clear search");
    expect(html).toContain("empty-sphere");
  });

  it("renders designed empty state when filter has no items (e.g. video filter)", () => {
    const html = renderToStaticMarkup(
      React.createElement(FilesView, {
        ...defaultProps,
        activeFilter: "video",
        files: SAMPLE_FILES.filter((f) => f.kind !== "video"),
      })
    );
    expect(html).toContain("panel empty");
    expect(html).toContain("Nothing here yet.");
    expect(html).toContain("Videos Sutaeru makes will land here.");
    expect(html).toContain("Ask Sutaeru to make one");
    expect(html).toContain("empty-sphere");
  });

  it("renders uploading card with progress bar when isUploading is true", () => {
    const html = renderToStaticMarkup(
      React.createElement(FilesView, {
        ...defaultProps,
        isUploading: true,
        uploadingFileName: "site-survey-2026.docx",
        uploadProgress: 0.65,
      })
    );
    expect(html).toContain("Uploading");
    expect(html).toContain("site-survey-2026.docx");
    expect(html).toContain("65% complete");
    expect(html).toContain("bar art-ditherbar-canvas");
    expect(html).toContain("About 5 sec left");
  });

  it("formatBytes correctly formats file sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(formatBytes(3.2 * 1024 * 1024 * 1024)).toBe("3.2 GB");
  });

  it("formatStorage correctly formats storage labels", () => {
    expect(formatStorage(2.4 * 1024 * 1024 * 1024, 10 * 1024 * 1024 * 1024)).toBe("2.4 of 10 GB");
    expect(formatStorage(9.4 * 1024 * 1024 * 1024, 10 * 1024 * 1024 * 1024)).toBe("9.4 of 10 GB");
  });
});
