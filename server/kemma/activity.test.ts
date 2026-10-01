import { describe, expect, it } from "vitest";
import { describePhase, describeToolEnd, describeToolStart, hostOf } from "./activity";

describe("activity feed", () => {
  it("describes a search start with its query", () => {
    const e = describeToolStart("tool-1", "web_search", { query: "latest   news\ntoday" });
    expect(e).toMatchObject({ id: "tool-1", kind: "search", status: "running", label: "Searching the web", detail: "latest news today" });
  });

  it("describes browse with the host and clips long urls", () => {
    const url = "https://www.example.com/" + "a".repeat(300);
    const e = describeToolStart("t", "browse", { url });
    expect(e.label).toBe("Reading example.com");
    expect(e.detail!.length).toBeLessThanOrEqual(140);
  });

  it("falls back for unknown and drive tools", () => {
    expect(describeToolStart("t", "drive_read", {}).kind).toBe("drive");
    expect(describeToolStart("t", "something_new", {})).toMatchObject({ kind: "tool", label: "Running something_new" });
  });

  it("summarizes a successful search with sources, capped at 8", () => {
    const data = Array.from({ length: 12 }, (_, i) => ({ title: `T${i}`, url: `https://www.site${i}.com/x`, snippet: "s" }));
    const e = describeToolEnd("t", "web_search", { query: "q" }, { success: true, data }, 2900);
    expect(e.status).toBe("done");
    expect(e.label).toBe("Found 12 sources");
    expect(e.sources).toHaveLength(8);
    expect(e.sources![0]).toEqual({ title: "T0", url: "https://www.site0.com/x", host: "site0.com" });
    expect(e.durationMs).toBe(2900);
  });

  it("ignores search items without a url and handles no results", () => {
    const e = describeToolEnd("t", "web_search", { query: "q" }, { success: true, data: [{ title: "x", url: "" }] }, 1);
    expect(e.label).toBe("Search finished");
    expect(e.sources).toBeUndefined();
  });

  it("reports failures from wrapped and bare error results", () => {
    expect(describeToolEnd("t", "web_search", {}, { success: false, error: "boom" }, 5)).toMatchObject({ status: "error", detail: "boom" });
    expect(describeToolEnd("t", "browse", {}, { error: "Tool browse failed: x" }, 5)).toMatchObject({ status: "error", detail: "Tool browse failed: x" });
  });

  it("returns the page as a source for browse", () => {
    const e = describeToolEnd("t", "browse", { url: "https://a.com" }, { success: true, data: { url: "https://a.com/p", title: "Page" } }, 9);
    expect(e.sources).toEqual([{ title: "Page", url: "https://a.com/p", host: "a.com" }]);
  });

  it("builds phase entries and tolerates bad urls", () => {
    expect(describePhase("think-1", "think")).toMatchObject({ kind: "think", status: "running", label: "Thinking" });
    expect(describePhase("write", "write", "done")).toMatchObject({ kind: "write", status: "done" });
    expect(hostOf("not a url")).toBe("");
  });
});
