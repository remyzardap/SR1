import type { ReactNode } from "react";
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
    {
      label: "Generate",
      path: "/generate",
      icon: tabIcon("make"),
      match: (l) => l === "/generate",
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
export function TabBar({ className }: TabBarProps) {
  const [location, navigate] = useLocation();
  return (
    <nav className={cn("skx-tabbar", className)} aria-label="Primary">
      <ul className="skx-tablist">
        {getTabItems().map((tab) => {
          const isActive = tab.match ? tab.match(location) : location === tab.path;
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
