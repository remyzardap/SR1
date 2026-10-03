import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";

/** The owner's Sutaeru icon family (heavy rounded stroke, one orange signal dot each). */
const tabIcon = (name: SutaeruIconName) => <SutaeruIcon name={name} signal className="skx-tab-icon" width={28} height={28} aria-hidden="true" />;

export interface TabBarItem {
  label: string;
  path: string;
  icon: ReactNode;
  /** True for tabs whose route may also match with a query/mode variant. */
  match?: (location: string) => boolean;
}

const MORE_GROUP = [
  "/more",
  "/settings",
  "/identity",
  "/memories",
  "/skills",
  "/monitors",
  "/connections",
  "/generate",
  "/video",
  "/images",
  "/admin",
  "/onboarding",
];

export function getTabItems(): TabBarItem[] {
  return [
    { label: "Chat", path: "/chat", icon: tabIcon("ask"), match: (l) => l === "/chat" || l.startsWith("/sessions") },
    {
      label: "Documents",
      path: "/documents",
      icon: tabIcon("report"),
      match: (l) => l === "/atelier" || l.startsWith("/documents"),
    },
    { label: "Files", path: "/files", icon: tabIcon("files"), match: (l) => l === "/files" },
    { label: "More", path: "/more", icon: tabIcon("more"), match: (l) => MORE_GROUP.some((p) => l === p || l.startsWith(`${p}/`)) },
  ];
}

export interface TabBarProps {
  className?: string;
}

/**
 * Floating tab bar: ink pill at x16 / y758 on the 390x844 canvas, 358x68, five tabs.
 * The active tab gets a paper pill behind its icon and label; the bar sits above the
 * iOS home area via env(safe-area-inset-bottom).
 */
const COLLAPSE_KEY = "sutaeru.tabbar";
function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSE_KEY) === "collapsed"; } catch { return false; }
}

const Chevron = ({ up }: { up?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: up ? "rotate(180deg)" : undefined }}>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Four tabs so the words fit. The bar can be tucked away: a small handle above it collapses it to one
 * pill (current tab + chevron) and the choice is remembered. The page behind it gets its space back.
 */
export function TabBar({ className }: TabBarProps) {
  const [location, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    document.documentElement.dataset.tabbar = collapsed ? "collapsed" : "open";
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "collapsed" : "open"); } catch { /* storage can be blocked */ }
    return () => { delete document.documentElement.dataset.tabbar; };
  }, [collapsed]);

  const items = getTabItems();
  const current = items.find((tab) => (tab.match ? tab.match(location) : location === tab.path)) ?? items[0];

  if (collapsed) {
    return (
      <button type="button" className={cn("skx-tabpeek", className)} onClick={() => setCollapsed(false)} aria-label="Show menu" title="Show menu">
        {current.icon}
        <Chevron up />
      </button>
    );
  }

  return (
    <nav className={cn("skx-tabbar", className)} aria-label="Primary">
      <button type="button" className="skx-tabhandle" onClick={() => setCollapsed(true)} aria-label="Hide menu" title="Hide menu">
        <Chevron />
      </button>
      <ul className="skx-tablist">
        {items.map((tab) => {
          const isActive = tab === current && (tab.match ? tab.match(location) : location === tab.path);
          return (
            <li key={tab.label}>
              <button
                type="button"
                className="skx-tab"
                data-active={isActive ? "true" : "false"}
                aria-current={isActive ? "page" : undefined}
                onClick={() => navigate(tab.path)}
              >
                <span className="skx-tab-inner">
                  {tab.icon}
                  <span className="skx-tab-label">{tab.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default TabBar;
