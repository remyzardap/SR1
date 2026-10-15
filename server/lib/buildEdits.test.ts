import { describe, expect, it } from "vitest";
import { applyOps, normalizePath, parseBuildReply } from "./buildEdits";

describe("normalizePath", () => {
  it("adds a leading slash and keeps simple paths", () => {
    expect(normalizePath("App.js")).toBe("/App.js");
    expect(normalizePath("/components/Card.jsx")).toBe("/components/Card.jsx");
  });
  it("rejects paths that climb out or look odd", () => {
    expect(normalizePath("../etc/passwd")).toBeNull();
    expect(normalizePath("/a/./b.js")).toBeNull();
    expect(normalizePath("/has space.js")).toBeNull();
    expect(normalizePath("")).toBeNull();
    expect(normalizePath("/dir/")).toBeNull();
  });
});

describe("parseBuildReply", () => {
  it("reads reply, files, edits and deletes", () => {
    const raw = `<reply>Added a button.</reply>
<file path="/Button.js">
export default function Button() { return <button>Hi</button>; }
</file>
<edit path="/App.js"><find>
<h1>Hello</h1>
</find><replace>
<h1>Hello</h1>
<Button />
</replace></edit>
<delete path="/old.js" />`;
    const out = parseBuildReply(raw);
    expect(out.reply).toBe("Added a button.");
    expect(out.ops).toEqual([
      { type: "write", path: "/Button.js", content: "export default function Button() { return <button>Hi</button>; }" },
      { type: "replace", path: "/App.js", find: "<h1>Hello</h1>", replace: "<h1>Hello</h1>\n<Button />" },
      { type: "delete", path: "/old.js" },
    ]);
  });

  it("strips a markdown fence around a whole file and ignores think blocks", () => {
    const out = parseBuildReply('<think>plan</think><reply>ok</reply><file path="/a.js">\n```js\nconst a = 1;\n```\n</file>');
    expect(out.ops).toEqual([{ type: "write", path: "/a.js", content: "const a = 1;" }]);
  });

  it("falls back to prose when there is no reply tag", () => {
    expect(parseBuildReply("Just a question answered.").reply).toBe("Just a question answered.");
  });

  it("drops ops with unsafe paths", () => {
    expect(parseBuildReply('<file path="../x.js">x</file>').ops).toEqual([]);
  });
});

describe("applyOps", () => {
  const files = { "/App.js": "function App() {\n  return <h1>Hello</h1>;\n}\n", "/old.js": "x" };

  it("applies exact find and replace", () => {
    const r = applyOps(files, [{ type: "replace", path: "/App.js", find: "<h1>Hello</h1>", replace: "<h1>Hi</h1>" }]);
    expect(r.changed["/App.js"]).toContain("<h1>Hi</h1>");
    expect(r.skipped).toEqual([]);
  });

  it("tolerates indentation slips", () => {
    const r = applyOps(files, [{ type: "replace", path: "/App.js", find: "return    <h1>Hello</h1>;", replace: "return <p/>;" }]);
    expect(r.changed["/App.js"]).toContain("return <p/>;");
  });

  it("skips edits that do not match or are ambiguous", () => {
    const r = applyOps({ "/a.js": "x x" }, [
      { type: "replace", path: "/a.js", find: "y", replace: "z" },
      { type: "replace", path: "/a.js", find: "x", replace: "z" },
      { type: "replace", path: "/missing.js", find: "x", replace: "z" },
    ]);
    expect(r.changed).toEqual({});
    expect(r.skipped).toHaveLength(3);
  });

  it("writes, then edits the written file, and deletes", () => {
    const r = applyOps(files, [
      { type: "write", path: "/New.js", content: "a b" },
      { type: "replace", path: "/New.js", find: "b", replace: "c" },
      { type: "delete", path: "/old.js" },
    ]);
    expect(r.changed).toEqual({ "/New.js": "a c", "/old.js": null });
  });
});
