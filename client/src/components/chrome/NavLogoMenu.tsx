import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";

import { useAuth } from "@/_core/hooks/useAuth";
import { codeCall, type CodeSession } from "@/components/CodeThread";
import { LogoMenuSheet, type MenuChat, type MenuPill, type MenuRun, type MenuTile } from "./LogoMenuSheet";
import { buildChats, buildPills, buildRuns, buildTiles } from "./menuModel";
import { SutaeruGlyph } from "@/components/SutaeruGlyph";
import { DotRamp } from "@/components/art/DotRamp";
import type { SutaeruIconName } from "@/components/SutaeruIcon";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { navigateWithTransition, prefersReducedMotion } from "@/lib/transitions";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export interface NavDestination {
  label: string;
  path: string;
  icon: SutaeruIconName;
  match?: (location: string) => boolean;
  adminOnly?: boolean;
  group: "workspace" | "more" | "account";
}

export const NAV_DESTINATIONS: NavDestination[] = [
  // Primary (the destinations formerly in the tab bar)
  {
    label: "Chat",
    path: "/chat",
    icon: "ask",
    group: "workspace",
    match: (l) => l === "/chat" || l.startsWith("/sessions"),
  },
  {
    label: "Documents",
    path: "/documents",
    icon: "report",
    group: "workspace",
    match: (l) => l === "/atelier" || l.startsWith("/documents"),
  },
  {
    label: "Files",
    path: "/files",
    icon: "files",
    group: "workspace",
    match: (l) => l === "/files" || l.startsWith("/files/"),
  },
  // More items
  {
    label: "Generate",
    path: "/generate",
    icon: "make",
    group: "more",
    match: (l) => l === "/generate",
  },
  {
    label: "Images",
    path: "/images",
    icon: "image",
    group: "more",
    match: (l) => l === "/images" || l.startsWith("/images/"),
  },
  {
    label: "Video",
    path: "/video",
    icon: "video",
    group: "more",
    match: (l) => l === "/video" || l.startsWith("/video/"),
  },
  {
    label: "Memories",
    path: "/memories",
    icon: "memory",
    group: "more",
    match: (l) => l === "/memories" || l.startsWith("/memories/"),
  },
  {
    label: "Skills",
    path: "/skills",
    icon: "models",
    group: "more",
    match: (l) => l === "/skills" || l.startsWith("/skills/"),
  },
  {
    label: "Monitors",
    path: "/monitors",
    icon: "schedule",
    group: "more",
    match: (l) => l === "/monitors" || l.startsWith("/monitors/"),
  },
  {
    label: "Connections",
    path: "/connections",
    icon: "connections",
    group: "more",
    match: (l) => l === "/connections" || l.startsWith("/connections/"),
  },
  {
    label: "Identity",
    path: "/identity",
    icon: "agent",
    group: "more",
    match: (l) => l === "/identity" || l.startsWith("/identity/"),
  },
  // Account & settings
  {
    label: "Settings",
    path: "/settings",
    icon: "settings",
    group: "account",
    match: (l) => l === "/settings" || l.startsWith("/settings/"),
  },
  {
    label: "Admin",
    path: "/admin",
    icon: "admin",
    adminOnly: true,
    group: "account",
    match: (l) => l === "/admin" || l.startsWith("/admin/"),
  },
];

/** History and New chat used to sit in /chat's bottom bar; past chats live only here now. */
const CHAT_ACTIONS: Array<{ label: string; path: string; icon: SutaeruIconName }> = [
  { label: "New chat", path: "/chat?new=1", icon: "plus" },
  { label: "Past chats", path: "/chat?history=1", icon: "bookmark" },
];

const POP_WIDTH = 420;

export interface NavLogoMenuProps {
  /**
   * "header" renders inside AppHeader row;
   * "floating" renders fixed in top-left corner on mobile Chat.
   */
  variant?: "header" | "floating";
  className?: string;
}

export function NavLogoMenu({ variant = "header", className }: NavLogoMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isWide = useMediaQuery("(min-width: 760px)");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  /* The surface stays mounted for the length of its exit animation, then unmounts. */
  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen]);

  /* Anchor the popover to the logo button; keep it on screen. */
  useEffect(() => {
    if (!isOpen || !isWide) {
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
  }, [isOpen, isWide]);

  // Close when location changes
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  const shown = isOpen || closing;

  /* Past chats: the same list the chat sidebar shows, fetched only while the menu is up. */
  const sessions = trpc.chat.listSessions.useQuery(undefined, { enabled: shown, retry: false });
  /* The footer's plan line: the same quota the sidebar footer reads. */
  const quota = trpc.kemma.quota.useQuery(undefined, { enabled: shown && !!user, retry: false, staleTime: 5 * 60_000 });

  /* Working for you: code threads still running on the server (admin-only feature). */
  const [codeSessions, setCodeSessions] = useState<CodeSession[]>([]);
  useEffect(() => {
    if (!shown || !isAdmin) {
      setCodeSessions([]);
      return;
    }
    let cancelled = false;
    const load = () =>
      codeCall<{ sessions: CodeSession[] }>("/")
        .then((r) => {
          if (!cancelled) setCodeSessions(r.sessions);
        })
        .catch(() => undefined);
    void load();
    const t = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [shown, isAdmin]);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      setIsOpen(false);
      navigateWithTransition(navigate, path);
    },
    [navigate]
  );

  const visibleItems = NAV_DESTINATIONS.filter((item) => !item.adminOnly || isAdmin);
  const isCurrent = (item: NavDestination) => (item.match ? item.match(location) : location === item.path);

  const tiles: MenuTile[] = buildTiles(NAV_DESTINATIONS, isAdmin, isCurrent);
  const pills: MenuPill[] = buildPills(NAV_DESTINATIONS, isAdmin, isCurrent);
  const runs: MenuRun[] = buildRuns(codeSessions);
  const chats: MenuChat[] = buildChats(sessions.data ?? []);

  const person = user
    ? {
        name: user.name || user.email || "Signed in",
        initial: (user.name || user.email || "S").trim().charAt(0).toUpperCase(),
        plan: quota.data
          ? `${quota.data.tier} plan · ${quota.data.messages.used}/${quota.data.messages.limit} messages`
          : undefined,
        meter: quota.data ? { used: quota.data.messages.used, of: quota.data.messages.limit } : null,
        meta: quota.data ? undefined : user.role === "admin" ? "Admin" : user.email ?? undefined,
      }
    : null;

  return (
    <>
      {/* Trigger Button */}
      {variant === "floating" ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn("skx-nav-floating-btn", className)}
          aria-label="Open navigation menu"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          title="Open navigation menu"
        >
          <SutaeruGlyph className="skx-nav-floating-glyph" />
          <DotRamp className="skx-nav-floating-ramp" />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn("logo-btn skx-nav-header-btn", className)}
          aria-label="Open menu"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          title="Open navigation menu"
        >
          <SutaeruGlyph className="glyph skx-logo" detail="compact" />
          <svg className="chev" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M3 4.5L6 7.5L9 4.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="sr-only sr">Open menu</span>
        </button>
      )}

      {shown &&
        typeof document !== "undefined" &&
        createPortal(
          <LogoMenuSheet
            open={isOpen}
            closing={closing}
            mode={isWide ? "popover" : "sheet"}
            anchor={anchor}
            tiles={tiles}
            runs={runs}
            chats={chats}
            pills={pills}
            person={person}
            onNavigate={handleSelect}
            onNewChat={() => handleSelect(CHAT_ACTIONS[0].path)}
            onPastChats={() => handleSelect(CHAT_ACTIONS[1].path)}
            onClose={close}
          />,
          document.body
        )}
    </>
  );
}

export default NavLogoMenu;
