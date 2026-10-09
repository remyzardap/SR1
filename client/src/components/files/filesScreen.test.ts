import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilesScreen } from "./FilesScreen";
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

describe("FilesScreen rows", () => {
  it("shows the whole file name, never an abbreviation", () => {
    const out = html();
    expect(out).toContain("Solar pitch deck for the Bandung co-operative");
  });

  it("draws one row per file with its type tile", () => {
    const out = html();
    expect(out).toContain('class="frow-wrap"');
    expect((out.match(/class="frow"/g) || []).length).toBe(4); // the trashed file is not in the active view
    expect((out.match(/class="ftype"/g) || []).length).toBe(4);
    expect(out).toContain("<em>DOCX</em>");
    expect(out).toContain("<em>PDF</em>");
  });

  it("puts type · size · date under every name", () => {
    const out = html();
    expect(out).toContain(metaLine(FILES[0], NOW)); // Word document · 38 KB · Today
    expect(out).toContain("Word document · 38 KB · Today");
    expect(out).toContain("PDF · 1.2 MB · Yesterday");
    expect(out).toContain("Slides · 3.1 MB");
  });

  it("the row itself opens the file and says so to a screen reader", () => {
    const out = html({ onOpenFile: vi.fn() });
    expect(out).toContain('aria-label="Open Bakery loyalty card proposal, Word document · 38 KB · Today"');
  });

  it("keeps every action in the row menu", () => {
    const out = html({ onPreviewFile: vi.fn(), onDownloadFile: vi.fn(), onTrashFile: vi.fn() });
    expect(out).toContain("More actions for Rooftop solar payback report");
    expect(out).toContain("file-more-btn");
  });

  it("shows a live row for a file still being written", () => {
    const out = html();
    expect(out).toContain("is-live");
    expect(out).toContain("Writing");
    expect(out).toContain("bar-holder");
  });
});

describe("FilesScreen controls", () => {
  it("offers the seven type chips as one radio group", () => {
    const out = html();
    expect(out).toContain('role="radiogroup"');
    for (const label of ["All", "Documents", "Images", "Sheets", "Slides", "PDFs", "Other"]) {
      expect(out).toContain(`>${label}<`);
    }
    expect(out).toContain('aria-checked="true"');
  });

  it("marks only the picked chip", () => {
    const out = html({ filter: "images" });
    expect((out.match(/aria-checked="true"/g) || []).length).toBe(1);
    expect(out).toContain('data-filter="images"');
  });

  it("shows how the list is sorted", () => {
    expect(html()).toContain("Newest");
    expect(html({ sort: { key: "size", dir: "asc" } })).toContain("Smallest");
    expect(html({ sort: { key: "name", dir: "asc" } })).toContain("Name A–Z");
  });

  it("has a 44 px upload control inside the search field", () => {
    const out = html({ onUpload: vi.fn() });
    expect(out).toContain('aria-label="Upload files"');
    expect(out).toContain("search-upload");
    expect(out).toContain('placeholder="Search in Files"');
  });

  it("counts the items in the head, and says “of” once filtered", () => {
    expect(html()).toContain("4 items");
    expect(html({ filter: "documents" })).toContain("2 of 4");
  });

  it("switches between active and trash", () => {
    const out = html({ view: "trashed", onViewChange: vi.fn() });
    expect(out).toContain("Suppliers shortlist");
    expect(out).not.toContain("Bakery loyalty card proposal");
    expect(out).toContain('aria-pressed="true"');
  });
});

describe("FilesScreen storage fold", () => {
  it("folds storage into one line that shows the used total", () => {
    const out = html();
    expect(out).toContain('class="fold');
    expect(out).toContain(">Storage<");
    expect(out).toContain("aria-expanded");
    expect(out).toContain("4.3 MB of 10 GB"); // 38 KB + 1.2 MB + 3.1 MB, the live file has no size yet
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

  it("shows the uploading row with its percentage", () => {
    const out = html({ isUploading: true, uploadingFileName: "site-survey-2026.docx", uploadProgress: 0.65 });
    expect(out).toContain("site-survey-2026.docx");
    expect(out).toContain("65% complete");
    expect(out).toContain("Uploading");
  });
});
