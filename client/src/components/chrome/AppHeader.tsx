import * as React from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { SutaeruGlyph } from "@/components/brand/SutaeruGlyph";
import { navigateWithTransition } from "@/lib/transitions";
import { NavLogoMenu } from "./NavLogoMenu";

export interface AppHeaderProps {
  /** Page label / title (used when in title mode). */
  label?: string;
  title?: string;
  /**
   * Mode switch: "chat" | "agent" shows the sliding segmented mode switch.
   * "title" or null forces title mode.
   * When omitted, automatically detects chat/agent routes.
   */
  mode?: "chat" | "agent" | "title" | null;
  /** Callback when mode switch changes */
  onModeChange?: (mode: "chat" | "agent") => void;
  /** Initial shown in the avatar button on the right. */
  userInitial?: string;
  /** Optional status text in top-status. */
  statusText?: string;
  /** Optional click handler for avatar. */
  onAvatarClick?: () => void;
  className?: string;
}

/** Two small crosshairs at the top corners, per the design canvas. */
function Crosshair({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={cn("xhair skx-crosshair", className)}
      style={style}
      viewBox="0 0 14 14"
      aria-hidden="true"
    >
      <path d="M7 0V14M0 7H14" />
    </svg>
  );
}

/** The real Sutaeru symbol: twin lenses, the torii gate and the rising sun. */
export function LogoMark({ className }: { className?: string }) {
  return <SutaeruGlyph className={cn("glyph skx-logo", className)} detail="compact" />;
}

/**
 * Top app shell header (.top):
 * - Left: Logo button (.logo-btn) opening the navigation drawer sheet
 * - Center: Sliding mode switch (Chat | Agent) on chat/agent routes, or title on other routes
 * - Right: Avatar button (.avatar) and optional status
 * - Registration crosshairs (.xhair) with safe-area offsets
 */
export function AppHeader({
  label,
  title,
  mode,
  onModeChange,
  userInitial = "?",
  statusText,
  onAvatarClick,
  className,
}: AppHeaderProps) {
  const [location, navigate] = useLocation();

  const isModeExplicit = mode === "chat" || mode === "agent";
  const isTitleExplicit = mode === "title" || mode === null;

  const isChatRoute = location === "/" || location === "/chat" || location.startsWith("/chat/") || location.startsWith("/sessions/");
  const isAgentRoute = location === "/agent" || location.startsWith("/agent/");

  const isModeView = isModeExplicit || (!isTitleExplicit && !label && !title && (isChatRoute || isAgentRoute));
  const activeMode: "chat" | "agent" = isModeExplicit
    ? (mode as "chat" | "agent")
    : isAgentRoute
      ? "agent"
      : "chat";

  const displayTitle = title ?? label ?? "Sutaeru";
  const initial = userInitial.charAt(0).toUpperCase();

  const handleModeClick = (newMode: "chat" | "agent") => {
    if (onModeChange) {
      onModeChange(newMode);
    } else {
      const target = newMode === "agent" ? "/agent" : "/chat";
      navigateWithTransition(navigate, target);
    }
  };

  const handleAvatarClick = () => {
    if (onAvatarClick) {
      onAvatarClick();
    } else {
      navigateWithTransition(navigate, "/settings");
    }
  };

  return (
    <>
      <Crosshair
        className="skx-crosshair-tl"
        style={{ left: 12, top: "calc(env(safe-area-inset-top, 0px) + var(--top-h, 60px) + 10px)" }}
      />
      <Crosshair
        className="skx-crosshair-tr"
        style={{ right: 12, top: "calc(env(safe-area-inset-top, 0px) + var(--top-h, 60px) + 10px)" }}
      />

      <header className={cn("top skx-header", className)}>
        {/* Left: Nav Logo Menu */}
        <div className="top-left">
          <NavLogoMenu variant="header" />
        </div>

        {/* Center: Mode switch or Title */}
        <div id="topMid" className="top-mid">
          {isModeView ? (
            <div className="seg" role="group" aria-label="Mode" id="modeSeg">
              <span
                className="thumb"
                style={{
                  transform: activeMode === "agent" ? "translateX(100%)" : "translateX(0%)",
                  width: "calc(50% - 3px)",
                }}
              />
              <button
                type="button"
                className={cn("seg-btn", activeMode === "chat" && "is-active")}
                aria-pressed={activeMode === "chat"}
                onClick={() => handleModeClick("chat")}
              >
                Chat
              </button>
              <button
                type="button"
                className={cn("seg-btn", activeMode === "agent" && "is-active")}
                aria-pressed={activeMode === "agent"}
                onClick={() => handleModeClick("agent")}
              >
                Agent
              </button>
            </div>
          ) : (
            <span className="top-title skx-header-label">{displayTitle}</span>
          )}
        </div>

        {/* Right: Status and Avatar */}
        <div className="top-right">
          {statusText ? (
            <span className="top-status" id="topStatus">
              <span className="mono">{statusText}</span>
            </span>
          ) : null}
          <button
            type="button"
            className="avatar skx-avatar"
            id="avatarBtn"
            aria-label="Account and settings"
            onClick={handleAvatarClick}
          >
            {initial}
          </button>
        </div>
      </header>
    </>
  );
}

export default AppHeader;
