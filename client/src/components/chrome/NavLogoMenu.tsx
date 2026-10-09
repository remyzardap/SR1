import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { SutaeruGlyph } from "@/components/SutaeruGlyph";
import { SutaeruSeal } from "@/components/brand/SutaeruSeal";
import { DotRamp } from "@/components/art/DotRamp";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";
import { navigateWithTransition } from "@/lib/transitions";

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
    group: "account",
    adminOnly: true,
    match: (l) => l === "/admin" || l.startsWith("/admin/"),
  },
];

/** History and New chat used to sit in /chat's bottom bar; past chats live only here now. */
const CHAT_ACTIONS: Array<{ label: string; path: string; icon: SutaeruIconName }> = [
  { label: "New chat", path: "/chat?new=1", icon: "plus" },
  { label: "Past chats", path: "/chat?history=1", icon: "bookmark" },
];

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
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close when location changes
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      // Auto focus close button for accessibility
      setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (path: string) => {
      setIsOpen(false);
      navigateWithTransition(navigate, path);
    },
    [navigate]
  );

  const visibleItems = NAV_DESTINATIONS.filter((item) => !item.adminOnly || isAdmin);

  const workspaceItems = visibleItems.filter((i) => i.group === "workspace");
  const moreItems = visibleItems.filter((i) => i.group === "more");
  const accountItems = visibleItems.filter((i) => i.group === "account");

  const isCurrent = (item: NavDestination) => {
    return item.match ? item.match(location) : location === item.path;
  };

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

      {/* Menu Drawer & Backdrop */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="skx-nav-overlay" role="presentation">
            {/* Backdrop */}
            <div
              className="skx-nav-backdrop"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

          {/* Drawer Sheet */}
          <nav
            className="skx-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            {/* Drawer Header */}
            <div className="skx-nav-drawer-header">
              <div className="skx-nav-drawer-brand">
                <SutaeruGlyph className="skx-nav-drawer-glyph" />
                <span className="skx-nav-drawer-title">Sutaeru</span>
                <SutaeruSeal className="skx-nav-drawer-seal" rough={false} />
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="skx-nav-drawer-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close navigation menu"
                title="Close menu"
              >
                <SutaeruIcon name="close" signal={false} className="skx-nav-drawer-close-icon" />
              </button>
            </div>

            {/* Destination List (vertical rows) */}
            <div className="skx-nav-drawer-body">
              {/* Workspace Section */}
              <div className="skx-nav-group-label">Workspace</div>
              <div className="skx-nav-list" role="list">
                {workspaceItems.map((item) => {
                  const active = isCurrent(item);
                  return (
                    <button
                      key={item.path}
                      type="button"
                      role="listitem"
                      className="skx-nav-row"
                      data-active={active ? "true" : "false"}
                      aria-current={active ? "page" : undefined}
                      onClick={() => handleSelect(item.path)}
                    >
                      <span className="skx-nav-row-icon" aria-hidden="true">
                        <SutaeruIcon name={item.icon} signal width={22} height={22} />
                      </span>
                      <span className="skx-nav-row-label">{item.label}</span>
                      {active && <span className="skx-nav-row-dot" aria-hidden="true" />}
                    </button>
                  );
                })}
                {/* Chat's own actions: the page opens them from the address (Chat.tsx). */}
                {CHAT_ACTIONS.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    role="listitem"
                    className="skx-nav-row"
                    data-active="false"
                    onClick={() => handleSelect(item.path)}
                  >
                    <span className="skx-nav-row-icon" aria-hidden="true">
                      <SutaeruIcon name={item.icon} signal width={22} height={22} />
                    </span>
                    <span className="skx-nav-row-label">{item.label}</span>
                  </button>
                ))}
              </div>

              {/* More / Create Section */}
              <div className="skx-nav-divider" role="separator" />
              <div className="skx-nav-group-label">More</div>
              <div className="skx-nav-list" role="list">
                {moreItems.map((item) => {
                  const active = isCurrent(item);
                  return (
                    <button
                      key={item.path}
                      type="button"
                      role="listitem"
                      className="skx-nav-row"
                      data-active={active ? "true" : "false"}
                      aria-current={active ? "page" : undefined}
                      onClick={() => handleSelect(item.path)}
                    >
                      <span className="skx-nav-row-icon" aria-hidden="true">
                        <SutaeruIcon name={item.icon} signal width={22} height={22} />
                      </span>
                      <span className="skx-nav-row-label">{item.label}</span>
                      {active && <span className="skx-nav-row-dot" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>

              {/* Account & Settings Section */}
              <div className="skx-nav-divider" role="separator" />
              <div className="skx-nav-group-label">Account</div>
              <div className="skx-nav-list" role="list">
                {accountItems.map((item) => {
                  const active = isCurrent(item);
                  return (
                    <button
                      key={item.path}
                      type="button"
                      role="listitem"
                      className="skx-nav-row"
                      data-active={active ? "true" : "false"}
                      aria-current={active ? "page" : undefined}
                      onClick={() => handleSelect(item.path)}
                    >
                      <span className="skx-nav-row-icon" aria-hidden="true">
                        <SutaeruIcon name={item.icon} signal width={22} height={22} />
                      </span>
                      <span className="skx-nav-row-label">{item.label}</span>
                      {active && <span className="skx-nav-row-dot" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>,
        document.body
      )}
    </>
  );
}

export default NavLogoMenu;
