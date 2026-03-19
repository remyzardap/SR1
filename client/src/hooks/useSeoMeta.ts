import { useEffect } from "react";

const SITE_NAME = "Sutaeru";
const DEFAULT_TITLE = "Sutaeru — Your Personal Agent Soul-Cloud";
const DEFAULT_DESCRIPTION =
  "Sutaeru is your persistent AI identity and memory in the cloud, where you collect skills from any model and keep them for life.";
const DEFAULT_IMAGE = "https://sutaeru.com/og-image.png";
const BASE_URL = "https://sutaeru.com";

export interface SeoMetaOptions {
  title?: string;
  description?: string;
  image?: string;
  /** Canonical path, e.g. "/u/alice". Defaults to window.location.pathname */
  path?: string;
  /** og:type. Defaults to "website" */
  type?: string;
  /** Twitter card type. Defaults to "summary_large_image" */
  twitterCard?: "summary" | "summary_large_image";
  /** Whether to append " — Sutaeru" to the title. Defaults to true */
  appendSiteName?: boolean;
}

function setMeta(selector: string, attr: string, value: string) {
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    const [attrName, attrValue] = selector
      .replace(/\[|\]/g, "")
      .split("=")
      .map((s) => s.replace(/"/g, ""));
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Dynamically sets <title>, Open Graph, and Twitter Card meta tags.
 * Call this at the top of any page component.
 *
 * @example
 * useSeoMeta({ title: "Alice's Profile", description: "AI agent ...", image: avatarUrl });
 */
export function useSeoMeta(options: SeoMetaOptions = {}) {
  const {
    title: rawTitle,
    description = DEFAULT_DESCRIPTION,
    image = DEFAULT_IMAGE,
    path,
    type = "website",
    twitterCard = "summary_large_image",
    appendSiteName = true,
  } = options;

  const title =
    rawTitle
      ? appendSiteName && !rawTitle.includes(SITE_NAME)
        ? `${rawTitle} — ${SITE_NAME}`
        : rawTitle
      : DEFAULT_TITLE;

  const url = BASE_URL + (path ?? (typeof window !== "undefined" ? window.location.pathname : ""));

  useEffect(() => {
    // <title>
    document.title = title;

    // Standard meta
    setMeta('meta[name="description"]', "content", description);

    // Open Graph
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:image"]', "content", image);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:type"]', "content", type);
    setMeta('meta[property="og:site_name"]', "content", SITE_NAME);

    // Twitter Card
    setMeta('meta[name="twitter:card"]', "content", twitterCard);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="twitter:image"]', "content", image);

    // Canonical
    setLink("canonical", url);
  }, [title, description, image, url, type, twitterCard]);
}
