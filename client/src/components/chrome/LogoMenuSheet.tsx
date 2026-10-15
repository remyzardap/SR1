import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SutaeruHeaderMark, SutaeruJapaneseSeal } from "@/components/home/HomeScreen";

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface MenuTile {
  label: string;
  href: string;
  /** Picture from /studio/o/ or /studio/c/ */
  art: string;
  active: boolean;
  idx?: string;
  hint?: string;
  live?: boolean;
}

export interface MenuRun {
  id: string;
  label: string;
  detail: string;
  href: string;
  /** Pulsing dot: the task is working right now. */
  live: boolean;
}

export interface MenuChat {
  id: string;
  title: string;
  when: string;
  href: string;
  art?: string;
}

export interface MenuPill {
  label: string;
  href: string;
  active: boolean;
}

export interface MenuPerson {
  name: string;
  initial: string;
  meta?: string;
  role?: string;
  /** Plan and usage line, e.g. "free plan · 38/50 messages". */
  plan?: string;
  /** Ten-dot usage meter: `used` of `of`. */
  meter?: { used: number; of: number } | null;
}

export interface LogoMenuSheetProps {
  open: boolean;
  /** True while the exit animation plays; the surface stays mounted until it ends. */
  closing: boolean;
  mode: "sheet" | "popover";
  /** Popover origin (the logo button); ignored in sheet mode. */
  anchor?: { top: number; left: number } | null;
  tiles: MenuTile[];
  runs: MenuRun[];
  chats: MenuChat[];
  pills: MenuPill[];
  person: MenuPerson | null;
  onNavigate: (href: string) => void;
  onNewChat: () => void;
  onPastChats: () => void;
  onClose: () => void;
  onSearch?: () => void;
  onOpenSettings?: () => void;
}

const DEFAULT_TILES: MenuTile[] = [
  { label: "Chat", href: "/chat", art: "/studio/o/nav-chat.webp", active: true, idx: "01 / 06", hint: "Quick answers, with search." },
  { label: "Agent", href: "/chat?mode=agent", art: "/studio/o/nav-agent.webp", active: false, idx: "02 / 06", hint: "Hand it the job.", live: true },
  { label: "Studio", href: "/images", art: "/studio/o/nav-images.webp", active: false, idx: "03 / 06", hint: "Describe an image." },
  { label: "Docs", href: "/documents", art: "/studio/o/nav-documents.webp", active: false, idx: "04 / 06", hint: "Start a document." },
  { label: "Video", href: "/video", art: "/studio/o/nav-video.webp", active: false, idx: "05 / 06", hint: "Describe a scene." },
  { label: "Files", href: "/files", art: "/studio/o/nav-files.webp", active: false, idx: "06 / 06", hint: "Find a file." },
];

const RECENT_PHOTOS = [
  "/studio/c/cov-solar.webp",
  "/studio/c/cov-village.webp",
  "/studio/t/light-golden.webp",
  "/studio/c/cov-panels.webp",
  "/studio/c/cov-villa.webp",
  "/studio/c/cov-clay.webp",
];

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
}

/**
 * 76x76 stipple gauge dial with center animated Sutaeru symbol from Menu.dc.html.
 */
function StippleWorkingGauge({ live }: { live: boolean }) {
  const blurId = useId().replace(/:/g, "_");
  const sunId = useId().replace(/:/g, "_");
  const haloId = useId().replace(/:/g, "_");
  const flashId = useId().replace(/:/g, "_");
  const seaId = useId().replace(/:/g, "_");

  return (
    <div className="lm-gauge-wrap">
      {/* 36-dot stipple gauge ring with orange indicator lines */}
      <div style={{ position: "absolute", inset: 0 }}>
        <svg aria-hidden="true" width="76" height="76" viewBox="0 0 76 76" style={{ display: "block" }}>
          <circle cx="38.0" cy="4.0" r="2.8" fill="var(--ink)" />
          <circle cx="43.9" cy="4.5" r="2.1" fill="var(--ink)" />
          <circle cx="49.6" cy="6.1" r="2.1" fill="var(--ink)" />
          <circle cx="55.0" cy="8.6" r="2.1" fill="var(--ink)" />
          <circle cx="59.9" cy="12.0" r="2.1" fill="var(--ink)" />
          <circle cx="64.0" cy="16.1" r="2.8" fill="var(--ink)" />
          <circle cx="67.4" cy="21.0" r="2.1" fill="var(--ink)" />
          <circle cx="69.9" cy="26.4" r="2.1" fill="var(--ink)" />
          <circle cx="71.5" cy="32.1" r="2.1" fill="var(--ink)" />
          <circle cx="72.0" cy="38.0" r="2.1" fill="var(--ink)" />
          <circle cx="71.5" cy="43.9" r="2.8" fill="var(--ink)" />
          <circle cx="69.9" cy="49.6" r="2.1" fill="var(--ink)" />
          <circle cx="67.4" cy="55.0" r="1.3" fill="var(--stroke)" />
          <circle cx="64.0" cy="59.9" r="1.3" fill="var(--stroke)" />
          <circle cx="59.9" cy="64.0" r="1.3" fill="var(--stroke)" />
          <circle cx="55.0" cy="67.4" r="1.8" fill="var(--stroke)" />
          <circle cx="49.6" cy="69.9" r="1.3" fill="var(--stroke)" />
          <circle cx="43.9" cy="71.5" r="1.3" fill="var(--stroke)" />
          <circle cx="38.0" cy="72.0" r="1.3" fill="var(--stroke)" />
          <circle cx="32.1" cy="71.5" r="1.3" fill="var(--stroke)" />
          <circle cx="26.4" cy="69.9" r="1.8" fill="var(--stroke)" />
          <circle cx="21.0" cy="67.4" r="1.3" fill="var(--stroke)" />
          <circle cx="16.1" cy="64.0" r="1.3" fill="var(--stroke)" />
          <circle cx="12.0" cy="59.9" r="1.3" fill="var(--stroke)" />
          <circle cx="8.6" cy="55.0" r="1.3" fill="var(--stroke)" />
          <circle cx="6.1" cy="49.6" r="2.8" fill="var(--ink)" />
          <circle cx="4.5" cy="43.9" r="2.1" fill="var(--ink)" />
          <circle cx="4.0" cy="38.0" r="2.1" fill="var(--ink)" />
          <circle cx="4.5" cy="32.1" r="2.1" fill="var(--ink)" />
          <circle cx="6.1" cy="26.4" r="2.1" fill="var(--ink)" />
          <circle cx="8.6" cy="21.0" r="2.8" fill="var(--ink)" />
          <circle cx="12.0" cy="16.1" r="2.1" fill="var(--ink)" />
          <circle cx="16.1" cy="12.0" r="2.1" fill="var(--ink)" />
          <circle cx="21.0" cy="8.6" r="2.1" fill="var(--ink)" />
          <circle cx="26.4" cy="6.1" r="2.1" fill="var(--ink)" />
          <circle cx="32.1" cy="4.5" r="2.8" fill="var(--ink)" />
          <line x1="60.6" y1="46.2" x2="79.3" y2="53.0" stroke="#F4511E" strokeWidth="5" strokeLinecap="round" />
          <line x1="15.4" y1="46.2" x2="-3.3" y2="53.0" stroke="#F4511E" strokeWidth="5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Center animated Sutaeru mark */}
      <div className="lm-gauge-mark-center">
        <svg
          role="img"
          aria-label="Sutaeru is working"
          width="44"
          height="23"
          viewBox="0 0 144 76"
          fill="none"
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            <filter id={blurId} x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="2.2" />
            </filter>
            <radialGradient id={sunId} cx="38%" cy="32%" r="75%">
              <stop offset="0" stopColor="#FFB089" />
              <stop offset=".55" stopColor="#F4511E" />
              <stop offset="1" stopColor="#C93C0E" />
            </radialGradient>
            <radialGradient id={haloId}>
              <stop offset="0" stopColor="#F4511E" stopOpacity=".8" />
              <stop offset="1" stopColor="#F4511E" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={flashId}>
              <stop offset="0" stopColor="#FFF6EC" />
              <stop offset=".35" stopColor="#FF9A62" stopOpacity=".8" />
              <stop offset="1" stopColor="#F4511E" stopOpacity="0" />
            </radialGradient>
            <clipPath id={seaId}>
              <rect x="84" y="4" width="48" height="56.2" />
            </clipPath>
          </defs>

          <path
            className="mm-a"
            d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z"
            stroke="var(--ink)"
            strokeWidth="7"
            strokeLinejoin="round"
            style={{ animation: "mmBase 4.2s ease-in-out infinite both" }}
          />

          {live && (
            <circle
              cx="72"
              cy="38"
              r="24"
              fill={`url(#${flashId})`}
              className="mm-a"
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: "mmFlash 4.2s cubic-bezier(.2,.7,.3,1) infinite both",
              }}
            />
          )}

          <g transform="translate(108 39) scale(.9) translate(-108 -39)">
            <g clipPath={`url(#${seaId})`}>
              <circle
                cx="108"
                cy="46.4"
                r="15"
                fill={`url(#${haloId})`}
                className="mm-a"
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "108px 46.4px",
                  animation: "mmHalo 4.2s ease-in-out infinite both",
                }}
              />
              <circle
                cx="108"
                cy="46.4"
                r="6.3"
                fill={`url(#${sunId})`}
                className="mm-a"
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "108px 46.4px",
                  animation: "mmSun 4.2s ease-in-out infinite both",
                }}
              />
            </g>
            <g fill="var(--ink)" className="mm-a" style={{ animation: "mmGate 4.2s ease-in-out infinite both" }}>
              <path d="M89.2 21.4L90.5 22.5Q108 27.1 125.5 22.5L126.8 21.4L126.2 25.0Q108 29.9 89.8 25.0Z" />
              <path d="M91.6 26.7Q108 30.7 124.4 26.7L124.2 28.9Q108 32.9 91.8 28.9Z" />
              <path d="M106.7 30.4H109.3V35.2H106.7Z" />
              <path d="M90.6 35.1H125.4V37.7H90.6Z" />
              <path d="M95.8 27.6H99.6L98.6 57.6H94.4ZM116.4 27.6H120.2L121.6 57.6H117.4Z" />
            </g>
            <g strokeLinecap="round">
              <path d="M91.6 60.6H103.2M112.8 60.6H124.4" stroke="var(--ink)" strokeWidth="1.7" />
            </g>
            <g
              stroke="#F4511E"
              strokeLinecap="round"
              className="mm-a"
              style={{
                transformBox: "fill-box",
                transformOrigin: "108px 62px",
                animation: "mmGlint 4.2s ease-in-out infinite both",
              }}
            >
              <path d="M104.8 60.6H111.2" strokeWidth="1.7" />
              <path d="M106.3 63.8H109.7" strokeWidth="1.5" />
            </g>
          </g>

          {/* Stroke glow trails */}
          {live && (
            <g filter={`url(#${blurId})`}>
              <path
                className="mm-c mm-cl"
                d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z"
                pathLength="100"
                stroke="#F4511E"
                strokeWidth="7"
                strokeOpacity="0.6"
                strokeDasharray="2 98"
              />
              <path
                className="mm-c mm-cr"
                d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z"
                pathLength="100"
                stroke="#F4511E"
                strokeWidth="7"
                strokeOpacity="0.6"
                strokeDasharray="2 98"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────── */

export function LogoMenuSheet({
  open,
  closing,
  mode,
  anchor,
  tiles = DEFAULT_TILES,
  runs = [],
  chats = [],
  pills = [],
  person,
  onNavigate,
  onNewChat,
  onPastChats,
  onClose,
  onSearch,
  onOpenSettings,
}: LogoMenuSheetProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [settled, setSettled] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (open) setSettled(false);
  }, [open]);

  /* Focus moves in when the surface appears and Tab cycles inside */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => closeRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !surfaceRef.current) return;
      const items = focusables(surfaceRef.current);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  /* Lock body scrolling while open */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open && !closing) return null;

  const modeTiles = tiles.length > 0 ? tiles : DEFAULT_TILES;
  const activeTileIndex = modeTiles.findIndex((t) => t.active);
  const selectedIndex = activeSlide >= 0 && activeSlide < modeTiles.length ? activeSlide : (activeTileIndex >= 0 ? activeTileIndex : 0);

  const activeRun = runs.length > 0 ? runs[0] : null;

  return (
    <>
      <div
        className="lm-scrim"
        data-closing={closing ? "true" : "false"}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        data-closing={closing ? "true" : "false"}
        className={cn("lm-surface", mode === "sheet" ? "lm-sheet" : "lm-pop", settled && "lm-settled")}
        style={mode === "popover" && anchor ? { top: anchor.top, left: anchor.left } : undefined}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && !closing) setSettled(true);
        }}
      >
        {/* Grab bar for sheet mode */}
        {mode === "sheet" && <div className="lm-grab" aria-hidden="true" />}

        {/* 1. Header with Logo Mark + Wordmark + Japanese Seal Stamp + Close button */}
        <header className="lm-head">
          <button
            type="button"
            className="qtap lm-brand-btn"
            aria-label="Open menu"
            onClick={() => onNavigate("/chat")}
          >
            <SutaeruHeaderMark width={44} height={23} />
            <b>Sutaeru</b>
            <SutaeruJapaneseSeal size={21} />
          </button>
          <span style={{ flex: 1 }} />
          <button
            ref={closeRef}
            type="button"
            className="qtap lm-close-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {/* Scrollable body content */}
        <div className="lm-body">
          {/* 2. Top Actions: New chat + Search buttons */}
          <div className="lm-actions">
            <button
              type="button"
              className="qtap lm-btn-new-chat"
              onClick={onNewChat}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New chat
            </button>
            <button
              type="button"
              className="qtap lm-btn-search"
              aria-label="Search"
              onClick={onSearch ?? onPastChats}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M20 20l-4.2-4.2" />
              </svg>
            </button>
          </div>

          {/* 3. Horizontal Mode Card Carousel */}
          <section aria-label="Workspace">
            <div
              className="qrow lm-carousel"
              onScroll={(e) => {
                const target = e.currentTarget;
                const scrollLeft = target.scrollLeft;
                const cardWidth = 342; // 330 card + 12 gap
                const slide = Math.round(scrollLeft / cardWidth);
                if (slide !== activeSlide && slide >= 0 && slide < modeTiles.length) {
                  setActiveSlide(slide);
                }
              }}
            >
              {modeTiles.map((tile, i) => {
                const idxStr = tile.idx || `0${i + 1} / 0${modeTiles.length}`;
                const isActive = i === selectedIndex || (tile.active && activeSlide === 0);
                return (
                  <div key={tile.href} className="lm-carousel-card-wrap">
                    <div
                      className={cn("qcard lm-mode-card", isActive && "is-active")}
                      aria-current={tile.active ? "page" : undefined}
                      aria-expanded={isActive ? "true" : undefined}
                    >
                      <img
                        src={tile.art || "/studio/o/nav-chat.webp"}
                        alt=""
                        width="330"
                        height="219"
                        loading="eager"
                      />
                      <span className="qmono qidx">{idxStr}</span>
                      {tile.live && (
                        <span
                          style={{
                            position: "absolute",
                            right: 10,
                            top: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "5px 9px 5px 8px",
                            borderRadius: 9,
                            background: "rgba(20,18,16,.55)",
                            WebkitBackdropFilter: "blur(8px)",
                            backdropFilter: "blur(8px)",
                          }}
                        >
                          <i className="qlive" />
                          <span className="qmono" style={{ fontSize: 8.5, color: "#fff" }}>
                            1 running
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="lm-card-meta">
                      <h2 className="lm-card-title-group">
                        <span className="lm-card-title-main">{tile.label}</span>
                        <span className="lm-card-subtitle">{tile.hint || "Quick answers, with search."}</span>
                      </h2>
                      <button
                        type="button"
                        className="qtap lm-card-open-btn"
                        onClick={() => onNavigate(tile.href)}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pager indicators */}
            <div aria-hidden="true" className="lm-pager-dots">
              {modeTiles.map((_, i) => (
                <i
                  key={i}
                  className={cn("lm-pager-dot", i === selectedIndex && "is-active")}
                />
              ))}
            </div>
          </section>

          {/* 4. Stipple Gauge Card ("Working for you") */}
          <section
            aria-label="Working for you"
            className="lm-stipple-card"
            style={activeRun ? { cursor: "pointer" } : undefined}
            onClick={activeRun ? () => onNavigate(activeRun.href) : undefined}
          >
            <div aria-hidden="true" className="qdots lm-stipple-bg" />
            <div className="lm-stipple-row">
              <StippleWorkingGauge live={runs.length > 0} />
              <div className="lm-stipple-info">
                {activeRun ? (
                  <>
                    <span style={{ display: "block" }}>{activeRun.label}</span>
                    <span style={{ display: "block", color: "var(--quiet)", fontSize: 13, marginTop: 4 }}>
                      {activeRun.detail}
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ display: "block" }}>All quiet</span>
                    <span style={{ display: "block", color: "var(--quiet)", fontSize: 13, marginTop: 4 }}>
                      Nothing is running. Tasks you start keep working here.
                    </span>
                  </>
                )}
              </div>
              {runs.length > 0 && (
                <div className="lm-stipple-timer">
                  <span className="qmono" style={{ fontSize: 10, color: "var(--accent, #F4511E)" }}>
                    {runs.length} running
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* 5. Recent Chats Section */}
          <section aria-label="Recent chats" className="lm-recent">
            <div className="lm-recent-header">
              <span className="qmono" style={{ color: "var(--quiet)" }}>
                Recent chats
              </span>
              <button
                type="button"
                className="qmono"
                onClick={onPastChats}
                style={{
                  color: "var(--quiet)",
                  fontSize: 9,
                  border: 0,
                  background: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Past chats
              </button>
            </div>

            {chats.length > 0 ? (
              <div className="qrow lm-recent-row">
                {chats.map((chat, idx) => {
                  const cover = chat.art || RECENT_PHOTOS[idx % RECENT_PHOTOS.length];
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      className="qtap lm-recent-card-btn"
                      onClick={() => onNavigate(chat.href)}
                    >
                      <div className="qcard lm-recent-thumb">
                        <img src={cover} alt="" width="100" height="100" loading="lazy" />
                        <span className="qmono lm-recent-time">{chat.when}</span>
                      </div>
                      <span className="lm-recent-title">{chat.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="lm-empty" style={{ padding: "12px 20px 0" }}>
                No chats yet. Your past chats live here, only here.
              </p>
            )}
          </section>

          {/* 6. "Yours" / Extra Pills Section */}
          {pills.length > 0 && (
            <div aria-label="Yours" className="lm-pills">
              {pills.map((pill) => (
                <button
                  key={pill.href}
                  type="button"
                  className={cn("pill", pill.active && "on")}
                  aria-current={pill.active ? "page" : undefined}
                  onClick={() => onNavigate(pill.href)}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          )}

          {/* 7. Footer: Who is signed in */}
          {person && (
            <footer className="lm-foot">
              <span className="lm-avatar" aria-hidden="true">
                {person.initial}
              </span>
              <div className="lm-who">
                <span className="lm-who-name">{person.name}</span>
                <span className="lm-who-role">
                  {[person.role || person.plan, person.meta].filter(Boolean).join(" · ")}
                </span>
              </div>
              {person.meter && person.meter.of > 0 && (
                <span className="lm-dots" aria-hidden="true">
                  {Array.from({ length: 10 }, (_, i) => (
                    <i
                      key={i}
                      className={i < Math.round((person.meter!.used / person.meter!.of) * 10) ? "on" : undefined}
                    />
                  ))}
                </span>
              )}
              <SutaeruJapaneseSeal size={24} />
              <button
                type="button"
                className="qtap lm-settings-btn"
                aria-label="Settings"
                onClick={() => (onOpenSettings ? onOpenSettings() : onNavigate("/settings"))}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                  <circle cx="16" cy="7" r="2" />
                  <circle cx="10" cy="17" r="2" />
                </svg>
              </button>
            </footer>
          )}
        </div>
      </div>
    </>
  );
}

export default LogoMenuSheet;
