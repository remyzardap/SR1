import { describe, it, expect } from "vitest";
import {
  CATEGORY_LABELS,
  TYPE_FILTERS,
  categoryOf,
  dateLabel,
  filterFiles,
  formatBadge,
  formatBytes,
  formatStorage,
  metaLine,
  sortDirLabel,
  sortFiles,
  sortLabel,
  storageBreakdown,
  typeLabel,
  usedBytes,
  type FileFilterId,
  type FileItem,
} from "./fileModel";

const NOW = new Date(2026, 9, 9, 12, 0, 0); // local noon, so calendar-day labels hold in any timezone
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const KB = 1024;
const MB = 1024 * KB;

const local = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0, 0);

const file = (over: Partial<FileItem> & { name: string }): FileItem => ({
  id: over.name,
  kind: "other",
  ...over,
});

describe("categoryOf — which chip a file belongs to", () => {
  const cases: [FileItem, string][] = [
    [file({ name: "a.docx", kind: "document", format: "docx" }), "documents"],
    [file({ name: "notes", kind: "report", format: "md" }), "documents"],
    [file({ name: "brief", kind: "brief" }), "documents"],
    [file({ name: "watch", kind: "monitor" }), "documents"],
    [file({ name: "invoice.pdf", kind: "report", format: "pdf" }), "pdfs"],
    [file({ name: "mug.png", kind: "image", format: "png" }), "images"],
    [file({ name: "mug", kind: "image" }), "images"],
    [file({ name: "logo.svg", kind: "other", format: "svg" }), "images"],
    [file({ name: "boq.xlsx", kind: "sheet", format: "xlsx" }), "sheets"],
    [file({ name: "rows.csv", kind: "other", format: "csv" }), "sheets"],
    [file({ name: "deck.pptx", kind: "deck", format: "pptx" }), "slides"],
    [file({ name: "keynote", kind: "presentation" }), "slides"],
    [file({ name: "walkthrough.mp4", kind: "video", format: "mp4" }), "other"],
    [file({ name: "voice", kind: "audio", format: "m4a" }), "other"],
    [file({ name: "roll.zip", kind: "other", format: "zip" }), "other"],
    [file({ name: "mystery.bin", kind: "unknown", format: "bin" }), "other"],
    [file({ name: "no extension at all", kind: "" }), "other"],
  ];

  for (const [item, expected] of cases) {
    it(`${item.name || item.kind} → ${expected}`, () => {
      expect(categoryOf(item)).toBe(expected);
    });
  }

  it("the extension wins over the kind", () => {
    expect(categoryOf(file({ name: "x", kind: "report", format: "pdf" }))).toBe("pdfs");
    expect(categoryOf(file({ name: "x", kind: "sheet", format: "md" }))).toBe("documents");
  });

  it("is case and dot insensitive", () => {
    expect(categoryOf(file({ name: "x", kind: "IMAGE", format: ".PNG" }))).toBe("images");
  });
});

describe("typeLabel and formatBadge — the words in the meta line", () => {
  it("never shows a vendor or model name", () => {
    const labels = [
      file({ name: "a", kind: "image", format: "png", styleLabel: "Some engine" }),
      file({ name: "b", kind: "report", format: "md" }),
      file({ name: "c", kind: "deck", format: "pptx" }),
    ];
    for (const item of labels) {
      expect(typeLabel(item)).not.toMatch(/gemini|openai|claude|flux|wan|sora|vertex/i);
    }
  });

  it("names each type in plain words", () => {
    expect(typeLabel(file({ name: "a.docx", kind: "document", format: "docx" }))).toBe("Word document");
    expect(typeLabel(file({ name: "a.md", kind: "report", format: "md" }))).toBe("Note");
    expect(typeLabel(file({ name: "a.txt", kind: "other", format: "txt" }))).toBe("Text file");
    expect(typeLabel(file({ name: "a.pdf", kind: "report", format: "pdf" }))).toBe("PDF");
    expect(typeLabel(file({ name: "a.png", kind: "image", format: "png" }))).toBe("Image");
    expect(typeLabel(file({ name: "a.svg", kind: "image", format: "svg" }))).toBe("Vector image");
    expect(typeLabel(file({ name: "a.xlsx", kind: "sheet", format: "xlsx" }))).toBe("Spreadsheet");
    expect(typeLabel(file({ name: "a.csv", kind: "sheet", format: "csv" }))).toBe("CSV");
    expect(typeLabel(file({ name: "a.pptx", kind: "deck", format: "pptx" }))).toBe("Slides");
    expect(typeLabel(file({ name: "a.mp4", kind: "video", format: "mp4" }))).toBe("Video");
    expect(typeLabel(file({ name: "a.m4a", kind: "audio", format: "m4a" }))).toBe("Audio");
    expect(typeLabel(file({ name: "a.zip", kind: "other", format: "zip" }))).toBe("Archive");
    expect(typeLabel(file({ name: "a", kind: "brief" }))).toBe("Brief");
    expect(typeLabel(file({ name: "a.bin", kind: "unknown", format: "bin" }))).toBe("BIN file");
    expect(typeLabel(file({ name: "a", kind: "" }))).toBe("File");
  });

  it("uppercases the extension badge and caps it at five letters", () => {
    expect(formatBadge(file({ name: "a", format: "docx" }))).toBe("DOCX");
    expect(formatBadge(file({ name: "a", format: ".pdf" }))).toBe("PDF");
    expect(formatBadge(file({ name: "a", format: "markdown" }))).toBe("MARKD");
    expect(formatBadge(file({ name: "a" }))).toBeNull();
  });
});

describe("dates", () => {
  it("Today, Yesterday, then days, then the plain date", () => {
    expect(dateLabel(file({ name: "a", createdAt: new Date(NOW.getTime() - 2 * HOUR) }), NOW)).toBe("Today");
    expect(dateLabel(file({ name: "a", createdAt: local(2026, 10, 8) }), NOW)).toBe("Yesterday");
    expect(dateLabel(file({ name: "a", createdAt: new Date(NOW.getTime() - 3 * DAY) }), NOW)).toBe("3 days ago");
    expect(dateLabel(file({ name: "a", createdAt: new Date(NOW.getTime() - 6 * DAY - HOUR) }), NOW)).toBe("6 days ago");
    expect(dateLabel(file({ name: "a", createdAt: local(2026, 3, 4) }), NOW)).toBe(
      local(2026, 3, 4).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    );
  });

  it("prefers the edit stamp and survives strings, nulls and junk", () => {
    expect(
      dateLabel(file({ name: "a", createdAt: local(2026, 9, 1), updatedAt: new Date(NOW.getTime() - HOUR) }), NOW)
    ).toBe("Today");
    expect(dateLabel(file({ name: "a", createdAt: local(2026, 10, 7).toISOString() }), NOW)).toBe("2 days ago");
    expect(dateLabel(file({ name: "a" }), NOW)).toBe("");
    expect(dateLabel(file({ name: "a", createdAt: "not a date" }), NOW)).toBe("");
  });

  it("a stamp in the future never reads as a negative age", () => {
    expect(dateLabel(file({ name: "a", createdAt: new Date(NOW.getTime() + 5 * DAY) }), NOW)).toBe("Today");
  });
});

describe("metaLine — type · size · date", () => {
  it("joins all three", () => {
    expect(metaLine(file({ name: "report.pdf", kind: "report", format: "pdf", fileSizeBytes: 1.2 * MB, updatedAt: new Date(NOW.getTime() - DAY) }), NOW)).toBe("PDF · 1.2 MB · Yesterday");
    expect(metaLine(file({ name: "a.docx", kind: "document", format: "docx", fileSizeBytes: 38 * KB, createdAt: new Date(NOW.getTime() - 2 * HOUR) }), NOW)).toBe("Word document · 38 KB · Today");
  });

  it("drops the size when a file has none yet", () => {
    expect(metaLine(file({ name: "a.pdf", kind: "report", format: "pdf", createdAt: new Date(NOW.getTime() - DAY) }), NOW)).toBe("PDF · Yesterday");
    expect(metaLine(file({ name: "a.pdf", kind: "report", format: "pdf", fileSizeBytes: 0 }), NOW)).toBe("PDF");
  });

  it("says Writing for a file still being made", () => {
    expect(metaLine(file({ name: "brief", kind: "report", format: "md", live: true, createdAt: new Date(NOW.getTime() - MIN) }), NOW)).toBe("Writing · Today");
  });
});

describe("formatBytes and formatStorage", () => {
  it("steps through B, KB, MB and GB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(null)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2.5 * MB)).toBe("2.5 MB");
    expect(formatBytes(3.2 * 1024 * MB)).toBe("3.2 GB");
  });

  it("keeps a round cap short", () => {
    expect(formatStorage(2.4 * 1024 * MB, 10 * 1024 * MB)).toBe("2.4 GB of 10 GB");
    expect(formatStorage(42 * MB, 1 * MB * 1024)).toBe("42 MB of 1 GB");
    expect(formatStorage(0, 10 * 1024 * MB)).toBe("0 B of 10 GB");
  });
});

describe("filterFiles — chips plus the search box", () => {
  const list: FileItem[] = [
    file({ id: "doc", name: "Bakery proposal", kind: "document", format: "docx" }),
    file({ id: "pdf", name: "Payback report", kind: "report", format: "pdf" }),
    file({ id: "img", name: "Coffee, golden hour", kind: "image", format: "png" }),
    file({ id: "sheet", name: "City comparison", kind: "sheet", format: "xlsx" }),
    file({ id: "deck", name: "Solar pitch deck", kind: "deck", format: "pptx" }),
    file({ id: "vid", name: "Studio walkthrough", kind: "video", format: "mp4" }),
    file({ id: "zip", name: "Photo roll", kind: "other", format: "zip" }),
  ];

  const ids = (filter: FileFilterId, query = "") => filterFiles(list, filter, query).map((f) => f.id);

  it("All keeps every file", () => {
    expect(ids("all")).toHaveLength(list.length);
  });

  it("each chip keeps its own types", () => {
    expect(ids("documents")).toEqual(["doc"]);
    expect(ids("pdfs")).toEqual(["pdf"]);
    expect(ids("images")).toEqual(["img"]);
    expect(ids("sheets")).toEqual(["sheet"]);
    expect(ids("slides")).toEqual(["deck"]);
    expect(ids("other")).toEqual(["vid", "zip"]);
  });

  it("every chip is covered by exactly one type", () => {
    const chips = TYPE_FILTERS.filter((c) => c.id !== "all").flatMap((c) => ids(c.id));
    expect(chips.sort()).toEqual(ids("all").sort());
  });

  it("matches the name, case-insensitively, and the type words", () => {
    expect(ids("all", "coffee")).toEqual(["img"]);
    expect(ids("all", "COFFEE")).toEqual(["img"]);
    expect(ids("all", "spreadsheet")).toEqual(["sheet"]);
    expect(ids("all", "xlsx")).toEqual(["sheet"]);
  });

  it("combines with the chip", () => {
    expect(ids("other", "studio")).toEqual(["vid"]);
    expect(ids("images", "studio")).toEqual([]);
  });

  it("blank and whitespace queries change nothing", () => {
    expect(ids("all", "   ")).toHaveLength(list.length);
  });

  it("labels every category for the empty state", () => {
    for (const chip of TYPE_FILTERS) {
      if (chip.id === "all") continue;
      expect(CATEGORY_LABELS[chip.id]).toBe(chip.label);
    }
  });
});

describe("sortFiles — Name, Date, Size, both directions", () => {
  const list: FileItem[] = [
    file({ id: "b", name: "Beta plan", kind: "report", format: "md", fileSizeBytes: 5 * MB, updatedAt: new Date("2026-10-08T10:00:00Z") }),
    file({ id: "a", name: "Alpha report", kind: "report", format: "pdf", fileSizeBytes: 200 * KB, updatedAt: new Date("2026-10-09T10:00:00Z") }),
    file({ id: "c", name: "Chapter 2", kind: "document", format: "docx", fileSizeBytes: 40 * MB, updatedAt: new Date("2026-09-01T10:00:00Z") }),
    file({ id: "d", name: "Chapter 10", kind: "document", format: "docx", fileSizeBytes: null, updatedAt: new Date("2026-10-05T10:00:00Z") }),
  ];

  const ids = (key: "name" | "date" | "size", dir: "asc" | "desc") =>
    sortFiles(list, { key, dir }).map((f) => f.id);

  it("name reads alphabetically, numbers counted as numbers", () => {
    expect(ids("name", "asc")).toEqual(["a", "b", "c", "d"]);
    expect(ids("name", "desc")).toEqual(["d", "c", "b", "a"]);
  });

  it("date desc is newest first", () => {
    expect(ids("date", "desc")).toEqual(["a", "b", "d", "c"]);
    expect(ids("date", "asc")).toEqual(["c", "d", "b", "a"]);
  });

  it("size desc is largest first, and a file with no size is the smallest", () => {
    expect(ids("size", "desc")).toEqual(["c", "b", "a", "d"]);
    expect(ids("size", "asc")).toEqual(["d", "a", "b", "c"]);
  });

  it("does not mutate the array it was given", () => {
    const before = list.map((f) => f.id);
    sortFiles(list, { key: "size", dir: "asc" });
    expect(list.map((f) => f.id)).toEqual(before);
  });

  it("breaks ties by name, so rows never shuffle between renders", () => {
    const same: FileItem[] = [
      file({ id: "z", name: "Zebra", kind: "report", format: "pdf", fileSizeBytes: 10, updatedAt: new Date("2026-10-01T00:00:00Z") }),
      file({ id: "m", name: "Moose", kind: "report", format: "pdf", fileSizeBytes: 10, updatedAt: new Date("2026-10-01T00:00:00Z") }),
      file({ id: "a", name: "Ant", kind: "report", format: "pdf", fileSizeBytes: 10, updatedAt: new Date("2026-10-01T00:00:00Z") }),
    ];
    expect(sortFiles(same, { key: "size", dir: "desc" }).map((f) => f.name)).toEqual(["Ant", "Moose", "Zebra"]);
    expect(sortFiles(same, { key: "date", dir: "asc" }).map((f) => f.name)).toEqual(["Ant", "Moose", "Zebra"]);
  });

  it("files with no date at all sit at the oldest end", () => {
    const mixed: FileItem[] = [
      file({ id: "n", name: "No date", kind: "report", format: "md" }),
      file({ id: "y", name: "Yesteryear", kind: "report", format: "md", updatedAt: new Date("2020-01-01T00:00:00Z") }),
    ];
    expect(sortFiles(mixed, { key: "date", dir: "desc" }).map((f) => f.id)).toEqual(["n", "y"]);
  });

  it("sortLabel says what the list is doing", () => {
    expect(sortLabel({ key: "date", dir: "desc" })).toBe("Newest");
    expect(sortLabel({ key: "date", dir: "asc" })).toBe("Oldest");
    expect(sortLabel({ key: "name", dir: "asc" })).toBe("Name A–Z");
    expect(sortLabel({ key: "name", dir: "desc" })).toBe("Name Z–A");
    expect(sortLabel({ key: "size", dir: "desc" })).toBe("Largest");
    expect(sortLabel({ key: "size", dir: "asc" })).toBe("Smallest");
  });

  it("sortDirLabel names the direction of the current key", () => {
    expect(sortDirLabel({ key: "date", dir: "desc" })).toBe("Newest first");
    expect(sortDirLabel({ key: "date", dir: "asc" })).toBe("Oldest first");
    expect(sortDirLabel({ key: "name", dir: "asc" })).toBe("A to Z");
    expect(sortDirLabel({ key: "size", dir: "desc" })).toBe("Largest first");
  });
});

describe("storage", () => {
  const list: FileItem[] = [
    file({ id: "1", name: "a.zip", kind: "other", format: "zip", fileSizeBytes: 44 * MB }),
    file({ id: "2", name: "a.pptx", kind: "deck", format: "pptx", fileSizeBytes: 3.1 * MB }),
    file({ id: "3", name: "a.png", kind: "image", format: "png", fileSizeBytes: 2.4 * MB }),
    file({ id: "4", name: "a.pdf", kind: "report", format: "pdf", fileSizeBytes: 1.2 * MB }),
    file({ id: "5", name: "gone.docx", kind: "document", format: "docx", fileSizeBytes: 900 * MB, trashed: true }),
    file({ id: "6", name: "b.png", kind: "image", format: "png", fileSizeBytes: 1.8 * MB }),
  ];

  it("adds up only the files that are not in the trash", () => {
    expect(usedBytes(list)).toBeCloseTo(44 * MB + 3.1 * MB + 2.4 * MB + 1.2 * MB + 1.8 * MB, 6);
  });

  it("groups by type, biggest first", () => {
    const slices = storageBreakdown(list);
    expect(slices.map((s) => s.label)).toEqual(["Other", "Slides", "Images", "PDFs"]);
    expect(slices.find((s) => s.label === "Images")?.count).toBe(2);
    expect(slices.find((s) => s.label === "Images")?.bytes).toBeCloseTo(4.2 * MB, 6);
  });

  it("is empty when nothing is stored", () => {
    expect(storageBreakdown([])).toEqual([]);
    expect(usedBytes([])).toBe(0);
  });
});
