import { useEffect } from "react";

interface PageMetaOptions {
  title?: string;
  description?: string;
  /** Absolute URL to the OG image */
  image?: string;
  /** Canonical URL for this page */
  url?: string;
  /** OG type — defaults to "website" */
  type?: string;
}

const DEFAULT_TITLE = "Sutaeru — Your Personal Agent Soul-Cloud";
const DEFAULT_DESCRIPTION =
  "Sutaeru is your persistent AI identity and memory in the cloud, where you collect skills from any model and keep them for life.";
const DEFAULT_IMAGE = "https://sutaeru.com/og-image.png";
const DEFAULT_URL = "https://sutaeru.com";

function setMeta(property: string, content: string, attr: "property" | "name" = "property") {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
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
 * Dynamically updates `<head>` meta tags for Open Graph and Twitter Cards.
 * Restores defaults when the component unmounts.
 */
export function usePageMeta({
  title,
  description,
  image,
  url,
  type = "website",
}: PageMetaOptions) {
  useEffect(() => {
    const resolvedTitle = title ?? DEFAULT_TITLE;
    const resolvedDesc = description ?? DEFAULT_DESCRIPTION;
    const resolvedImage = image ?? DEFAULT_IMAGE;
    const resolvedUrl = url ?? DEFAULT_URL;

    // Document title
    document.title = resolvedTitle;

    // Canonical
    setLink("canonical", resolvedUrl);

    // Open Graph
    setMeta("og:type", type);
    setMeta("og:url", resolvedUrl);
    setMeta("og:title", resolvedTitle);
    setMeta("og:description", resolvedDesc);
    setMeta("og:image", resolvedImage);
    setMeta("og:site_name", "Sutaeru");

    // Twitter Card
    setMeta("twitter:card", "summary_large_image", "name");
    setMeta("twitter:title", resolvedTitle, "name");
    setMeta("twitter:description", resolvedDesc, "name");
    setMeta("twitter:image", resolvedImage, "name");

    // Restore defaults on unmount
    return () => {
      document.title = DEFAULT_TITLE;
      setLink("canonical", DEFAULT_URL);
      setMeta("og:type", "website");
      setMeta("og:url", DEFAULT_URL);
      setMeta("og:title", DEFAULT_TITLE);
      setMeta("og:description", DEFAULT_DESCRIPTION);
      setMeta("og:image", DEFAULT_IMAGE);
      setMeta("og:site_name", "Sutaeru");
      setMeta("twitter:card", "summary_large_image", "name");
      setMeta("twitter:title", DEFAULT_TITLE, "name");
      setMeta("twitter:description", DEFAULT_DESCRIPTION, "name");
      setMeta("twitter:image", DEFAULT_IMAGE, "name");
    };
  }, [title, description, image, url, type]);
}
