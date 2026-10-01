import { afterAll, describe, expect, it } from "vitest";
import http from "node:http";
import { exportThreadMarkdown, safeFilename, threadToStructuredContent } from "./threadExport";

// Header-safety oracle: Node's res.setHeader rejects header values with code
// points above U+00FF (ERR_INVALID_CHAR), so anything the export routes put
// into Content-Disposition has to stay latin1-safe. The oracle mirrors the
// in-loop pattern of the repo's fn/router.test.ts (loopback listen only).
const server = http.createServer((req, res) => {
  const value = decodeURIComponent(new URL(req.url!, "http://127.0.0.1").pathname);
  try {
    res.setHeader("Content-Disposition", `attachment; filename="${value}.md"`);
    res.end("ok");
  } catch {
    res.statusCode = 422;
    res.end("invalid");
  }
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
const baseUrl = await new Promise<string>((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as any).port}`));
});

async function headerValueThrows(value: string): Promise<boolean> {
  const res = await fetch(`${baseUrl}/${encodeURIComponent(value)}`);
  return (await res.text()) === "invalid";
}

describe("safeFilename header safety (audit)", () => {
  it("keeps latin1 accents (legal in header values)", () => {
    expect(safeFilename("Café Möller", "abcdef12-3456")).toBe("Café Möller-abcdef12");
  });

  it("produces a value Node accepts as an HTTP header for a CJK title", async () => {
    const name = safeFilename("日本語のタイトル", "abcdef12-3456");
    expect(await headerValueThrows(name)).toBe(false);
  });

  it("produces a header-safe value for mixed-script titles", async () => {
    for (const title of ["Свидание デート", "报告 v2", "مرحبا"]) {
      const name = safeFilename(title, "12345678-abcd");
      expect(await headerValueThrows(name)).toBe(false);
    }
  });

  it("falls back to untitled when nothing latin1 survives", () => {
    expect(safeFilename("日本語のみ", "abcdef12-3456")).toBe("untitled-abcdef12");
  });
});

describe("threadToStructuredContent edge shapes (audit)", () => {
  it("renders an empty thread without crashing (0 messages)", () => {
    const content = threadToStructuredContent({ id: "abcdef12-3456", title: "Empty" }, []);
    expect(content.sections).toEqual([]);
    expect(content.title).toBe("Empty");
  });

  it("keeps unicode message bodies intact", () => {
    const messages = [
      { role: "user", content: "こんにちは - bonjour", model: null, createdAt: new Date("2026-01-01T00:00:00Z") },
    ];
    const content = threadToStructuredContent({ id: "abcdef12-3456", title: "T" }, messages as any);
    expect(content.sections[0].body).toBe("こんにちは - bonjour");
  });

  it("labels every non-user role as Kemma and tolerates a missing model", () => {
    const messages = [
      { role: "tool", content: "result", model: null, createdAt: new Date("2026-01-01T00:00:00Z") },
    ];
    const content = threadToStructuredContent({ id: "abcdef12-3456", title: "T" }, messages as any);
    expect(content.sections[0].heading).toContain("Kemma");
    expect(content.sections[0].heading).not.toContain("· ·");
  });
});

describe("exportThreadMarkdown (audit)", () => {
  it("exports a large thread (1000 messages) without truncation or crash", async () => {
    const messages = Array.from({ length: 1000 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i} ${"a".repeat(200)}`,
      model: i % 2 === 0 ? null : "qwen3.8-max",
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    }));
    const buffer = await exportThreadMarkdown({ id: "abcdef12-3456", title: "Long chat" }, messages as any);
    const text = buffer.toString("utf-8");
    expect(text).toContain("message 0 ");
    expect(text).toContain("message 999 ");
    expect(text).toContain("# Long chat");
  });

  it("exports a unicode title thread through the full markdown path", async () => {
    const messages = [{ role: "user", content: "テスト", model: null, createdAt: new Date("2026-01-01T00:00:00Z") }];
    const buffer = await exportThreadMarkdown({ id: "abcdef12-3456", title: "日本語チャット" }, messages as any);
    expect(buffer.toString("utf-8")).toContain("日本語チャット");
  });
});
