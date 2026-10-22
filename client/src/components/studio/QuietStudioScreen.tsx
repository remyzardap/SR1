import * as React from "react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { shapeOf, type AspectRatio, type Shot } from "@/lib/studio";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface QuietImageItem {
  id: string;
  src: string;
  alt: string;
  height: number;
}

export type QuietComposerShape = AspectRatio;

export interface QuietComposerProps {
  placeholder: string;
  shape: QuietComposerShape;
  onShapeChange: (s: QuietComposerShape) => void;
  onAddFile: () => void;
  onSpeak: () => void;
  onSubmit: (text: string) => void;
  /** Controlled value, if needed. */
  value?: string;
  onChange?: (v: string) => void;
}

export interface QuietStudioScreenProps {
  images: QuietImageItem[];
  makingImage: boolean;
  composer: QuietComposerProps;
  onBack: () => void;
  onImageClick: (id: string) => void;
  headerTitle?: string;
  headerSubtitle?: string;
  dateLabel?: string;
  imagesLabel?: string;
}

/* ── Sub-components ────────────────────────────────────────────────────── */

function InfinityLogo() {
  return (
    <svg role="img" aria-label="Sutaeru is working" width="96" height="51" viewBox="0 0 144 76" fill="none" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <filter id="qsBlur" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2.2" /></filter>
        <radialGradient id="qsSunG" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#FFB089" /><stop offset=".55" stopColor="#F4511E" /><stop offset="1" stopColor="#C93C0E" /></radialGradient>
        <radialGradient id="qsHaloG"><stop offset="0" stopColor="#F4511E" stopOpacity=".8" /><stop offset="1" stopColor="#F4511E" stopOpacity="0" /></radialGradient>
        <radialGradient id="qsFlashG"><stop offset="0" stopColor="#FFF6EC" /><stop offset=".35" stopColor="#FF9A62" stopOpacity=".8" /><stop offset="1" stopColor="#F4511E" stopOpacity="0" /></radialGradient>
        <clipPath id="qsSea"><rect x="84" y="4" width="48" height="56.2" /></clipPath>
      </defs>
      <path className="st-a" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" stroke="var(--ink)" strokeWidth="7" strokeLinejoin="round" style={{ animation: "qsBase 4.2s ease-in-out infinite both" }} />
      <g filter="url(#qsBlur)">
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="#F4511E" strokeWidth="9.00" strokeOpacity="0.600" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.000s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="#F4511E" strokeWidth="8.20" strokeOpacity="0.482" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.013s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="#F4511E" strokeWidth="7.60" strokeOpacity="0.421" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.027s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="#F4511E" strokeWidth="7.07" strokeOpacity="0.372" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.041s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="#F4511E" strokeWidth="6.57" strokeOpacity="0.329" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.054s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="#F4511E" strokeWidth="6.09" strokeOpacity="0.290" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.068s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="#F4511E" strokeWidth="5.65" strokeOpacity="0.255" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.081s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="#F4511E" strokeWidth="5.24" strokeOpacity="0.224" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.095s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="#F4511E" strokeWidth="4.86" strokeOpacity="0.196" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.108s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="#F4511E" strokeWidth="4.51" strokeOpacity="0.172" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.122s" }} />
      </g>
      <g>
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="var(--ink)" strokeWidth="5.00" strokeOpacity="1.000" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.000s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="var(--ink)" strokeWidth="4.76" strokeOpacity="0.877" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.013s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="var(--ink)" strokeWidth="4.58" strokeOpacity="0.814" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.027s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="var(--ink)" strokeWidth="4.41" strokeOpacity="0.763" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.041s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="var(--ink)" strokeWidth="4.26" strokeOpacity="0.718" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.054s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="var(--ink)" strokeWidth="4.12" strokeOpacity="0.678" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.068s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="var(--ink)" strokeWidth="3.98" strokeOpacity="0.642" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.081s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="var(--ink)" strokeWidth="3.85" strokeOpacity="0.609" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.095s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="var(--ink)" strokeWidth="3.72" strokeOpacity="0.578" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.108s" }} />
        <path className="qs-st-c qs-st-cl" d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z" pathLength="100" stroke="var(--ink)" strokeWidth="3.60" strokeOpacity="0.550" strokeDasharray="1.6 98.4" style={{ animationDelay: "0.122s" }} />
      </g>
      <circle cx="72" cy="38" r="24" fill="url(#qsFlashG)" className="st-a" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "qsFlash 4.2s cubic-bezier(.2,.7,.3,1) infinite both" }} />
      <g transform="translate(108 39) scale(.9) translate(-108 -39)">
        <g clipPath="url(#qsSea)">
          <circle cx="108" cy="46.4" r="15" fill="url(#qsHaloG)" className="st-a" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "qsHalo 4.2s ease-in-out infinite both" }} />
          <circle cx="108" cy="46.4" r="6.3" fill="url(#qsSunG)" className="st-a" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "qsSun 4.2s cubic-bezier(.3,0,.2,1) infinite both" }} />
        </g>
        <g fill="var(--ink)" className="st-a" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "qsGate 4.2s ease-in-out infinite both" }}>
          <path d="M89.2 21.4L90.5 22.5Q108 27.1 125.5 22.5L126.8 21.4L126.2 25.0Q108 29.9 89.8 25.0Z" />
          <path d="M91.6 26.7Q108 30.7 124.4 26.7L124.2 28.9Q108 32.9 91.8 28.9Z" />
          <path d="M106.7 30.4H109.3V35.2H106.7Z" />
          <path d="M90.6 35.1H125.4V37.7H90.6Z" />
          <path d="M95.8 27.6H99.6L98.6 57.6H94.4ZM116.4 27.6H120.2L121.6 57.6H117.4Z" />
        </g>
        <path d="M91.6 60.6H103.2M112.8 60.6H124.4" stroke="var(--ink)" strokeWidth="1.7" strokeLinecap="round" />
        <g stroke="#F4511E" strokeLinecap="round" className="st-a" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "qsGlint 4.2s ease-in-out infinite both" }}>
          <path d="M104.8 60.6H111.2" strokeWidth="1.7" />
          <path d="M106.3 63.8H109.7" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  );
}

function DateDots({ label }: { label: string }) {
  return (
    <svg role="img" aria-label={label} width="57" height="36" viewBox="0 0 57.2 36.4" fill="currentColor" style={{ display: "block", overflow: "visible" }}>
      <circle cx="7.8" cy="2.6" r="1.98" /> <circle cx="13.0" cy="2.6" r="1.98" /> <circle cx="18.2" cy="2.6" r="1.98" />
      <circle cx="2.6" cy="7.8" r="1.98" /> <circle cx="23.4" cy="7.8" r="1.98" />
      <circle cx="2.6" cy="13.0" r="1.98" /> <circle cx="18.2" cy="13.0" r="1.98" /> <circle cx="23.4" cy="13.0" r="1.98" />
      <circle cx="2.6" cy="18.2" r="1.98" /> <circle cx="13.0" cy="18.2" r="1.98" /> <circle cx="23.4" cy="18.2" r="1.98" />
      <circle cx="2.6" cy="23.4" r="1.98" /> <circle cx="7.8" cy="23.4" r="1.98" /> <circle cx="23.4" cy="23.4" r="1.98" />
      <circle cx="2.6" cy="28.6" r="1.98" /> <circle cx="23.4" cy="28.6" r="1.98" />
      <circle cx="7.8" cy="33.8" r="1.98" /> <circle cx="13.0" cy="33.8" r="1.98" /> <circle cx="18.2" cy="33.8" r="1.98" />
      <circle cx="44.2" cy="2.6" r="1.98" /> <circle cx="49.4" cy="2.6" r="1.98" />
      <circle cx="39.0" cy="7.8" r="1.98" />
      <circle cx="33.8" cy="13.0" r="1.98" />
      <circle cx="33.8" cy="18.2" r="1.98" /> <circle cx="39.0" cy="18.2" r="1.98" /> <circle cx="44.2" cy="18.2" r="1.98" /> <circle cx="49.4" cy="18.2" r="1.98" />
      <circle cx="33.8" cy="23.4" r="1.98" /> <circle cx="54.6" cy="23.4" r="1.98" />
      <circle cx="33.8" cy="28.6" r="1.98" /> <circle cx="54.6" cy="28.6" r="1.98" />
      <circle cx="39.0" cy="33.8" r="1.98" /> <circle cx="44.2" cy="33.8" r="1.98" /> <circle cx="49.4" cy="33.8" r="1.98" />
    </svg>
  );
}

function ProgressDots({ label }: { label: string }) {
  return (
    <svg role="img" aria-label={label} width="35" height="22" viewBox="0 0 35.2 22.4" fill="currentColor" style={{ display: "block", overflow: "visible" }}>
      <circle cx="8.0" cy="1.6" r="1.22" /> <circle cx="11.2" cy="1.6" r="1.22" />
      <circle cx="4.8" cy="4.8" r="1.22" />
      <circle cx="1.6" cy="8.0" r="1.22" />
      <circle cx="1.6" cy="11.2" r="1.22" /> <circle cx="4.8" cy="11.2" r="1.22" /> <circle cx="8.0" cy="11.2" r="1.22" /> <circle cx="11.2" cy="11.2" r="1.22" />
      <circle cx="1.6" cy="14.4" r="1.22" /> <circle cx="14.4" cy="14.4" r="1.22" />
      <circle cx="1.6" cy="17.6" r="1.22" /> <circle cx="14.4" cy="17.6" r="1.22" />
      <circle cx="4.8" cy="20.8" r="1.22" /> <circle cx="8.0" cy="20.8" r="1.22" /> <circle cx="11.2" cy="20.8" r="1.22" />
      <circle cx="24.0" cy="1.6" r="1.22" /> <circle cx="27.2" cy="1.6" r="1.22" /> <circle cx="30.4" cy="1.6" r="1.22" />
      <circle cx="20.8" cy="4.8" r="1.22" /> <circle cx="33.6" cy="4.8" r="1.22" />
      <circle cx="33.6" cy="8.0" r="1.22" />
      <circle cx="30.4" cy="11.2" r="1.22" />
      <circle cx="27.2" cy="14.4" r="1.22" />
      <circle cx="24.0" cy="17.6" r="1.22" />
      <circle cx="20.8" cy="20.8" r="1.22" /> <circle cx="24.0" cy="20.8" r="1.22" /> <circle cx="27.2" cy="20.8" r="1.22" /> <circle cx="30.4" cy="20.8" r="1.22" /> <circle cx="33.6" cy="20.8" r="1.22" />
    </svg>
  );
}

function PercentDots() {
  return (
    <svg role="img" aria-label="%" width="16" height="22" viewBox="0 0 16.0 22.4" fill="currentColor" style={{ display: "block", overflow: "visible" }}>
      <circle cx="1.6" cy="1.6" r="1.22" /> <circle cx="4.8" cy="1.6" r="1.22" />
      <circle cx="14.4" cy="1.6" r="1.22" />
      <circle cx="1.6" cy="4.8" r="1.22" /> <circle cx="4.8" cy="4.8" r="1.22" />
      <circle cx="11.2" cy="4.8" r="1.22" />
      <circle cx="1.6" cy="8.0" r="1.22" />
      <circle cx="1.6" cy="11.2" r="1.22" /> <circle cx="4.8" cy="11.2" r="1.22" /> <circle cx="8.0" cy="11.2" r="1.22" /> <circle cx="11.2" cy="11.2" r="1.22" />
      <circle cx="14.4" cy="11.2" r="1.22" />
      <circle cx="1.6" cy="14.4" r="1.22" /> <circle cx="4.8" cy="14.4" r="1.22" /> <circle cx="8.0" cy="14.4" r="1.22" />
      <circle cx="11.2" cy="14.4" r="1.22" /> <circle cx="14.4" cy="14.4" r="1.22" />
      <circle cx="8.0" cy="17.6" r="1.22" /> <circle cx="11.2" cy="17.6" r="1.22" />
      <circle cx="4.8" cy="20.8" r="1.22" /> <circle cx="8.0" cy="20.8" r="1.22" /> <circle cx="14.4" cy="20.8" r="1.22" />
    </svg>
  );
}

function Sheen() {
  return (
    <i
      className="qs-sheen"
      style={{
        position: "absolute", inset: 0, width: "60%",
        background: "linear-gradient(100deg, rgba(255,255,255,0), rgba(255,255,255,.12), rgba(255,255,255,0))",
      }}
    />
  );
}

function ShapeIcon({ ratio }: { ratio: QuietComposerShape }) {
  const r = shapeOf(ratio).r;
  const w = 10;
  const h = Math.round(w / r);
  return <i style={{ display: "block", width: w, height: h, borderRadius: 3, border: "1.8px solid currentColor" }} />;
}

/* ── Main component ──────────────────────────────────────────────────── */

export function QuietStudioScreen(p: QuietStudioScreenProps) {
  const [text, setText] = useState(p.composer.value ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(p.composer.value ?? "");
  }, [p.composer.value]);

  const handleSubmit = () => {
    const v = text.trim();
    if (v) {
      p.composer.onSubmit(v);
      setText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <section className="view view-enter" id="view-quiet-studio" ref={ref}>
      {/* Header */}
      <header className="qs-header">
        <button type="button" className="qs-back qtap" aria-label="Back" onClick={p.onBack}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="qs-images-btn qtap" aria-label="Your images">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" />
            <rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" />
          </svg>
        </button>
      </header>

      {/* Title row */}
      <div className="qs-title-row">
        <h1 className="qs-title">
          <span className="qs-title-main">{p.headerTitle ?? "Studio"}</span>
          <span className="qs-title-sub">{p.headerSubtitle ?? "Today"}</span>
        </h1>
        <div className="qs-date-area">
          <DateDots label={p.dateLabel ?? "06"} />
          <span className="qmono qs-images-label">{p.imagesLabel ?? "Images"}</span>
        </div>
      </div>

      {/* Gallery */}
      <main className="qs-main">
        <div className="qs-grid">
          <div className="qs-col">
            {p.images.filter((_, i) => i % 2 === 0).map((img, colIdx) => {
              const realIdx = colIdx * 2;
              return (
                <ImageCard
                  key={img.id}
                  item={img}
                  index={realIdx + 1}
                  makingImage={p.makingImage && realIdx === 4}
                  onClick={() => p.onImageClick(img.id)}
                />
              );
            })}
          </div>
          <div className="qs-col qs-col-offset">
            {p.images.filter((_, i) => i % 2 === 1).map((img, colIdx) => {
              const realIdx = colIdx * 2 + 1;
              return (
                <ImageCard
                  key={img.id}
                  item={img}
                  index={realIdx + 1}
                  makingImage={p.makingImage && realIdx === 5}
                  onClick={() => p.onImageClick(img.id)}
                />
              );
            })}
          </div>
        </div>

        {/* Gradient fade */}
        <div className="qs-fade" aria-hidden="true" />
      </main>

      {/* Composer */}
      <footer className="qs-footer">
        <div className="qbar qs-bar">
          <div className="qs-bar-in">
            <button type="button" className="qs-icon-btn qtap" aria-label="Add a file" onClick={p.composer.onAddFile}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <input
              className="qs-input"
              type="text"
              placeholder={p.composer.placeholder}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                p.composer.onChange?.(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              aria-label="Describe an image"
            />
            <button
              type="button"
              className="qs-shape-btn qtap"
              aria-label={`Shape ${p.composer.shape}`}
              onClick={() => {
                const shapes: QuietComposerShape[] = ["1:1", "4:3", "16:9", "3:4", "9:16"];
                const idx = shapes.indexOf(p.composer.shape);
                p.composer.onShapeChange(shapes[(idx + 1) % shapes.length]);
              }}
            >
              <ShapeIcon ratio={p.composer.shape} />
              {p.composer.shape}
            </button>
            <button type="button" className="qs-icon-btn qtap" aria-label="Speak" onClick={p.composer.onSpeak}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
}

/* ── Image card ──────────────────────────────────────────────────────────── */

function ImageCard({ item, index, makingImage, onClick }: { item: QuietImageItem; index: number; makingImage: boolean; onClick: () => void }) {
  return (
    <div
      className={cn("qs-card", makingImage && "qs-making")}
      style={{ animationDelay: `${0.05 * index}s` }}
      onClick={makingImage ? undefined : onClick}
      role={makingImage ? "img" : "button"}
      aria-label={makingImage ? "Making an image" : item.alt}
      tabIndex={makingImage ? -1 : 0}
      onKeyDown={makingImage ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    >
      {makingImage ? (
        <>
          <Sheen />
          <div className="qs-making-content">
            <InfinityLogo />
            <ProgressDots label="62" />
            <PercentDots />
          </div>
        </>
      ) : (
        <img src={item.src} alt="" className="qs-card-img" />
      )}
      {!makingImage && <span className="qmono qidx">{String(index).padStart(2, "0")}</span>}
    </div>
  );
}

export default QuietStudioScreen;
