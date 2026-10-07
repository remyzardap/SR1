import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getMimeType,
  getFileKind,
  getFileFormat,
  htmlTableToMarkdown,
  storeFile,
  collectOutputs,
  processRichResults,
  uploadSessionFiles,
  MAX_OUTPUT_FILES,
  MAX_OUTPUT_FILE_SIZE_BYTES,
} from "./files";

// Mock dependencies
const storageMock = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  insert: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../../storageAdapter", () => ({
  getStorageAdapter: () => storageMock,
}));

vi.mock("../../db", () => ({
  getDb: vi.fn(() => dbMock),
}));

describe("sandbox/files - helpers", () => {
  it("determines MIME types correctly from extensions", () => {
    expect(getMimeType("chart.png")).toBe("image/png");
    expect(getMimeType("data.csv")).toBe("text/csv");
    expect(getMimeType("doc.pdf")).toBe("application/pdf");
    expect(getMimeType("sheet.xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(getMimeType("script.py")).toBe("text/x-python");
    expect(getMimeType("unknown.xyz")).toBe("application/octet-stream");
  });

  it("determines file kind correctly", () => {
    expect(getFileKind("image/png")).toBe("image");
    expect(getFileKind("application/pdf")).toBe("document");
    expect(getFileKind("text/csv")).toBe("document");
    expect(getFileKind("video/mp4")).toBe("video");
    expect(getFileKind("audio/mpeg")).toBe("audio");
    expect(getFileKind("application/octet-stream")).toBe("other");
  });

  it("determines file format correctly", () => {
    expect(getFileFormat("report.pdf")).toBe("pdf");
    expect(getFileFormat("doc.docx")).toBe("docx");
    expect(getFileFormat("sheet.xlsx")).toBe("xlsx");
    expect(getFileFormat("slides.pptx")).toBe("pptx");
    expect(getFileFormat("notes.md")).toBe("md");
    expect(getFileFormat("data.csv")).toBe("md");
  });

  it("converts HTML tables to Markdown tables", () => {
    const html = `
      <div>
        <h3>Analysis</h3>
        <table>
          <thead>
            <tr><th>Metric</th><th>Value</th></tr>
          </thead>
          <tbody>
            <tr><td>Accuracy</td><td>0.95</td></tr>
            <tr><td>F1 Score</td><td>0.92</td></tr>
          </tbody>
        </table>
      </div>
    `;

    const md = htmlTableToMarkdown(html);
    expect(md).toContain("| Metric | Value |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| Accuracy | 0.95 |");
    expect(md).toContain("| F1 Score | 0.92 |");
  });

  it("returns unchanged text if no table is present", () => {
    const text = "<p>Just a paragraph</p>";
    expect(htmlTableToMarkdown(text)).toBe(text);
  });
});

describe("sandbox/files - storeFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.put.mockResolvedValue({
      provider: "local",
      key: "users/1/files/output.csv",
      url: "/files/users/1/files/output.csv",
      sizeBytes: 128,
    });
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 42 }]),
      }),
    });
  });

  it("stores file in storage adapter and inserts record into files table", async () => {
    const result = await storeFile({
      userId: 1,
      threadId: "sess-123",
      name: "output.csv",
      buffer: Buffer.from("col1,col2\n1,2"),
      mimeType: "text/csv",
    });

    expect(storageMock.put).toHaveBeenCalledWith(
      expect.stringContaining("users/1/files/"),
      expect.any(Buffer),
      "text/csv",
      expect.objectContaining({ userId: 1, name: "output.csv" })
    );

    expect(dbMock.insert).toHaveBeenCalled();
    expect(result).toEqual({
      id: 42,
      name: "output.csv",
      url: "/files/users/1/files/output.csv",
      fileKey: "users/1/files/output.csv",
      sizeBytes: 128,
      mimeType: "text/csv",
    });
  });

  it("handles database insert failure gracefully without throwing", async () => {
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("DB error")),
      }),
    });

    const result = await storeFile({
      userId: 1,
      name: "output.csv",
      buffer: Buffer.from("data"),
      mimeType: "text/csv",
    });

    expect(result.id).toBeUndefined();
    expect(result.url).toBe("/files/users/1/files/output.csv");
  });
});

describe("sandbox/files - collectOutputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.put.mockResolvedValue({
      provider: "local",
      key: "key",
      url: "/files/url",
      sizeBytes: 50,
    });
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 10 }]),
      }),
    });
  });

  it("collects new files from /home/user/output and emits file events", async () => {
    const sbxFiles = {
      list: vi.fn().mockResolvedValue([
        { name: "plot.png", path: "/home/user/output/plot.png", size: 1024, type: "file" },
        { name: "summary.csv", path: "/home/user/output/summary.csv", size: 512, type: "file" },
      ]),
      read: vi.fn().mockResolvedValue(Buffer.from("file-bytes")),
    };

    const emit = vi.fn();
    const collected = await collectOutputs(sbxFiles, {
      userId: 1,
      sessionId: "session-abc",
      emit,
    });

    expect(collected).toHaveLength(2);
    expect(collected[0].name).toBe("plot.png");
    expect(collected[0].mime).toBe("image/png");
    expect(collected[1].name).toBe("summary.csv");
    expect(collected[1].mime).toBe("text/csv");

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "file",
        name: "plot.png",
      })
    );
  });

  it("skips files that were already present in previous snapshot and unchanged", async () => {
    const sbxFiles = {
      list: vi.fn().mockResolvedValue([
        { name: "old.txt", path: "/home/user/output/old.txt", size: 100, type: "file", modifiedTime: 1000 },
        { name: "new.txt", path: "/home/user/output/new.txt", size: 200, type: "file", modifiedTime: 2000 },
      ]),
      read: vi.fn().mockResolvedValue(Buffer.from("new-bytes")),
    };

    const knownFiles = new Map<string, { size: number; mtime?: number }>();
    knownFiles.set("old.txt", { size: 100, mtime: 1000 });

    const collected = await collectOutputs(sbxFiles, {
      userId: 1,
      knownFiles,
    });

    expect(collected).toHaveLength(1);
    expect(collected[0].name).toBe("new.txt");
  });

  it("skips files exceeding 25MB limit", async () => {
    const sbxFiles = {
      list: vi.fn().mockResolvedValue([
        { name: "huge.bin", path: "/home/user/output/huge.bin", size: MAX_OUTPUT_FILE_SIZE_BYTES + 1, type: "file" },
      ]),
      read: vi.fn(),
    };

    const collected = await collectOutputs(sbxFiles, { userId: 1 });
    expect(collected).toHaveLength(0);
    expect(sbxFiles.read).not.toHaveBeenCalled();
  });

  it("caps collected files at 10 files", async () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      name: `file_${i}.txt`,
      path: `/home/user/output/file_${i}.txt`,
      size: 10,
      type: "file",
    }));

    const sbxFiles = {
      list: vi.fn().mockResolvedValue(entries),
      read: vi.fn().mockResolvedValue(Buffer.from("content")),
    };

    const collected = await collectOutputs(sbxFiles, { userId: 1 });
    expect(collected).toHaveLength(MAX_OUTPUT_FILES);
  });
});

describe("sandbox/files - processRichResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.put.mockResolvedValue({
      provider: "local",
      key: "chart.png",
      url: "/files/chart.png",
      sizeBytes: 256,
    });
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 99 }]),
      }),
    });
  });

  it("stores PNG charts, emits image events, and extracts HTML tables as Markdown", async () => {
    const fakeBase64Png = Buffer.from("fake-png-data").toString("base64");
    const results = [
      {
        png: fakeBase64Png,
        isMainResult: true,
      },
      {
        html: "<table><tr><th>X</th><th>Y</th></tr><tr><td>1</td><td>2</td></tr></table>",
        isMainResult: false,
      },
    ] as any;

    const emit = vi.fn();
    const processed = await processRichResults(results, {
      userId: 1,
      sessionId: "sess-1",
      emit,
    });

    expect(processed.images).toHaveLength(1);
    expect(processed.images[0].url).toBe("/files/chart.png");
    expect(processed.images[0].mime).toBe("image/png");

    expect(processed.files).toHaveLength(1);
    expect(processed.files[0].mime).toBe("image/png");

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image",
        url: "/files/chart.png",
      })
    );

    expect(processed.markdownOutputs).toHaveLength(1);
    expect(processed.markdownOutputs[0]).toContain("| X | Y |");
  });
});

describe("sandbox/files - uploadSessionFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads session files to /home/user/data/ via custom retriever", async () => {
    const customRetriever = vi.fn().mockResolvedValue([
      { filename: "input.csv", storage_key: "users/1/uploads/input.csv" },
      { filename: "test.json", storage_key: "users/1/uploads/test.json" },
    ]);

    storageMock.get.mockImplementation(async (key: string) => Buffer.from(`data-for-${key}`));

    const sbxFiles = {
      list: vi.fn(),
      read: vi.fn(),
      write: vi.fn().mockResolvedValue(undefined),
    };

    const count = await uploadSessionFiles(sbxFiles, 1, "session-123", customRetriever);

    expect(count).toBe(2);
    expect(sbxFiles.write).toHaveBeenCalledWith("/home/user/data/input.csv", expect.anything());
    expect(sbxFiles.write).toHaveBeenCalledWith("/home/user/data/test.json", expect.anything());
  });

  it("returns 0 when no session files are found", async () => {
    const customRetriever = vi.fn().mockResolvedValue([]);
    const sbxFiles = {
      list: vi.fn(),
      read: vi.fn(),
      write: vi.fn(),
    };

    const count = await uploadSessionFiles(sbxFiles, 1, "session-empty", customRetriever);
    expect(count).toBe(0);
    expect(sbxFiles.write).not.toHaveBeenCalled();
  });
});
