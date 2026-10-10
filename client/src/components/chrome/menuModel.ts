import type { CodeSession } from "@/components/CodeThread";
import { pickArt, type PickArtId } from "@/lib/pickArt";

import type { MenuChat, MenuPill, MenuRun, MenuTile } from "./LogoMenuSheet";
import type { NavDestination } from "./NavLogoMenu";

/* Pure builders for the logo menu's sections, so the mapping from destinations,
   sessions and running threads to what the sheet shows is testable on its own. */

/** The workspace tiles, in the order the menu shows them, with their picture. */
export const TILE_ART: Record<string, PickArtId> = {
  "/chat": "nav-chat",
  "/generate": "nav-agent",
  "/images": "nav-images",
  "/documents": "nav-documents",
  "/files": "nav-files",
  "/video": "nav-video",
};
const TILE_ORDER = ["/chat", "/generate", "/images", "/documents", "/files", "/video"];

export function buildTiles(destinations: NavDestination[], isAdmin: boolean, isCurrent: (d: NavDestination) => boolean): MenuTile[] {
  return TILE_ORDER.flatMap((path) => {
    const item = destinations.find((d) => d.path === path && (!d.adminOnly || isAdmin));
    return item ? [{ label: item.label, href: item.path, art: pickArt(TILE_ART[path]), active: isCurrent(item) }] : [];
  });
}

/** Everything that is not a picture tile, as pills: the long tail of the menu. */
export function buildPills(destinations: NavDestination[], isAdmin: boolean, isCurrent: (d: NavDestination) => boolean): MenuPill[] {
  return destinations
    .filter((d) => !TILE_ART[d.path] && (!d.adminOnly || isAdmin))
    .map((d) => ({ label: d.label, href: d.path, active: isCurrent(d) }));
}

/** "Working for you": threads still running on the server, or waiting on a decision. */
export function buildRuns(sessions: CodeSession[]): MenuRun[] {
  return sessions
    .filter((s) => s.status === "running" || s.status === "needs_approval")
    .map((s) => ({
      id: s.id,
      label: s.title || "Code session",
      detail: s.status === "running" ? "Code · working" : "Code · needs you",
      href: `/chat?session=${s.id}`,
      live: s.status === "running",
    }));
}

export interface SessionLike {
  id: string;
  title: string | null;
  lastMessageAt: number | null;
}

/** Past chats live only in the logo menu; the six most recent, newest first. */
export function buildChats(sessions: SessionLike[], now: number = Date.now()): MenuChat[] {
  return sessions.slice(0, 6).map((s) => ({
    id: s.id,
    title: s.title || "Untitled",
    when: relTime(s.lastMessageAt, now),
    href: `/chat?session=${s.id}`,
  }));
}

export function relTime(ts: number | null | undefined, now: number = Date.now()): string {
  if (!ts) return "";
  const diff = now - ts;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(ts).toLocaleDateString();
}
