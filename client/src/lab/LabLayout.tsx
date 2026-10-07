import * as React from "react";
import { useEffect, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import "./lab.css";

export function useLabSettings() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const themeParam = params.get("theme") ?? "system";
  const bgParam = params.get("bg") ?? "paper";
  const zoomParam = params.get("zoom");
  const is2x = zoomParam === "2x" || zoomParam === "2";

  useEffect(() => {
    const root = document.documentElement;
    if (themeParam === "dark") {
      root.setAttribute("data-theme", "dark");
      root.setAttribute("data-mode", "dark");
    } else if (themeParam === "light") {
      root.setAttribute("data-theme", "light");
      root.setAttribute("data-mode", "light");
    } else {
      root.removeAttribute("data-theme");
      root.removeAttribute("data-mode");
    }
  }, [themeParam]);

  useEffect(() => {
    document.documentElement.setAttribute("data-lab-bg", bgParam);
  }, [bgParam]);

  return {
    theme: themeParam,
    bg: bgParam,
    is2x,
    search,
  };
}

export function useLabTheme() {
  const { theme } = useLabSettings();
  return theme;
}

export function LabLayout({ title, children }: { title: string; children: ReactNode }) {
  const { theme, bg, is2x, search } = useLabSettings();

  const makeUrl = (updates: Record<string, string | null>) => {
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    return q ? `?${q}` : "";
  };

  const isCardBg = bg === "card";
  const bgStyle = isCardBg ? "var(--r-card, var(--card, #FFFFFF))" : "var(--r-paper, var(--paper, #F7F6F2))";

  return (
    <div
      className={cn("lab-wrap", is2x && "is-zoom-2x")}
      style={{
        minHeight: "100vh",
        padding: "24px",
        background: bgStyle,
        color: "var(--r-ink, var(--ink, #242320))",
        transition: "background 200ms ease",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header
          className="lab-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 28,
            borderBottom: "1px solid var(--stroke, rgba(36, 35, 32, 0.12))",
            paddingBottom: 16,
          }}
        >
          {/* Title group */}
          <div style={{ minWidth: 220, flex: "1 1 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Link
                href="/__lab"
                style={{
                  fontSize: 13,
                  textDecoration: "none",
                  color: "var(--quiet, #6B6964)",
                  fontFamily: "var(--mono, monospace)",
                }}
              >
                ← Lab Index
              </Link>
            </div>
            <h1
              style={{
                font: "800 28px/1.2 var(--disp, 'Inter Tight', sans-serif)",
                margin: "8px 0 0",
                wordBreak: "break-word",
              }}
            >
              {title}
            </h1>
          </div>

          {/* Controls group: theme, background, and 2x zoom inspection link */}
          <div
            className="lab-controls"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            {/* Background art surface selector (?bg=paper|card) */}
            <div
              style={{
                display: "inline-flex",
                background: "var(--panel, rgba(36,35,32,0.05))",
                padding: 3,
                borderRadius: 999,
                border: "1px solid var(--stroke, rgba(36,35,32,0.12))",
              }}
            >
              {(["paper", "card"] as const).map((b) => (
                <Link
                  key={b}
                  href={makeUrl({ bg: b })}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontFamily: "var(--mono, monospace)",
                    background: bg === b ? "var(--ink, #242320)" : "transparent",
                    color: bg === b ? "var(--paper, #F7F6F2)" : "var(--quiet, #6B6964)",
                    textDecoration: "none",
                    transition: "all 140ms ease",
                  }}
                >
                  bg:{b}
                </Link>
              ))}
            </div>

            {/* Theme switcher */}
            <div style={{ display: "inline-flex", gap: 6 }}>
              {(["light", "dark", "system"] as const).map((t) => (
                <Link
                  key={t}
                  href={makeUrl({ theme: t })}
                  className={cn("pill", theme === t && "is-active")}
                  style={{
                    padding: "6px 13px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid var(--stroke, rgba(36,35,32,0.12))",
                    background: theme === t ? "var(--ink, #242320)" : "var(--card, #FFFFFF)",
                    color: theme === t ? "var(--paper, #F7F6F2)" : "var(--ink, #242320)",
                    textDecoration: "none",
                    transition: "all 140ms ease",
                  }}
                >
                  {t}
                </Link>
              ))}
            </div>

            {/* 2x zoom inspection link for inspecting art edges */}
            <Link
              href={makeUrl({ zoom: is2x ? null : "2x" })}
              className={cn("pill", is2x && "is-active")}
              data-testid="link-zoom-2x"
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                border: "1px solid var(--stroke, rgba(36,35,32,0.12))",
                background: is2x ? "var(--ink, #242320)" : "var(--card, #FFFFFF)",
                color: is2x ? "var(--paper, #F7F6F2)" : "var(--ink, #242320)",
                textDecoration: "none",
                fontFamily: "var(--mono, monospace)",
              }}
            >
              {is2x ? "1x Zoom" : "2x Zoom"}
            </Link>
          </div>
        </header>

        <main
          style={{
            transform: is2x ? "scale(2)" : undefined,
            transformOrigin: is2x ? "top left" : undefined,
            width: is2x ? "50%" : "100%",
            transition: "transform 180ms ease",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default LabLayout;
