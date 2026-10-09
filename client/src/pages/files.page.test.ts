import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilesScreen } from "@/components/files/FilesScreen";
import { categoryOf, typeLabel } from "@/components/files/fileModel";
import { SAMPLE_FILES, FILES_LAB_STATES } from "@/lab/fixtures/files";

const noop = vi.fn();

const renderState = (key: keyof typeof FILES_LAB_STATES) => {
  const cfg = FILES_LAB_STATES[key];
  return renderToStaticMarkup(
    React.createElement(FilesScreen, {
      files: cfg.files,
      query: cfg.query,
      onQueryChange: noop,
      filter: cfg.filter,
      onFilterChange: noop,
      sort: cfg.sort,
      onSortChange: noop,
      view: cfg.view,
      onViewChange: noop,
      storageUsedBytes: cfg.storageUsedBytes,
      storageCapBytes: cfg.storageCapBytes,
      isUploading: cfg.isUploading,
      uploadingFileName: cfg.uploadingFileName,
      uploadProgress: cfg.uploadProgress,
      onUpload: noop,
      onOpenFile: noop,
      onPreviewFile: noop,
      onRenameFile: noop,
      onMoveFile: noop,
      onTrashFile: noop,
      onRestoreFile: noop,
      onDeleteFile: noop,
      onOpenAsBrief: noop,
      onDownloadFile: noop,
      onOpenFileInChat: noop,
      onAskSutaeru: noop,
    })
  );
};

describe("Files page fixtures", () => {
  it("covers every screen state the page can land on", () => {
    expect(Object.keys(FILES_LAB_STATES)).toEqual([
      "populated",
      "documents",
      "images",
      "sorted_by_size",
      "sorted_by_name",
      "searching_no_match",
      "empty_per_kind",
      "uploading",
      "writing",
      "trashed",
      "storage_nearly_full",
    ]);
  });

  it("keeps every state conforming to the schema", () => {
    for (const [key, state] of Object.entries(FILES_LAB_STATES)) {
      expect(state.name).toBe(key);
      expect(typeof state.label).toBe("string");
      expect(Array.isArray(state.files)).toBe(true);
      expect(typeof state.query).toBe("string");
      expect(["all", "documents", "images", "sheets", "slides", "pdfs", "other"]).toContain(state.filter);
      expect(["name", "date", "size"]).toContain(state.sort.key);
      expect(["asc", "desc"]).toContain(state.sort.dir);
      expect(["active", "trashed"]).toContain(state.view);
      expect(state.storageCapBytes).toBeGreaterThan(0);
      if (state.storageUsedBytes !== undefined) expect(state.storageUsedBytes).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives every sample file a type the chips understand, plus a size and a date", () => {
    for (const file of SAMPLE_FILES.filter((f) => !f.live)) {
      expect(["documents", "images", "sheets", "slides", "pdfs", "other"]).toContain(categoryOf(file));
      expect(typeof file.fileSizeBytes).toBe("number");
      expect(file.createdAt).toBeTruthy();
    }
  });

  it("never shows a model or vendor name", () => {
    for (const file of SAMPLE_FILES) {
      expect(typeLabel(file)).not.toMatch(/gemini|openai|claude|gpt|flux|wan|sora|vertex|anthropic/i);
    }
    for (const key of Object.keys(FILES_LAB_STATES)) {
      expect(renderState(key as keyof typeof FILES_LAB_STATES)).not.toMatch(/Gemini|OpenAI|Claude|GPT-/i);
    }
  });
});

describe("Files page through the screen", () => {
  it("renders the populated list with names, types, sizes and dates", () => {
    const out = renderState("populated");
    expect(out).toContain("Bakery loyalty card proposal");
    expect(out).toContain("Word document · 38 KB · Today");
    expect(out).toContain("PDF · 1.2 MB · Yesterday");
    expect(out).toContain('role="radiogroup"');
    expect(out).toContain('aria-expanded');
  });

  it("keeps the trashed file out of the active view and into the trash view", () => {
    expect(renderState("populated")).not.toContain("Suppliers shortlist");
    expect(renderState("trashed")).toContain("Suppliers shortlist");
  });

  it("orders by the chosen sort", () => {
    const bySize = renderState("sorted_by_size");
    expect(bySize.indexOf("Original photo roll")).toBeLessThan(bySize.indexOf("Bakery loyalty card"));
    const byName = renderState("sorted_by_name");
    expect(byName.indexOf("Bakery loyalty card")).toBeLessThan(byName.indexOf("City comparison"));
  });

  it("shows the live writing row with its bar, and the uploading row with its percentage", () => {
    const writing = renderState("writing");
    expect(writing).toContain("Writing · Today");
    expect(writing).toContain("bar-holder");
    const uploading = renderState("uploading");
    expect(uploading).toContain("site-survey-2026.docx");
    expect(uploading).toContain("65% complete");
  });

  it("shows the designed empty states", () => {
    expect(renderState("searching_no_match")).toContain("Nothing called “quantum battery” in All.");
    expect(renderState("empty_per_kind")).toContain("Spreadsheets Sutaeru makes will land here.");
  });

  it("fills the storage meter when it is nearly full", () => {
    const out = renderState("storage_nearly_full");
    expect(out).toContain("9.4 GB of 10 GB");
    const segs = out.slice(out.indexOf('class="segs"'));
    expect((segs.slice(0, segs.indexOf("</div>")).match(/class="on"/g) || []).length).toBe(23);
  });
});
