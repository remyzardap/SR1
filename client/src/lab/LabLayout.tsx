import * as React from "react";
import { useEffect, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { cn } from "@/lib/utils";

export function useLabTheme() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const themeParam = params.get("theme");

  useEffect(() => {
    if (themeParam === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.setAttribute("data-mode", "dark");
    } else if (themeParam === "light") {
      document.documentElement.setAttribute("data-theme", "light");
      document.documentElement.setAttribute("data-mode", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.removeAttribute("data-mode");
    }
  }, [themeParam]);

  return themeParam ?? "system";
}

export function LabLayout({ title, children }: { title: string; children: ReactNode }) {
  const currentTheme = useLabTheme();

  return (
    <div className="lab-wrap" style={{ minHeight: "100vh", padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 28,
          borderBottom: "1px solid var(--stroke)",
          paddingBottom: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              href="/__lab"
              style={{
                fontSize: 13,
                textDecoration: "none",
                color: "var(--quiet)",
                fontFamily: "var(--mono)",
              }}
            >
              ← Lab Index
            </Link>
          </div>
          <h1 style={{ font: "800 28px/1.2 var(--disp)", margin: "8px 0 0" }}>{title}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["light", "dark", "system"] as const).map((t) => (
            <Link
              key={t}
              href={`?theme=${t}`}
              className={cn("pill", currentTheme === t && "is-active")}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid var(--stroke)",
                background: currentTheme === t ? "var(--ink)" : "var(--card)",
                color: currentTheme === t ? "var(--paper)" : "var(--ink)",
                textDecoration: "none",
              }}
            >
              {t}
            </Link>
          ))}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
