import { describe, it, expect } from "vitest";
import { extractHtml, htmlToMarkdown } from "./extract";

const NEWS_ARTICLE = `<!doctype html><html><head><title>Town Approves New Park</title>
<meta property="article:published_time" content="2025-03-14T09:00:00Z">
<link rel="canonical" href="https://news.example.com/town-park">
</head><body>
<header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
<article>
<h1>Town Approves New Park</h1>
<p>The town council voted unanimously on Tuesday to approve funding for a new public park along the riverfront, ending two years of debate over how to use the vacant lot.</p>
<p>Construction is expected to begin in the spring and finish by next summer, according to the parks department director, who said the project will include a playground, walking trails and a small amphitheater.</p>
<p>Residents who attended the meeting largely supported the plan, though a few raised concerns about parking availability once the park opens to the public.</p>
</article>
<footer>© 2025 Example News</footer>
</body></html>`;

const DOCS_PAGE = `<!doctype html><html><head><title>API Reference — widgets.create()</title></head><body>
<div class="sidebar"><a href="/docs">Docs</a></div>
<main>
<h1>widgets.create()</h1>
<p>Creates a new widget in the given workspace. Returns the created widget object on success.</p>
<h2>Parameters</h2>
<p>name (string, required): the widget's display name.</p>
<p>workspaceId (string, required): the id of the workspace to create the widget in.</p>
<h2>Example</h2>
<pre><code>widgets.create({ name: "Example", workspaceId: "ws_123" })</code></pre>
<p>This call creates a widget named "Example" in workspace ws_123 and returns its id for later reference by other API calls in the same workspace.</p>
</main>
</body></html>`;

const JS_SHELL = `<!doctype html><html><head><title>App</title>
<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
</head><body><div id="__next"><div id="root"></div></div></body></html>`;

describe("extractHtml", () => {
  it("extracts title, markdown, published date and canonical url from a news article", () => {
    const result = extractHtml(NEWS_ARTICLE, "https://news.example.com/town-park?utm_source=x");
    expect(result.title).toContain("Town");
    expect(result.markdown).toContain("riverfront");
    expect(result.markdown).toContain("amphitheater");
    expect(result.markdown).not.toContain("About"); // nav boilerplate should not survive Readability
    expect(result.publishedAt).toBe("2025-03-14T09:00:00Z");
    expect(result.canonicalUrl).toBe("https://news.example.com/town-park");
    expect(result.looksLikeJsShell).toBe(false);
    expect(result.textLength).toBeGreaterThan(400);
  });

  it("extracts a docs-style page", () => {
    const result = extractHtml(DOCS_PAGE, "https://docs.example.com/widgets/create");
    expect(result.markdown.toLowerCase()).toContain("workspaceid");
    expect(result.markdown).toContain("widgets.create");
  });

  it("flags a near-empty JS-app shell page", () => {
    const result = extractHtml(JS_SHELL, "https://app.example.com/");
    expect(result.looksLikeJsShell).toBe(true);
    expect(result.textLength).toBeLessThan(50);
  });

  it("does not flag a real article as a JS shell even if it happens to have a #root-like id elsewhere", () => {
    const html = NEWS_ARTICLE.replace("<article>", '<article id="root">');
    const result = extractHtml(html, "https://news.example.com/town-park");
    expect(result.looksLikeJsShell).toBe(false);
  });

  it("never throws on malformed input", () => {
    expect(() => extractHtml("<html><body><p>unterminated", "https://x.example.com")).not.toThrow();
    expect(() => extractHtml("", "https://x.example.com")).not.toThrow();
  });
});

describe("htmlToMarkdown", () => {
  it("converts headings, paragraphs and lists", () => {
    const md = htmlToMarkdown("<h2>Title</h2><p>Hello <strong>world</strong>.</p><ul><li>one</li><li>two</li></ul>");
    expect(md).toContain("## Title");
    expect(md).toContain("**world**");
    expect(md).toMatch(/-\s+one/);
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
  });
});
