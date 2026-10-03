import { describe, expect, it } from "vitest";
import { safeFilename, threadToStructuredContent } from "./threadExport";

describe("safeFilename", () => {
  it("strips unsafe characters and appends a short id", () => {
    const result = safeFilename('My/Chat:Title*?"<>|', "abcdef12-3456-7890");
    expect(result).toBe("MyChatTitle-abcdef12");
  });

  it("falls back to 'untitled' for an empty title", () => {
    expect(safeFilename("   ", "abcdef12-3456-7890")).toBe("untitled-abcdef12");
  });

  it("caps very long titles", () => {
    const long = "a".repeat(200);
    const result = safeFilename(long, "abcdef12-3456-7890");
    expect(result.length).toBeLessThanOrEqual(80 + 1 + 8);
  });
});

describe("threadToStructuredContent", () => {
  it("maps session and messages into sections", () => {
    const session = { id: "abcdef12-3456-7890", title: "Test chat" };
    const messages = [
      { role: "user", content: "hi", model: null, createdAt: new Date("2026-01-01T00:00:00Z") },
      { role: "assistant", content: "hello", model: "qwen3.8-max", createdAt: new Date("2026-01-01T00:00:01Z") },
    ];
    const result = threadToStructuredContent(session, messages as any);
    expect(result.title).toBe("Test chat");
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].heading).toContain("You");
    expect(result.sections[0].body).toBe("hi");
    expect(result.sections[1].heading).toContain("Kemma");
    expect(result.sections[1].heading).not.toContain("qwen3.8-max"); // the export never names the model
  });

  it("falls back to 'Untitled chat' when the session has no title", () => {
    const result = threadToStructuredContent({ id: "abcdef12-3456-7890", title: null }, []);
    expect(result.title).toBe("Untitled chat");
    expect(result.sections).toHaveLength(0);
  });
});
