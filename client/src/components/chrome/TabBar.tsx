import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

export interface TabBarItem {
  label: string;
  path: string;
  icon: ReactNode;
  /** True for tabs whose route may also match with a query/mode variant. */
  match?: (location: string) => boolean;
}

const ICON_PROPS = {
  viewBox: "0 0 256 256",
  fill: "currentColor",
  width: 22,
  height: 22,
  "aria-hidden": true as const,
};

// Phosphor regular icons: chat-circle, pencil-simple, sparkle, folder, dots-three
// (path data from the phosphor-icons/core asset set, inlined to avoid a new dependency).
const iconChatCircle = (
  <svg {...ICON_PROPS}>
    <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
  </svg>
);
const iconPencilSimple = (
  <svg {...ICON_PROPS}>
    <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" />
  </svg>
);
const iconSparkle = (
  <svg {...ICON_PROPS}>
    <path d="M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119a8,8,0,0,0,4.74,4.74L191.85,144ZM144,40a8,8,0,0,1,8-8h16V16a8,8,0,0,1,16,0V32h16a8,8,0,0,1,0,16H184V64a8,8,0,0,1-16,0V48H152A8,8,0,0,1,144,40ZM248,88a8,8,0,0,1-8,8h-8v8a8,8,0,0,1-16,0V96h-8a8,8,0,0,1,0-16h8V72a8,8,0,0,1,16,0v8h8A8,8,0,0,1,248,88Z" />
  </svg>
);
const iconFolder = (
  <svg {...ICON_PROPS}>
    <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40ZM216,200H40V88H216Z" />
  </svg>
);
const iconDotsThree = (
  <svg {...ICON_PROPS}>
    <path d="M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm56-12a12,12,0,1,0,12,12A12,12,0,0,0,196,116ZM60,116a12,12,0,1,0,12,12A12,12,0,0,0,60,116Z" />
  </svg>
);

/** Routes that belong to the More group until a dedicated /more page exists. */
const MORE_GROUP = [
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
    { label: "Chat", path: "/chat", icon: iconChatCircle, match: (l) => l === "/chat" || l.startsWith("/sessions") },
    // TODO(wave 2): point to "/documents" once that route lands; keep "/atelier" until then.
    {
      label: "Documents",
      path: "/atelier",
      icon: iconPencilSimple,
      match: (l) => (l === "/atelier" || l.startsWith("/documents")) && !l.includes("mode=describe"),
    },
    {
      label: "Generate",
      path: "/generate",
      icon: iconSparkle,
      match: (l) => l === "/generate" || (l.startsWith("/atelier") && l.includes("mode=describe")),
    },
    { label: "Files", path: "/files", icon: iconFolder, match: (l) => l === "/files" },
    // TODO(wave 2): point to "/more" once the grouped page exists.
    { label: "More", path: "/settings", icon: iconDotsThree, match: (l) => MORE_GROUP.some((p) => l === p || l.startsWith(`${p}/`)) },
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
