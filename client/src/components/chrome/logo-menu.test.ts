import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LogoMenuSheet, type MenuTile } from "./LogoMenuSheet";
import { NAV_DESTINATIONS, type NavDestination } from "./NavLogoMenu";
import { buildChats, buildPills, buildRuns, buildTiles, relTime } from "./menuModel";
import { MENU_CHATS, MENU_PERSON_ADMIN, MENU_PILLS, MENU_RUNS, MENU_TILES } from "@/lab/fixtures/menu";

const at = (path: string) => (d: NavDestination) => (d.match ? d.match(path) : d.path === path);

describe("logo menu model", () => {
  it("tiles cover the six pictured destinations, in order, with their art", () => {
    const tiles = buildTiles(NAV_DESTINATIONS, false, at("/chat"));
    expect(tiles.map((t) => t.href)).toEqual(["/chat", "/generate", "/images", "/documents", "/files", "/video"]);
    expect(tiles[0].art).toBe("/studio/o/nav-chat.webp");
    expect(tiles[0].active).toBe(true);
    expect(tiles[1].active).toBe(false);
  });

  it("keeps every destination once, across tiles and pills", () => {
    const tiles = buildTiles(NAV_DESTINATIONS, true, at("/nope"));
    const pills = buildPills(NAV_DESTINATIONS, true, at("/nope"));
    const hrefs = [...tiles.map((t) => t.href), ...pills.map((p) => p.href)].sort();
    expect(hrefs).toEqual(NAV_DESTINATIONS.map((d) => d.path).sort());
  });

  it("gates Admin behind the admin role", () => {
    expect(buildPills(NAV_DESTINATIONS, false, at("/chat")).map((p) => p.label)).not.toContain("Admin");
    expect(buildPills(NAV_DESTINATIONS, true, at("/chat")).map((p) => p.label)).toContain("Admin");
  });

  it("shows only threads that are working or waiting", () => {
    const runs = buildRuns([
      { id: "a", title: "Working one", status: "running", mode: "full", spent_usd: 0, updated: 0, pending_approvals: [] },
      { id: "b", title: "Waiting one", status: "needs_approval", mode: "full", spent_usd: 0, updated: 0, pending_approvals: [] },
      { id: "c", title: "Done one", status: "done", mode: "full", spent_usd: 0, updated: 0, pending_approvals: [] },
    ]);
    expect(runs.map((r) => r.id)).toEqual(["a", "b"]);
    expect(runs[0].live).toBe(true);
    expect(runs[0].href).toBe("/chat?session=a");
  });

  it("lists the six most recent chats, newest first, with quiet times", () => {
    const now = 10_000_000_000;
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, title: `Chat ${i}`, lastMessageAt: now - i * 1000 }));
    const chats = buildChats(many, now);
    expect(chats).toHaveLength(6);
    expect(chats[0].href).toBe("/chat?session=s0");
    expect(chats[0].when).toBe("now");
    expect(buildChats([{ id: "x", title: "", lastMessageAt: now - 5 * 60_000 }], now)[0].when).toBe("5m");
    expect(buildChats([{ id: "x", title: "", lastMessageAt: now - 3 * 3_600_000 }], now)[0].when).toBe("3h");
  });

  it("relTime falls back to a date for older chats", () => {
    expect(relTime(null)).toBe("");
    expect(relTime(Date.now() - 40 * 86_400_000)).toMatch(/\d/);
  });
});

describe("logo menu sheet markup", () => {
  const props = {
    open: true,
    closing: false,
    mode: "sheet" as const,
    anchor: null,
    tiles: MENU_TILES,
    runs: MENU_RUNS,
    chats: MENU_CHATS,
    pills: MENU_PILLS,
    person: MENU_PERSON_ADMIN,
    onNavigate: () => {},
    onNewChat: () => {},
    onPastChats: () => {},
    onClose: () => {},
  };

  it("renders the sheet with every section and both chat actions", () => {
    const html = renderToStaticMarkup(React.createElement(LogoMenuSheet, props));
    /* Folded bodies stay out of the markup (Radix Collapsible), so only the open
       section's rows and every folded header are visible here. */
    for (const want of ["Workspace", "Working for you", "Recent chats", "Yours", "New chat", "Past chats", "2 running", "Rewrite the onboarding email"]) {
      expect(html, want).toContain(want);
    }
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("/studio/o/nav-chat.webp");
  });

  it("renders nothing while closed", () => {
    const html = renderToStaticMarkup(React.createElement(LogoMenuSheet, { ...props, open: false }));
    expect(html).toBe("");
  });

  it("says all quiet and invites a first chat when there is nothing to show", () => {
    const html = renderToStaticMarkup(React.createElement(LogoMenuSheet, { ...props, runs: [], chats: [] }));
    expect(html).toContain("All quiet");
    expect(html).toContain("No chats yet");
  });

  it("keeps the popover mode class off the sheet", () => {
    const tiles: MenuTile[] = MENU_TILES.map((t) => ({ ...t, active: false }));
    const sheet = renderToStaticMarkup(React.createElement(LogoMenuSheet, { ...props, tiles }));
    const pop = renderToStaticMarkup(React.createElement(LogoMenuSheet, { ...props, mode: "popover", anchor: { top: 60, left: 16 }, tiles }));
    expect(sheet).toContain("lm-sheet");
    expect(pop).toContain("lm-pop");
    expect(pop).toContain("top:60px");
  });
});
