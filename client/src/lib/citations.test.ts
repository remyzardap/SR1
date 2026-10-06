import { describe, expect, it } from "vitest";

import type { ActivityItem } from "@/components/ActivityFeed";
import {
  applyHistoryMetadata,
  citationAnchorId,
  citationChipProps,
  citationNumberFor,
  createCitationPlugin,
  hostOf,
  numberedSources,
  parseCitationList,
  sourceForNumber,
  type HastElement,
  type HastNode,
  type HastRoot,
  type HastText,
} from "./citations";
import type { Source } from "./streamReducer";

/** Sources as P1-07 sends them: only the cited subset, with ids that skip numbers. */
const SOURCES: Source[] = [
  { id: 2, title: "RDAP registry", url: "https://rdap.org/foo", snippet: "registry response" },
  { id: 5, title: "IANA bootstrap", url: "https://data.iana.org/zones", snippet: "delegation file" },
  { id: 9, title: "No snippet", url: "https://example.com/nine" },
];

function text(value: string): HastText {
  return { type: "text", value };
}

function element(tagName: string, children: HastNode[], properties: Record<string, unknown> = {}): HastElement {
  return { type: "element", tagName, properties, children };
}

function answer(...children: HastNode[]): HastRoot {
  return { type: "root", children: [element("p", children)] };
}

function body(root: HastRoot): HastNode[] {
  return (root.children[0] as HastElement).children;
}

function cite(root: HastRoot, index: number): HastElement {
  const node = body(root)[index];
  expect(node.type).toBe("element");
  return node as HastElement;
}

function chips(root: HastRoot): HastElement[] {
  return body(root).filter(
    (node): node is HastElement => node.type === "element" && node.tagName === "citationchip"
  );
}

function remainingText(root: HastRoot): string {
  return body(root)
    .map((node) => (node.type === "text" ? node.value : ""))
    .join("");
}

function render(root: HastRoot, sources: Source[], messageId = "m1"): HastRoot {
  createCitationPlugin({ sources, messageId })(root);
  return root;
}

describe("citation numbering", () => {
  it("numbers a source by its stable id, falling back to position only when there is none", () => {
    expect(citationNumberFor({ id: 7, title: "x", url: "https://x.test" }, 0)).toBe(7);
    expect(citationNumberFor({ title: "x", url: "https://x.test" }, 2)).toBe(3);
  });

  it("orders the source cards by that number, not by arrival order", () => {
    const out = numberedSources(SOURCES.map((s) => ({ ...s })).reverse());
    expect(out.map((entry) => entry.number)).toEqual([2, 5, 9]);
    expect(out[0].source.title).toBe("RDAP registry");
  });

  it("maps a number back to its source and finds nothing for an unknown number", () => {
    expect(sourceForNumber(SOURCES, 5)?.url).toBe("https://data.iana.org/zones");
    expect(sourceForNumber(SOURCES, 1)).toBeUndefined();
    expect(sourceForNumber(SOURCES, 4)).toBeUndefined();
  });

  it("scopes the anchor to the message so two answers cannot collide", () => {
    expect(citationAnchorId("m1", 2)).toBe("src-m1-2");
    expect(citationAnchorId("m2", 2)).toBe("src-m2-2");
  });

  it("parses the marker grammar the server uses", () => {
    expect(parseCitationList("3")).toEqual([3]);
    expect(parseCitationList("2, 5")).toEqual([2, 5]);
    expect(parseCitationList("2;5")).toEqual([2, 5]);
    expect(parseCitationList(" 10 , 11 ")).toEqual([10, 11]);
    expect(parseCitationList("2, x")).toBeNull();
    expect(parseCitationList("")).toBeNull();
    expect(parseCitationList("1234")).toBeNull();
    expect(parseCitationList("1.5")).toBeNull();
  });

  it("gives a chip the host and snippet the tooltip needs", () => {
    expect(hostOf("https://www.rfc-editor.org/rfc/rfc9199")).toBe("rfc-editor.org");
    expect(hostOf("not a url")).toBe("");

    const props = citationChipProps(5, SOURCES[1], "m1");
    expect(props).toEqual({
      number: 5,
      anchor: "src-m1-5",
      href: "#src-m1-5",
      title: "IANA bootstrap",
      host: "data.iana.org",
      snippet: "delegation file",
    });
    expect(citationChipProps(9, SOURCES[2], "m1")).not.toHaveProperty("snippet");
  });
});

describe("createCitationPlugin", () => {
  it("turns [3] into a chip linking to card 3", () => {
    const root = render(answer(text("as shown [2] here")), SOURCES);
    expect(chips(root)).toHaveLength(1);
    const chip = cite(root, 1);
    expect(chip.properties).toMatchObject({
      number: 2,
      anchor: "src-m1-2",
      href: "#src-m1-2",
      title: "RDAP registry",
      host: "rdap.org",
    });
    expect(chip.children).toEqual([text("2")]);
  });

  it("turns adjacent [2][5] into two chips and keeps the sentence text", () => {
    const root = render(answer(text("per [2][5] today")), SOURCES);
    expect(chips(root)).toHaveLength(2);
    expect(cite(root, 1).properties).toMatchObject({ number: 2 });
    expect(cite(root, 2).properties).toMatchObject({ number: 5 });
    expect(remainingText(root)).toBe("per  today");
  });

  it("turns a single [2, 5] marker into two chips", () => {
    const root = render(answer(text("see [2, 5].")), SOURCES);
    expect(chips(root).map((chip) => chip.properties?.number)).toEqual([2, 5]);
    expect(remainingText(root)).toBe("see .");
  });

  it("leaves an unmatched number plain, exactly as written", () => {
    const root = render(answer(text("see [7] and [9].")), SOURCES);
    expect(chips(root)).toHaveLength(1);
    expect(remainingText(root)).toBe("see [7] and .");
  });

  it("leaves a list plain when any number in it is unknown", () => {
    const root = render(answer(text("see [2, 7].")), SOURCES);
    expect(chips(root)).toHaveLength(0);
    expect(remainingText(root)).toBe("see [2, 7].");
  });

  it("does not touch markers in inline code or code blocks", () => {
    const root = render(
      answer(
        text("run "),
        element("code", [text("grep '[2]' log")]),
        text(" then "),
        element("pre", [element("code", [text("echo [5]")])])
      ),
      SOURCES
    );
    expect(chips(root)).toHaveLength(0);
    expect(body(root)).toHaveLength(4);
    expect(remainingText(root)).toBe("run  then ");
    const inline = cite(root, 1);
    expect(inline.children).toEqual([text("grep '[2]' log")]);
  });

  it("does not touch a marker that is a markdown link label", () => {
    const root = render(
      answer(text("see "), element("a", [text("[2]")], { href: "https://example.com" }), text(" here")),
      SOURCES
    );
    expect(chips(root)).toHaveLength(0);
    expect((body(root)[1] as HastElement).children).toEqual([text("[2]")]);
  });

  it("does not touch a marker followed by a parenthesis", () => {
    const root = render(answer(text("compare [2](see above).")), SOURCES);
    expect(chips(root)).toHaveLength(0);
    expect(remainingText(root)).toBe("compare [2](see above).");
  });

  it("is a no-op while streaming has not delivered sources, so nothing reflows", () => {
    const root = answer(text("working [2] on it"));
    render(root, []);
    expect(chips(root)).toHaveLength(0);
    expect(body(root)).toEqual([text("working [2] on it")]);
  });

  it("rewrites several markers in one paragraph, in order", () => {
    const root = render(answer(text("[2] then [9] then [5]")), SOURCES);
    expect(chips(root).map((chip) => chip.properties?.number)).toEqual([2, 9, 5]);
    expect(remainingText(root)).toBe(" then  then ");
  });

  it("descends into nested elements but not into the ones it should skip", () => {
    const root = render(
      answer(element("strong", [text("bold [5]")]), element("blockquote", [element("p", [text("[2]")])])),
      SOURCES
    );
    expect(chips(root)).toHaveLength(0);
    const strong = body(root)[0] as HastElement;
    expect(strong.children.map((n) => n.type)).toEqual(["text", "element"]);
    const quote = body(root)[1] as HastElement;
    const inner = (quote.children[0] as HastElement).children;
    expect(inner[0]).toMatchObject({ tagName: "citationchip" });
  });
});

describe("applyHistoryMetadata", () => {
  it("restores sources with their ids and activity on a reloaded message", () => {
    const message = { id: "m1", role: "assistant" as const, content: "as shown [2]" };
    const out = applyHistoryMetadata(message, {
      sources: [
        { id: 2, title: "RDAP registry", url: "https://rdap.org/foo", snippet: "registry response" },
        { id: 5, title: "IANA bootstrap", url: "https://data.iana.org/zones" },
      ],
      activity: [
        { tool: "web_search", label: "Searched the web", status: "done", ms: 412 },
        { tool: "browse", label: "Read rdap.org", status: "error", ms: 90 },
      ],
    });

    expect(out.sources).toEqual([
      { id: 2, title: "RDAP registry", url: "https://rdap.org/foo", snippet: "registry response" },
      { id: 5, title: "IANA bootstrap", url: "https://data.iana.org/zones" },
    ]);
    expect(out.activity?.map((item) => item.kind)).toEqual(["search", "read"]);
    expect(out.activity?.map((item) => item.status)).toEqual(["done", "error"]);
    expect(out.activity?.map((item) => item.durationMs)).toEqual([412, 90]);
    expect(out.activity?.map((item) => item.label)).toEqual(["Searched the web", "Read rdap.org"]);
    expect(out.content).toBe("as shown [2]");
  });

  it("returns the same message when history carries no P1-07 metadata", () => {
    const message = { id: "m1", role: "assistant" as const, content: "older row" };
    expect(applyHistoryMetadata(message, undefined)).toBe(message);
    expect(applyHistoryMetadata(message, {})).toBe(message);
    expect(applyHistoryMetadata(message, { sources: "garbage", activity: 7 })).toBe(message);
  });

  it("keeps a positional number when a saved source has no id", () => {
    const out = applyHistoryMetadata({ id: "m1", role: "assistant" as const, content: "x" }, {
      sources: [{ title: "Legacy", url: "https://legacy.example" }],
    });
    expect(out.sources).toEqual([{ title: "Legacy", url: "https://legacy.example" }]);
    expect(numberedSources(out.sources ?? [])[0].number).toBe(1);
  });

  it("drops malformed saved sources instead of rendering an empty card", () => {
    const out = applyHistoryMetadata({ id: "m1", role: "assistant" as const, content: "x" }, {
      sources: [
        { id: 2, title: "Good", url: "https://good.example" },
        { id: 3, title: "No url" },
        "not an object",
      ],
      activity: [{ nope: true }, { tool: "run_code", label: "Ran python" }],
    });
    expect(out.sources).toEqual([{ id: 2, title: "Good", url: "https://good.example" }]);
    expect(out.activity).toEqual<ActivityItem[]>([
      { id: "history-1", kind: "code", status: "done", label: "Ran python" },
    ]);
  });
});
