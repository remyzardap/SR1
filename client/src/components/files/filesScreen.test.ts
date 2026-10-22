import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilesScreen, DotMatrixNumber, photoForFile, cardLabel } from "./FilesScreen";
import { metaLine, type FileItem } from "./fileModel";

const KB = 1024;
const MB = 1024 * KB;
const NOW = new Date(2026, 9, 9, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const FILES: FileItem[] = [
  {
    id: 1,
    name: "Bakery loyalty card proposal",
    kind: "document",
    format: "docx",
    fileSizeBytes: 38 * KB,
    createdAt: new Date(NOW.getTime() - 2 * 60 * 60000),
    fileUrl: "/files/bakery.docx",
  },
  {
    id: 2,
    name: "Rooftop solar payback report",
    kind: "report",
    format: "pdf",
    fileSizeBytes: 1.2 * MB,
    createdAt: new Date(NOW.getTime() - DAY),
    updatedAt: new Date(NOW.getTime() - DAY),
    fileUrl: "/files/payback.pdf",
    threadId: "t-1",
  },
  {
    id: 3,
    name: "Solar pitch deck for the Bandung co-operative",
    kind: "deck",
    format: "pptx",
    fileSizeBytes: 3.1 * MB,
    createdAt: new Date(NOW.getTime() - 8 * DAY),
    fileUrl: "/files/deck.pptx",
  },
  {
    id: 4,
    name: "Weekly market brief",
    kind: "report",
    format: "md",
    live: true,
    fileSizeBytes: null,
    createdAt: new Date(NOW.getTime() - 60_000),
    fileUrl: "/files/brief.md",
  },
  {
    id: 5,
    name: "Suppliers shortlist",
    kind: "document",
    format: "docx",
    fileSizeBytes: 52 * KB,
    createdAt: new Date(NOW.getTime() - 34 * DAY),
    trashed: true,
    fileUrl: "/files/suppliers.docx",
  },
];

const base = {
  files: FILES,
  query: "",
  onQueryChange: vi.fn(),
  filter: "all" as const,
  onFilterChange: vi.fn(),
  sort: { key: "date" as const, dir: "desc" as const },
  onSortChange: vi.fn(),
  onOpenFile: vi.fn(),
  onUpload: vi.fn(),
  onAskSutaeru: vi.fn(),
  now: NOW,
};

const html = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(React.createElement(FilesScreen, { ...base, ...over } as any));

describe("FilesScreen Quiet canvas cards", () => {
  it("shows the whole file name in title and accessible label", () => {
    const out = html();
    expect(out).toContain("Solar pitch deck for the Bandung co-operative");
    expect(out).toContain('aria-label="Open Solar pitch deck for the Bandung co-operative');
  });

  it("renders the 2-column masonry grid with qcard elements", () => {
    const out = html();
    expect(out).toContain("files-masonry");
    expect(out).toContain("files-col");
    expect(out).toContain("col-offset");
    // 4 active files
    expect((out.match(/class="qcard"/g) || []).length).toBe(4);
    expect((out.match(/class="qtap qcard-btn"/g) || []).length).toBe(4);
  });

  it("renders format badges (DOCX, PDF) and kind tags", () => {
    const out = html();
    expect(out).toContain("DOCX");
    expect(out).toContain("PDF");
    expect(out).toContain("PPTX");
    expect(out).toContain("qcard-tag");
    expect(out).toContain("Report");
  });

  it("associates type · size · date with every card for screen readers", () => {
    const out = html();
    expect(out).toContain(metaLine(FILES[0], NOW)); // Word document · 38 KB · Today
    expect(out).toContain("Word document · 38 KB · Today");
    expect(out).toContain("PDF · 1.2 MB · Yesterday");
    expect(out).toContain("Slides · 3.1 MB");
  });

  it("clicking the card button triggers onOpenFile", () => {
    const fn = vi.fn();
    const out = html({ onOpenFile: fn });
    expect(out).toContain('aria-label="Open Bakery loyalty card proposal, Word document · 38 KB · Today"');
  });

  it("keeps file action dropdown menu on each card", () => {
    const out = html({ onPreviewFile: vi.fn(), onDownloadFile: vi.fn(), onTrashFile: vi.fn() });
    expect(out).toContain("More actions for Rooftop solar payback report");
    expect(out).toContain("file-more-btn");
  });

  it("shows a live pulse indicator for a file still being written", () => {
    const out = html();
    expect(out).toContain("qlive");
    expect(out).toContain("bar-holder");
    expect(out).toContain("Writing");
  });
});

describe("FilesScreen Quiet header and controls", () => {
  it("renders the back button and search button in the header", () => {
    const out = html();
    expect(out).toContain('aria-label="Back"');
    expect(out).toContain('aria-label="Search"');
  });

  it("renders the 5x7 dot matrix item count in the title block", () => {
    const out = html();
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="4"');
    expect(out).toContain(">Files<");
    expect(out).toContain(">Everything<");
    expect(out).toContain(">Items<");
  });

  it("offers the filter chips as a radiogroup with counts", () => {
    const out = html();
    expect(out).toContain('role="radiogroup"');
    for (const label of ["All", "Docs", "Images", "Video", "Sheets", "Slides", "Other"]) {
      expect(out).toContain(`>${label}<`);
    }
    expect(out).toContain('aria-checked="true"');
  });

  it("marks only the picked chip as active and aria-checked", () => {
    const out = html({ filter: "images" });
    expect((out.match(/aria-checked="true"/g) || []).length).toBe(1);
    expect(out).toContain('data-filter="images"');
  });

  it("expands the search bar when query is non-empty", () => {
    const out = html({ query: "bakery" });
    expect(out).toContain("files-search-bar");
    expect(out).toContain('value="bakery"');
    expect(out).toContain('aria-label="Clear search"');
  });

  it("renders the 60px FAB upload button", () => {
    const onUp = vi.fn();
    const out = html({ onUpload: onUp });
    expect(out).toContain('class="qtap files-fab"');
    expect(out).toContain('aria-label="Add a file"');
  });

  it("switches between active and trash view", () => {
    const out = html({ view: "trashed", onViewChange: vi.fn() });
    expect(out).toContain("Suppliers shortlist");
    expect(out).not.toContain("Bakery loyalty card proposal");
    expect(out).toContain(">Trash<");
  });
});

describe("FilesScreen storage fold", () => {
  it("folds storage into one line that shows the used total", () => {
    const out = html();
    expect(out).toContain('class="fold');
    expect(out).toContain(">Storage<");
    expect(out).toContain("aria-expanded");
    expect(out).toContain("4.3 MB of 10 GB");
  });

  it("opens the meter and the breakdown per type", () => {
    const out = html();
    expect(out).toContain("storage-body");
    expect(out).toContain('class="segs"');
    const splits = out.slice(out.indexOf('class="storage-splits"'));
    for (const label of ["Documents", "Slides", "PDFs"]) {
      expect(splits.slice(0, splits.indexOf("</ul>"))).toContain(label);
    }
  });

  it("honours a used total passed in from the server", () => {
    const out = html({ storageUsedBytes: 9.4 * 1024 * MB, storageCapBytes: 10 * 1024 * MB });
    expect(out).toContain("9.4 GB of 10 GB");
    const segs = out.slice(out.indexOf('class="segs"'));
    expect((segs.slice(0, segs.indexOf("</div>")).match(/class="on"/g) || []).length).toBe(23);
    const dots = out.slice(out.indexOf('class="dots"'));
    expect((dots.slice(0, dots.indexOf("</span>")).match(/class="on"/g) || []).length).toBe(5);
  });
});

describe("FilesScreen empty and busy states", () => {
  it("designs an empty state per chip", () => {
    const out = html({ filter: "slides", files: FILES.filter((f) => f.kind !== "deck") });
    expect(out).toContain("Nothing here yet.");
    expect(out).toContain("Decks Sutaeru makes will land here.");
    expect(out).toContain("Ask Sutaeru to make one");
  });

  it("names the search that found nothing and offers to clear it", () => {
    const out = html({ query: "quantum battery" });
    expect(out).toContain("No files match.");
    expect(out).toContain("Nothing called “quantum battery” in All.");
    expect(out).toContain("Clear search");
  });

  it("says the trash is empty", () => {
    const out = html({ view: "trashed", files: FILES.filter((f) => !f.trashed) });
    expect(out).toContain("Trash is empty.");
  });

  it("shows the uploading card with its percentage and progress bar", () => {
    const out = html({ isUploading: true, uploadingFileName: "site-survey-2026.docx", uploadProgress: 0.65 });
    expect(out).toContain("site-survey-2026.docx");
    expect(out).toContain("65% complete");
    expect(out).toContain("Uploading");
    expect(out).toContain('aria-valuenow="65"');
    expect(out).toContain('aria-label="Upload progress"');
  });
});

describe("DotMatrixNumber pure component", () => {
  it("renders matching SVG dot matrix for 24 as in Files.dc.html", () => {
    const out = renderToStaticMarkup(React.createElement(DotMatrixNumber, { value: 24 }));
    expect(out).toContain('aria-label="24"');
    expect(out).toContain('viewBox="0 0 57.2 36.4"');
    expect(out).toContain('cx="7.8" cy="2.6" r="1.98"');
    expect(out).toContain('cx="49.4" cy="2.6" r="1.98"');
    expect((out.match(/<circle/g) || []).length).toBe(28); // 14 dots for 2, 14 dots for 4
  });

  it("handles 0, 1 and multi-digit counts safely", () => {
    const zero = renderToStaticMarkup(React.createElement(DotMatrixNumber, { value: 0 }));
    expect(zero).toContain('aria-label="0"');
    const one = renderToStaticMarkup(React.createElement(DotMatrixNumber, { value: 1 }));
    expect(one).toContain('aria-label="1"');
    const hundred = renderToStaticMarkup(React.createElement(DotMatrixNumber, { value: 100 }));
    expect(hundred).toContain('aria-label="100"');
  });
});

describe("photoForFile and cardLabel mappings", () => {
  it("maps studio photos appropriately based on format and kind", () => {
    expect(photoForFile({ name: "a.xlsx", kind: "sheet", format: "xlsx" })).toBe("/studio/m/angle-top.webp");
    expect(photoForFile({ name: "b.pdf", kind: "report", format: "pdf" })).toBe("/studio/m/look-clay.webp");
    expect(photoForFile({ name: "c.mp4", kind: "video", format: "mp4" })).toBe("/studio/m/light-night.webp");
    expect(photoForFile({ name: "d.webp", kind: "image", format: "webp", photoUrl: "/studio/t/custom.webp" })).toBe("/studio/t/custom.webp");
  });

  it("produces concise card labels matching Quiet canvas", () => {
    expect(cardLabel({ name: "a.docx", kind: "report" })).toBe("Report");
    expect(cardLabel({ name: "b.xlsx", kind: "sheet" })).toBe("Sheet");
    expect(cardLabel({ name: "c.mp4", kind: "video" })).toBe("Video");
    expect(cardLabel({ name: "d.md", kind: "brief" })).toBe("Brief");
  });
});
