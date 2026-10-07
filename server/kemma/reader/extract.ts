/**
 * HTML extraction: Readability (on a linkedom document) to find the article, then Turndown to
 * markdown. Also pulls the title, `article:published_time` and the canonical URL, and flags
 * pages that look like an empty JS-app shell (near-empty body text next to a root/app mount
 * point or a Next.js data island) so the caller can escalate to tier 2.
 */

import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

const JS_SHELL_EMPTY_BODY_CHARS = 200;

export interface ExtractedHtml {
  title: string;
  markdown: string;
  textLength: number;
  publishedAt?: string;
  canonicalUrl?: string;
  looksLikeJsShell: boolean;
}

let turndownService: TurndownService | null = null;
function getTurndown(): TurndownService {
  if (!turndownService) turndownService = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  return turndownService;
}

export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";
  try {
    return getTurndown().turndown(html).trim();
  } catch {
    return "";
  }
}

const EMPTY_RESULT: ExtractedHtml = { title: "", markdown: "", textLength: 0, looksLikeJsShell: false };

/** Extracts readable content and metadata from an HTML document. Never throws. */
export function extractHtml(html: string, baseUrl: string): ExtractedHtml {
  if (!html || !html.trim()) return EMPTY_RESULT;
  try {
    return extractHtmlUnsafe(html, baseUrl);
  } catch {
    return EMPTY_RESULT;
  }
}

function extractHtmlUnsafe(html: string, baseUrl: string): ExtractedHtml {
  const document = parseHTML(html).document as unknown as Document;

  // Capture metadata and the JS-shell heuristic before Readability runs: it mutates the
  // document it is given as it searches for the article.
  const metaPublished =
    document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ??
    document.querySelector('meta[name="article:published_time"]')?.getAttribute("content") ??
    document.querySelector("time[datetime]")?.getAttribute("datetime") ??
    undefined;

  const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? undefined;
  let canonicalUrl: string | undefined;
  if (canonicalHref) {
    try {
      canonicalUrl = new URL(canonicalHref, baseUrl).toString();
    } catch {
      canonicalUrl = undefined;
    }
  }

  const bodyText = (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
  const hasShellMarker = !!document.querySelector("#root, #app") || html.includes("__NEXT_DATA__");
  const looksLikeJsShell = hasShellMarker && bodyText.length < JS_SHELL_EMPTY_BODY_CHARS;
  const docTitle = (document.title ?? "").trim();
  const fallbackBodyHtml = document.body?.innerHTML ?? "";

  let article: { title?: string | null; content?: string | null; textContent?: string | null } | null = null;
  try {
    article = new Readability(document as any).parse();
  } catch {
    article = null;
  }

  const contentHtml = article?.content || fallbackBodyHtml;
  const markdown = htmlToMarkdown(contentHtml);
  const textLength = (article?.textContent ?? bodyText).length;

  return {
    title: (article?.title || docTitle || "").trim(),
    markdown,
    textLength,
    publishedAt: metaPublished || undefined,
    canonicalUrl,
    looksLikeJsShell,
  };
}
