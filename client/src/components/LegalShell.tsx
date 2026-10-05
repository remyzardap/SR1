import type { ReactNode } from "react";
import { Link } from "wouter";
import { LandingMark } from "@/components/LandingMark";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import "@/styles/legal.css";

export type LegalEntry = { label: string; text: string };
export type LegalBlock =
  | { t: "p"; text: string }
  | { t: "list"; items: LegalEntry[] }
  | { t: "ul"; items: string[] };
export type LegalSection = { h: string; blocks: LegalBlock[] };

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*[A-Za-z0-9]/g;

/** Turns every e-mail address in a sentence into a mailto: link. */
function withEmailLinks(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;
  let match: RegExpExecArray | null;
  EMAIL_RE.lastIndex = 0;
  while ((match = EMAIL_RE.exec(rest)) !== null) {
    const addr = match[0];
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    nodes.push(
      <a key={`m${key++}`} href={`mailto:${addr}`}>
        {addr}
      </a>,
    );
    rest = rest.slice(match.index + addr.length);
  }
  nodes.push(rest);
  return nodes;
}

function Block({ block }: { block: LegalBlock }) {
  if (block.t === "p") return <p>{withEmailLinks(block.text)}</p>;
  if (block.t === "ul") {
    return (
      <ul className="sk-legal-list">
        {block.items.map((item, i) => (
          <li key={i}>{withEmailLinks(item)}</li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="sk-legal-list">
      {block.items.map((item, i) => (
        <li key={i}>
          <strong>{item.label}</strong> {withEmailLinks(item.text)}
        </li>
      ))}
    </ul>
  );
}

export default function LegalShell({
  docTitle,
  seoTitle,
  seoDescription,
  path,
  otherDoc,
  sections,
  updated,
  summary,
}: {
  docTitle: string;
  seoTitle: string;
  seoDescription: string;
  path: "/privacy" | "/terms";
  otherDoc: { label: string; href: "/privacy" | "/terms" };
  sections: LegalSection[];
  updated: string;
  summary: string;
}) {
  useSeoMeta({ title: seoTitle, description: seoDescription, path, appendSiteName: false });

  return (
    <div className="sk-legal">
      <span className="sk-plus sk-plus-tl" aria-hidden="true" />
      <span className="sk-plus sk-plus-tr" aria-hidden="true" />

      <nav className="sk-legal-nav" aria-label="Main">
        <Link href="/" className="sk-legal-brand">
          <LandingMark className="sk-legal-glyph" />
          <span>Sutaeru</span>
        </Link>
        <div className="sk-legal-nav-links">
          <Link href="/privacy" aria-current={path === "/privacy" ? "page" : undefined}>Privacy</Link>
          <Link href="/terms" aria-current={path === "/terms" ? "page" : undefined}>Terms</Link>
          <Link href="/login">Sign in</Link>
        </div>
      </nav>

      <article className="sk-legal-card">
        <p className="sk-label sk-legal-kicker">Legal <i>&middot;</i> {docTitle}</p>
        <h1 className="sk-legal-title">{docTitle}</h1>
        <p className="sk-legal-updated">Last updated {updated}</p>
        <p className="sk-legal-summary">{withEmailLinks(summary)}</p>
        <hr className="sk-legal-rule" />

        {sections.map((section) => (
          <section className="sk-legal-section" key={section.h} id={section.h}>
            <h2 className="sk-legal-h2">{section.h}</h2>
            {section.blocks.map((block, i) => (
              <Block block={block} key={i} />
            ))}
          </section>
        ))}

        <div className="sk-legal-foot">
          <p className="sk-label" style={{ padding: 0 }}>Sutaeru <i>&middot;</i> sutaeru.com</p>
          <div className="sk-legal-foot-links">
            <Link href={otherDoc.href}>{otherDoc.label}</Link>
            <Link href="/">Home</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </div>
      </article>

      <p className="sk-auth-foot sk-legal-caption">Search <i>&middot;</i> Research <i>&middot;</i> Do</p>
    </div>
  );
}
