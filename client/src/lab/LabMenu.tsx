import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";

import { LogoMenuSheet, type MenuChat, type MenuPill, type MenuRun } from "@/components/chrome/LogoMenuSheet";
import { SutaeruGlyph } from "@/components/SutaeruGlyph";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { prefersReducedMotion } from "@/lib/transitions";

import {
  MENU_CHATS,
  MENU_PERSON_ADMIN,
  MENU_PERSON_MEMBER,
  MENU_PILLS,
  MENU_PILLS_MEMBER,
  MENU_RUNS,
  MENU_TILES,
} from "./fixtures/menu";
import { LabLayout, useLabSettings } from "./LabLayout";

/* The logo menu in every state: sheet on phones, popover from 760 px, busy or quiet,
   admin or member, light or dark (?theme=). Open it with ?open=1 for screenshots. */

const POP_WIDTH = 420;

type MenuSet = "busy" | "quiet" | "empty";

export default function LabMenu() {
  const { search } = useLabSettings();
  const params = new URLSearchParams(search);
  const set = (params.get("set") as MenuSet) || "busy";
  const member = params.get("role") === "member";

  const [open, setOpen] = useState(params.get("open") === "1");
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const isWide = useMediaQuery("(min-width: 760px)");

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setClosing(false);
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    if (prefersReducedMotion()) return;
    setClosing(true);
    const t = window.setTimeout(() => setClosing(false), 240);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !isWide) {
      setAnchor(null);
      return;
    }
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const left = Math.max(12, Math.min(rect ? rect.left : 16, window.innerWidth - POP_WIDTH - 12));
      const maxH = Math.min(760, window.innerHeight - 24);
      const top = Math.max(12, Math.min((rect ? rect.bottom : 56) + 10, window.innerHeight - maxH - 12));
      setAnchor({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, isWide]);

  const href = (updates: Record<string, string | null>) => {
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    return `/__lab/menu${q ? `?${q}` : ""}`;
  };

  const runs: MenuRun[] = set === "busy" ? MENU_RUNS : [];
  const chats: MenuChat[] = set === "empty" ? [] : MENU_CHATS;
  const pills: MenuPill[] = member ? MENU_PILLS_MEMBER : MENU_PILLS;
  const person = member ? MENU_PERSON_MEMBER : MENU_PERSON_ADMIN;
  const shown = open || closing;

  const ctl: React.CSSProperties = {
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid var(--stroke, rgba(36,35,32,0.12))",
    textDecoration: "none",
    color: "inherit",
    background: "var(--card, #fff)",
  };
  const on: React.CSSProperties = { ...ctl, background: "var(--ink, #242320)", color: "var(--paper, #F7F6F2)" };

  return (
    <LabLayout title="Logo menu" bleed>
      {/* A quiet stand-in for the app chrome so the popover has a real anchor. */}
      <div style={{ position: "relative", minHeight: "80vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 10px 10px" }}>
          <button
            ref={triggerRef}
            type="button"
            className="logo-btn skx-nav-header-btn"
            onClick={() => setOpen((o) => !o)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <SutaeruGlyph className="glyph skx-logo" detail="compact" />
            <svg className="chev" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M3 4.5L6 7.5L9 4.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only sr">Open menu</span>
          </button>
          <span className="mono">Chat</span>
          <span className="lm-avatar" aria-hidden="true">
            {person.initial}
          </span>
        </div>

        <div style={{ padding: "28px 20px 0", maxWidth: 560 }}>
          <h2 className="title" style={{ fontSize: 34 }}>
            Good evening, {person.name.split(" ")[0]}
          </h2>
          <p className="lede" style={{ marginTop: 10 }}>
            The stand-in page behind the menu. Open it from the logo, top left.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 28, alignItems: "center" }}>
            <button type="button" className="btn ink" onClick={() => setOpen(true)}>
              Open the menu
            </button>
            {(["busy", "quiet", "empty"] as MenuSet[]).map((s) => (
              <Link key={s} href={href({ set: s })} style={set === s ? on : ctl}>
                {s}
              </Link>
            ))}
            <Link href={href({ role: member ? null : "member" })} style={!member ? on : ctl}>
              admin
            </Link>
            <Link href={href({ open: "1" })} style={ctl}>
              open on load
            </Link>
          </div>
          <p className="mono" style={{ marginTop: 18 }}>
            {isWide ? "popover (760 px and up)" : "sheet (phone)"} · fold state: {set} · role: {member ? "member" : "admin"}
          </p>
        </div>
      </div>

      {shown &&
        createPortal(
          <LogoMenuSheet
            open={open}
            closing={closing}
            mode={isWide ? "popover" : "sheet"}
            anchor={anchor}
            tiles={MENU_TILES}
            runs={runs}
            chats={chats}
            pills={pills}
            person={person}
            onNavigate={() => setOpen(false)}
            onNewChat={() => setOpen(false)}
            onPastChats={() => setOpen(false)}
            onClose={() => setOpen(false)}
          />,
          document.body
        )}
    </LabLayout>
  );
}
