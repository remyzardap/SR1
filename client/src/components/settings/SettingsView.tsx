/**
 * Settings & Quiet You — the ported Quiet You screen (`design/sutaeru-quiet/You.dc.html`)
 * at the top of `/settings`, plus every existing setting and identity field in folds below.
 *
 * Presentational only: every value comes in through props and every change goes back out
 * through a handler. Nothing here fetches or writes to storage — the container that binds
 * this to tRPC and to `lib/theme.ts` is `client/src/pages/Settings.tsx`.
 *
 * The top board renders the Quiet You hero (avatar, display name, role subtitle, SutaeruSeal),
 * three dot-matrix stat cards (Memories, Skills, Connected) linking to `/memories`, `/skills`,
 * and `/connections`, and the three-way Quiet theme picker (Dark, Light, Auto).
 * Below the board, every settings group is a fold: one line when closed (label, the current
 * pick in words, a mini picture), the tiles and controls when open.
 */

import * as React from "react";
import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Link } from "wouter";

import { FocusBrackets } from "@/components/art/FocusBrackets";
import { SutaeruSeal } from "@/components/brand/SutaeruSeal";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { FoldAllButton, FoldGroup, FoldSection, PickTiles, useFoldState, type FoldState, type PickItem } from "@/components/fold";
import { drawDitherRamp } from "@/lib/dither";
import { pickArt } from "@/lib/pickArt";
import type { ThemeChoice, VoiceStyle } from "@/lib/theme";
import { cn } from "@/lib/utils";

/* ── Card data shapes (the container maps its queries onto these) ────────────────── */

export type ResourceStatus = "loading" | "error" | "ready";

/** `ready` with no data means "the request worked, there is nothing to show". */
export type Resource<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T | null };

export interface AccountInfo {
  name: string;
  email: string;
}

export interface YouStats {
  memories: number;
  skills: number;
  connections: number;
}

export interface IdentityProfile {
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  primaryLanguage: string;
  personalityTraits: string[];
  roleLabel?: string;
}

export interface IdentityState {
  status: Resource<IdentityProfile>;
  traitInput: string;
  uploadingAvatar: boolean;
  saving: boolean;
}

export interface TwoFactorSetup {
  qrDataUrl: string;
  secret: string;
}

export interface TwoFactorState {
  /** `ready` data = is two-factor on. */
  status: Resource<boolean>;
  setup: TwoFactorSetup | null;
  token: string;
  error: string;
  turningOff: boolean;
  busy: boolean;
}

export interface UsageMeter {
  label: string;
  used: number;
  limit: number;
}

export interface PlanInfo {
  tier: string;
  trialDaysLeft: number | null;
  meters: UsageMeter[];
}

export interface ModelInfo {
  id: string;
  label: string;
  hasKey: boolean;
}

export interface PurgeState {
  /** `ready` data = is a purge password set. */
  status: Resource<boolean>;
  password: string;
  busy: boolean;
}

export interface SettingsViewProps {
  theme: ThemeChoice;
  backgroundArt: boolean;
  reduceMotion: boolean;
  artIntensity: number;
  voice: VoiceStyle;
  account: Resource<AccountInfo>;
  stats?: Resource<YouStats>;
  identity?: IdentityState;
  twoFactor: TwoFactorState;
  plan: { status: Resource<PlanInfo>; trialBusy: boolean };
  models: Resource<ModelInfo[]>;
  purge: PurgeState;
  onThemeChange(next: ThemeChoice): void;
  onBackgroundArtChange(next: boolean): void;
  onReduceMotionChange(next: boolean): void;
  onArtIntensityChange(next: number): void;
  onVoiceChange(next: VoiceStyle): void;
  onAccountRetry(): void;
  onBack?(): void;
  onStatsRetry?(): void;
  onIdentityChange?(patch: Partial<IdentityProfile>): void;
  onIdentityTraitInputChange?(next: string): void;
  onIdentityTraitAdd?(): void;
  onIdentityTraitRemove?(trait: string): void;
  onIdentityAvatarFile?(file: File): void;
  onIdentityAvatarRemove?(): void;
  onIdentitySave?(): void;
  onIdentityRetry?(): void;
  onTwoFactorToggle(next: boolean): void;
  onTwoFactorTokenChange(next: string): void;
  onTwoFactorSubmit(): void;
  onTwoFactorCancel(): void;
  onTwoFactorCopyKey(): void;
  onTwoFactorRetry(): void;
  onPlanRetry(): void;
  onStartTrial(): void;
  onModelsRetry(): void;
  onPurgePasswordChange(next: string): void;
  onPurgeSave(): void;
  onPurgeRetry(): void;
  /** Overrides the localStorage key when the lab renders several states at once. */
  foldKey?: string;
  /**
   * Sections forced open, whatever the page remembers. The lab and the markup tests use it
   * to see every control at once; a closed fold does not render its body at all.
   */
  openSections?: string[];
}

/* ── Identity languages ─────────────────────────────────────────────────────────── */

export const IDENTITY_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "id", label: "Indonesian" },
  { value: "zh", label: "Chinese (Mandarin)" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "ru", label: "Russian" },
  { value: "it", label: "Italian" },
  { value: "tr", label: "Turkish" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "vi", label: "Vietnamese" },
  { value: "th", label: "Thai" },
] as const;

/* ── Picture tiles ──────────────────────────────────────────────────────────────── */

const THEME_ITEMS: PickItem[] = [
  { id: "light", label: "Light", art: pickArt("theme-light") },
  { id: "dark", label: "Dark", art: pickArt("theme-dark") },
  { id: "system", label: "System", art: pickArt("theme-auto") },
];

const MOTION_ITEMS: PickItem[] = [
  { id: "full", label: "Full motion", art: pickArt("motion-full") },
  /* No motion-reduced picture yet (images package): the quiet bowl stands in for it. */
  { id: "reduced", label: "Reduced motion", art: pickArt("style-keep") },
];

const LENGTH_ITEMS: PickItem[] = [
  { id: "concise", label: "Concise", art: pickArt("depth-quick") },
  { id: "balanced", label: "Balanced", art: pickArt("len-medium") },
  { id: "detailed", label: "Detailed", art: pickArt("len-long") },
];

const TONE_ITEMS: PickItem[] = [
  { id: "formal", label: "Formal", art: pickArt("tone-formal") },
  { id: "neutral", label: "Neutral", art: pickArt("tone-plain") },
  { id: "casual", label: "Casual", art: pickArt("tone-friendly") },
];

/** The middle of each bucket, so a tile sets the slider without fighting it. */
const BUCKET_CENTRE: Record<string, number> = { concise: 15, balanced: 50, detailed: 85, formal: 15, neutral: 50, casual: 85 };

/** The settings groups, in page order. Each one is a fold. */
export const SETTINGS_FOLD_IDS = ["theme", "art", "motion", "voice", "account", "two-factor", "plan", "models", "purge", "connections"];

/* ── Prototype copy ─────────────────────────────────────────────────────────────── */

/** The sample answers behind the "How Sutaeru talks" tiles (app.js:1241-1244). */
export const VOICE_SAMPLES = {
  concise: {
    formal: "Payback is 4 to 6 years. Larger systems recover faster.",
    neutral: "Most systems pay back in 4 to 6 years. Bigger ones are quicker.",
    casual: "Think 4 to 6 years. Go bigger and it pays back sooner.",
  },
  balanced: {
    formal:
      "Most commercial rooftop systems pay back in 4 to 6 years. Larger systems recover faster because cost per watt falls with scale.",
    neutral:
      "Most rooftop systems pay back in 4 to 6 years. Bigger systems get there faster since each watt costs less to install.",
    casual:
      "You are looking at roughly 4 to 6 years. Bigger systems win here, because each watt gets cheaper to put up.",
  },
  detailed: {
    formal:
      "Most commercial rooftop systems in Indonesia pay back in 4 to 6 years, depending on size and PLN tariff class. A 1 MWp system reaches payback in about 4.2 years, against 5.9 years for 100 kWp, because installation cost per watt falls with scale. Export caps under net metering set the upper end of the range.",
    neutral:
      "Most rooftop systems in Indonesia pay back in 4 to 6 years. A 1 MWp system takes about 4.2 years and a 100 kWp one about 5.9, since installing each watt gets cheaper at scale. Net metering export caps decide the slow end.",
    casual:
      "Roughly 4 to 6 years. A big 1 MWp setup gets there in about 4.2 years, a small 100 kWp one closer to 6, because each watt gets cheaper the more you install. The export cap is what drags the slow cases out.",
  },
} as const;

export type VoiceLength = keyof typeof VOICE_SAMPLES;
export type VoiceTone = keyof (typeof VOICE_SAMPLES)[VoiceLength];

/** The prototype's buckets: under 34 / over 66 / the band between. */
export function voiceBucket(voice: VoiceStyle): { length: VoiceLength; tone: VoiceTone } {
  const detail = clampSlider(voice.detail);
  const tone = clampSlider(voice.tone);
  return {
    length: detail < 34 ? "concise" : detail > 66 ? "detailed" : "balanced",
    tone: tone < 34 ? "formal" : tone > 66 ? "casual" : "neutral",
  };
}

/** The sample answer for a voice setting. */
export function voiceSample(voice: VoiceStyle): string {
  const { length, tone } = voiceBucket(voice);
  return VOICE_SAMPLES[length][tone];
}

function clampSlider(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/* ── Quiet You dot-matrix glyphs & numbers (design/sutaeru-quiet/You.dc.html) ───── */

const YOU_DIGIT_BITMAPS: Record<string, number[]> = {
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b11111, 0b00001, 0b00010, 0b00110, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

/** 5×7 dot-matrix number matching `You.dc.html` (step 4, radius 1.52, height 28). */
export function YouDotNumber({ value }: { value: number }) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const digits = String(safe);
  const STEP = 4;
  const RADIUS = 1.52;
  const COLS_PER_DIGIT = 6;
  const circles: Array<{ cx: number; cy: number; key: string }> = [];

  for (let d = 0; d < digits.length; d++) {
    const bitmap = YOU_DIGIT_BITMAPS[digits[d]] ?? YOU_DIGIT_BITMAPS["0"];
    const colOffset = d * COLS_PER_DIGIT;
    for (let row = 0; row < 7; row++) {
      const cy = 2 + row * STEP;
      const mask = bitmap[row];
      for (let col = 0; col < 5; col++) {
        if ((mask & (1 << (4 - col))) !== 0) {
          const cx = 2 + (colOffset + col) * STEP;
          circles.push({ cx, cy, key: `${d}-${row}-${col}` });
        }
      }
    }
  }

  const width = (digits.length * COLS_PER_DIGIT - 1) * STEP;
  const height = 28;

  return (
    <svg
      role="img"
      aria-label={String(safe)}
      width={width}
      height={height}
      viewBox={`0 0 ${width.toFixed(1)} ${height.toFixed(1)}`}
      fill="currentColor"
      className="you-stat-num"
    >
      {circles.map((c) => (
        <circle key={c.key} cx={c.cx.toFixed(1)} cy={c.cy.toFixed(1)} r={RADIUS.toFixed(2)} />
      ))}
    </svg>
  );
}

/** 55×55 dot-matrix Memories glyph from `You.dc.html` line 47. */
function MemoriesDotGlyph() {
  return (
    <svg aria-hidden="true" width="55" height="55" viewBox="0 0 55 55" fill="currentColor">
      <circle cx="12.5" cy="7.5" r="2.00" /><circle cx="17.5" cy="7.5" r="2.00" /><circle cx="22.5" cy="7.5" r="2.00" /><circle cx="27.5" cy="7.5" r="2.00" /><circle cx="32.5" cy="7.5" r="2.00" /><circle cx="37.5" cy="7.5" r="2.00" /><circle cx="42.5" cy="7.5" r="2.00" />
      <circle cx="7.5" cy="12.5" r="2.00" /><circle cx="47.5" cy="12.5" r="2.00" />
      <circle cx="7.5" cy="17.5" r="2.00" /><circle cx="12.5" cy="17.5" r="2.00" /><circle cx="17.5" cy="17.5" r="2.00" /><circle cx="22.5" cy="17.5" r="2.00" /><circle cx="27.5" cy="17.5" r="2.00" /><circle cx="32.5" cy="17.5" r="2.00" /><circle cx="37.5" cy="17.5" r="2.00" /><circle cx="42.5" cy="17.5" r="2.00" /><circle cx="47.5" cy="17.5" r="2.00" />
      <circle cx="7.5" cy="22.5" r="2.00" /><circle cx="47.5" cy="22.5" r="2.00" />
      <circle cx="7.5" cy="27.5" r="2.00" /><circle cx="12.5" cy="27.5" r="2.00" /><circle cx="17.5" cy="27.5" r="2.00" /><circle cx="22.5" cy="27.5" r="2.00" /><circle cx="27.5" cy="27.5" r="2.00" /><circle cx="32.5" cy="27.5" r="2.00" /><circle cx="37.5" cy="27.5" r="2.00" /><circle cx="42.5" cy="27.5" r="2.00" /><circle cx="47.5" cy="27.5" r="2.00" />
      <circle cx="7.5" cy="32.5" r="2.00" /><circle cx="47.5" cy="32.5" r="2.00" />
      <circle cx="7.5" cy="37.5" r="2.00" /><circle cx="12.5" cy="37.5" r="2.00" /><circle cx="17.5" cy="37.5" r="2.00" /><circle cx="22.5" cy="37.5" r="2.00" /><circle cx="27.5" cy="37.5" r="2.00" /><circle cx="32.5" cy="37.5" r="2.00" /><circle cx="37.5" cy="37.5" r="2.00" /><circle cx="42.5" cy="37.5" r="2.00" /><circle cx="47.5" cy="37.5" r="2.00" />
      <circle cx="7.5" cy="42.5" r="2.00" /><circle cx="47.5" cy="42.5" r="2.00" />
      <circle cx="12.5" cy="47.5" r="2.00" /><circle cx="17.5" cy="47.5" r="2.00" /><circle cx="22.5" cy="47.5" r="2.00" /><circle cx="27.5" cy="47.5" r="2.00" /><circle cx="32.5" cy="47.5" r="2.00" /><circle cx="37.5" cy="47.5" r="2.00" /><circle cx="42.5" cy="47.5" r="2.00" />
    </svg>
  );
}

/** 55×55 dot-matrix Skills star glyph from `You.dc.html` line 49. */
function SkillsDotGlyph() {
  return (
    <svg aria-hidden="true" width="55" height="55" viewBox="0 0 55 55" fill="currentColor">
      <circle cx="27.5" cy="2.5" r="2.00" />
      <circle cx="27.5" cy="7.5" r="2.00" />
      <circle cx="22.5" cy="12.5" r="2.00" /><circle cx="27.5" cy="12.5" r="2.00" /><circle cx="32.5" cy="12.5" r="2.00" />
      <circle cx="17.5" cy="17.5" r="2.00" /><circle cx="22.5" cy="17.5" r="2.00" /><circle cx="27.5" cy="17.5" r="2.00" /><circle cx="32.5" cy="17.5" r="2.00" /><circle cx="37.5" cy="17.5" r="2.00" />
      <circle cx="2.5" cy="22.5" r="2.00" /><circle cx="7.5" cy="22.5" r="2.00" /><circle cx="12.5" cy="22.5" r="2.00" /><circle cx="17.5" cy="22.5" r="2.00" /><circle cx="22.5" cy="22.5" r="2.00" /><circle cx="27.5" cy="22.5" r="2.00" /><circle cx="32.5" cy="22.5" r="2.00" /><circle cx="37.5" cy="22.5" r="2.00" /><circle cx="42.5" cy="22.5" r="2.00" /><circle cx="47.5" cy="22.5" r="2.00" /><circle cx="52.5" cy="22.5" r="2.00" />
      <circle cx="7.5" cy="27.5" r="2.00" /><circle cx="12.5" cy="27.5" r="2.00" /><circle cx="17.5" cy="27.5" r="2.00" /><circle cx="22.5" cy="27.5" r="2.00" /><circle cx="27.5" cy="27.5" r="2.00" /><circle cx="32.5" cy="27.5" r="2.00" /><circle cx="37.5" cy="27.5" r="2.00" /><circle cx="42.5" cy="27.5" r="2.00" /><circle cx="47.5" cy="27.5" r="2.00" />
      <circle cx="17.5" cy="32.5" r="2.00" /><circle cx="22.5" cy="32.5" r="2.00" /><circle cx="27.5" cy="32.5" r="2.00" /><circle cx="32.5" cy="32.5" r="2.00" /><circle cx="37.5" cy="32.5" r="2.00" />
      <circle cx="17.5" cy="37.5" r="2.00" /><circle cx="22.5" cy="37.5" r="2.00" /><circle cx="32.5" cy="37.5" r="2.00" /><circle cx="37.5" cy="37.5" r="2.00" />
      <circle cx="12.5" cy="42.5" r="2.00" /><circle cx="17.5" cy="42.5" r="2.00" /><circle cx="37.5" cy="42.5" r="2.00" /><circle cx="42.5" cy="42.5" r="2.00" />
      <circle cx="12.5" cy="47.5" r="2.00" /><circle cx="42.5" cy="47.5" r="2.00" />
    </svg>
  );
}

/** 55×55 dot-matrix Connected link glyph from `You.dc.html` line 51. */
function ConnectedDotGlyph() {
  return (
    <svg aria-hidden="true" width="55" height="55" viewBox="0 0 55 55" fill="currentColor">
      <circle cx="7.5" cy="7.5" r="2.00" /><circle cx="12.5" cy="7.5" r="2.00" /><circle cx="17.5" cy="7.5" r="2.00" /><circle cx="37.5" cy="7.5" r="2.00" /><circle cx="42.5" cy="7.5" r="2.00" /><circle cx="47.5" cy="7.5" r="2.00" />
      <circle cx="2.5" cy="12.5" r="2.00" /><circle cx="7.5" cy="12.5" r="2.00" /><circle cx="17.5" cy="12.5" r="2.00" /><circle cx="22.5" cy="12.5" r="2.00" /><circle cx="32.5" cy="12.5" r="2.00" /><circle cx="37.5" cy="12.5" r="2.00" /><circle cx="47.5" cy="12.5" r="2.00" /><circle cx="52.5" cy="12.5" r="2.00" />
      <circle cx="2.5" cy="17.5" r="2.00" /><circle cx="22.5" cy="17.5" r="2.00" /><circle cx="32.5" cy="17.5" r="2.00" /><circle cx="52.5" cy="17.5" r="2.00" />
      <circle cx="2.5" cy="22.5" r="2.00" /><circle cx="22.5" cy="22.5" r="2.00" /><circle cx="27.5" cy="22.5" r="2.00" /><circle cx="32.5" cy="22.5" r="2.00" /><circle cx="52.5" cy="22.5" r="2.00" />
      <circle cx="2.5" cy="27.5" r="2.00" /><circle cx="27.5" cy="27.5" r="2.00" /><circle cx="52.5" cy="27.5" r="2.00" />
      <circle cx="2.5" cy="32.5" r="2.00" /><circle cx="22.5" cy="32.5" r="2.00" /><circle cx="27.5" cy="32.5" r="2.00" /><circle cx="32.5" cy="32.5" r="2.00" /><circle cx="52.5" cy="32.5" r="2.00" />
      <circle cx="2.5" cy="37.5" r="2.00" /><circle cx="22.5" cy="37.5" r="2.00" /><circle cx="32.5" cy="37.5" r="2.00" /><circle cx="52.5" cy="37.5" r="2.00" />
      <circle cx="2.5" cy="42.5" r="2.00" /><circle cx="7.5" cy="42.5" r="2.00" /><circle cx="17.5" cy="42.5" r="2.00" /><circle cx="22.5" cy="42.5" r="2.00" /><circle cx="32.5" cy="42.5" r="2.00" /><circle cx="37.5" cy="42.5" r="2.00" /><circle cx="47.5" cy="42.5" r="2.00" /><circle cx="52.5" cy="42.5" r="2.00" />
      <circle cx="7.5" cy="47.5" r="2.00" /><circle cx="12.5" cy="47.5" r="2.00" /><circle cx="17.5" cy="47.5" r="2.00" /><circle cx="37.5" cy="47.5" r="2.00" /><circle cx="42.5" cy="47.5" r="2.00" /><circle cx="47.5" cy="47.5" r="2.00" />
    </svg>
  );
}

/* ── Small parts ────────────────────────────────────────────────────────────────── */

/** The prototype's tick(): a short buzz on a press, never under reduce motion. */
function tick(reduceMotion: boolean, event: MouseEvent): void {
  if (event.detail === 0) return; // keyboard activation: the prototype skips this too (RM())
  if (reduceMotion || prefersReducedMotion()) return;
  navigator.vibrate?.(8);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The 52×30 switch, in the prototype's own markup. */
function ToggleSwitch({
  checked,
  label,
  disabled,
  reduceMotion,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  reduceMotion: boolean;
  onChange(next: boolean): void;
}) {
  return (
    <button
      type="button"
      className="toggle"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        tick(reduceMotion, event);
        onChange(!checked);
      }}
    />
  );
}

/** The filled track for a range input: `--p` is the value as a share of the range. */
function rangeStyle(min: number, max: number, value: number): CSSProperties {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return { "--p": `${pct}%` } as CSSProperties;
}

/**
 * A fold body while its data is in flight. The bar is decorative, so the word
 * has to travel separately: five `aria-hidden` skeletons read as five empty
 * cards.
 */
function LoadingRows() {
  return (
    <>
      <div className="set-skeleton" aria-hidden="true" />
      <span className="sr">Loading…</span>
    </>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="between">
      <p className="set-note">Couldn&apos;t load this right now.</p>
      <button type="button" className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** A 20 segment dither bar, the prototype's `.segs`. */
function Segments({ used, limit }: { used: number; limit: number }) {
  const total = 20;
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const on = Math.round(ratio * total);
  return (
    <div className="segs" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < on ? "on" : undefined} />
      ))}
    </div>
  );
}

/* ── The live dither sample under the Art intensity slider ──────────────────────── */

function IntensityDemo({ intensity, theme }: { intensity: number; theme: ThemeChoice }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // The prototype's demo(): ramp, seed 6, cell 2.4, k = intensity / 100. Ink is read
    // from the live token, so a theme change has to redraw it (theme is a dependency).
    const draw = () => drawDitherRamp(canvas, { intensity: intensity / 100, cell: 2.4, seed: 6 });
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [intensity, theme]);

  return <canvas ref={ref} aria-hidden="true" />;
}

/* ── Identity editor inside Account fold ────────────────────────────────────────── */

function IdentityEditorSection({
  identity,
  onChange,
  onTraitInputChange,
  onTraitAdd,
  onTraitRemove,
  onAvatarFile,
  onAvatarRemove,
  onSave,
  onRetry,
}: {
  identity: IdentityState;
  onChange?: (patch: Partial<IdentityProfile>) => void;
  onTraitInputChange?: (next: string) => void;
  onTraitAdd?: () => void;
  onTraitRemove?: (trait: string) => void;
  onAvatarFile?: (file: File) => void;
  onAvatarRemove?: () => void;
  onSave?: () => void;
  onRetry?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (identity.status.status === "loading") {
    return (
      <div className="you-id-editor">
        <LoadingRows />
      </div>
    );
  }

  if (identity.status.status === "error") {
    return (
      <div className="you-id-editor">
        <LoadError onRetry={() => onRetry?.()} />
      </div>
    );
  }

  const profile = identity.status.data;
  if (!profile) return null;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onAvatarFile?.(file);
    if (event.target) event.target.value = "";
  };

  const handleTraitKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      onTraitAdd?.();
    } else if (event.key === "Backspace" && !identity.traitInput && profile.personalityTraits.length > 0) {
      onTraitRemove?.(profile.personalityTraits[profile.personalityTraits.length - 1]);
    }
  };

  const traitsFull = profile.personalityTraits.length >= 10;

  return (
    <div className="you-id-editor">
      <div className="you-id-avatar-row">
        <span className="you-id-avatar-thumb" aria-hidden="true">
          <img src={profile.avatarUrl || pickArt("nav-agent")} alt="Avatar preview" />
        </span>
        <div className="you-id-avatar-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="btn"
            disabled={identity.uploadingAvatar}
            onClick={() => fileInputRef.current?.click()}
          >
            {identity.uploadingAvatar ? "Uploading…" : "Upload image"}
          </button>
          {profile.avatarUrl && (
            <button type="button" className="btn ghost" onClick={() => onAvatarRemove?.()}>
              Remove avatar
            </button>
          )}
        </div>
      </div>

      <div className="you-id-grid">
        <label className="you-id-field">
          <span className="mono">Display Name</span>
          <input
            className="set-input"
            type="text"
            value={profile.displayName}
            maxLength={255}
            placeholder="Your Name"
            onChange={(event) => onChange?.({ displayName: event.target.value })}
          />
        </label>
        <label className="you-id-field">
          <span className="mono">Handle</span>
          <input
            className="set-input"
            type="text"
            value={profile.handle}
            maxLength={64}
            placeholder="username"
            onChange={(event) => onChange?.({ handle: event.target.value.replace(/[^a-z0-9_-]/gi, "") })}
          />
        </label>
      </div>

      <label className="you-id-field">
        <span className="mono">Bio</span>
        <textarea
          className="you-id-textarea"
          rows={3}
          value={profile.bio}
          placeholder="Tell others about your agent..."
          onChange={(event) => onChange?.({ bio: event.target.value })}
        />
      </label>

      <label className="you-id-field">
        <span className="mono">Primary Language</span>
        <select
          className="you-id-select"
          value={profile.primaryLanguage}
          onChange={(event) => onChange?.({ primaryLanguage: event.target.value })}
        >
          <option value="">Select a language...</option>
          {IDENTITY_LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </label>

      <div className="you-id-field">
        <span className="mono">Personality</span>
        <div className="you-id-traits">
          {profile.personalityTraits.map((trait) => (
            <span className="you-id-trait" key={trait}>
              {trait}
              <button
                type="button"
                className="you-id-trait-del"
                aria-label={`Remove ${trait}`}
                onClick={() => onTraitRemove?.(trait)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="set-field-row">
          <label className="set-field">
            <span className="sr">Personality trait</span>
            <input
              className="set-input"
              type="text"
              aria-label="Personality trait"
              value={identity.traitInput}
              disabled={traitsFull}
              placeholder={
                profile.personalityTraits.length === 0
                  ? "Type a trait and press Enter..."
                  : traitsFull
                    ? "Maximum 10 traits"
                    : "Add another..."
              }
              onChange={(event) => onTraitInputChange?.(event.target.value)}
              onKeyDown={handleTraitKeyDown}
            />
          </label>
          <button
            type="button"
            className="btn"
            disabled={traitsFull || !identity.traitInput.trim()}
            onClick={() => onTraitAdd?.()}
          >
            Add trait
          </button>
        </div>
      </div>

      <div className="you-id-footer">
        <span className="set-note">Standing profile and instructions for your agent.</span>
        <button type="button" className="btn ink" disabled={identity.saving} onClick={() => onSave?.()}>
          {identity.saving ? "Saving…" : "Save identity"}
        </button>
      </div>
    </div>
  );
}

/* ── The screen ─────────────────────────────────────────────────────────────────── */

const DEFAULT_STATS: YouStats = { memories: 128, skills: 12, connections: 4 };

const DEFAULT_IDENTITY: IdentityState = {
  status: {
    status: "ready",
    data: {
      handle: "remy",
      displayName: "Remy",
      bio: "",
      avatarUrl: "",
      primaryLanguage: "en",
      personalityTraits: [],
      roleLabel: "Owner",
    },
  },
  traitInput: "",
  uploadingAvatar: false,
  saving: false,
};

export function SettingsView(props: SettingsViewProps) {
  const {
    theme,
    backgroundArt,
    reduceMotion,
    artIntensity,
    voice,
    account,
    twoFactor,
    plan,
    models,
    purge,
    onThemeChange,
    onBackgroundArtChange,
    onReduceMotionChange,
    onArtIntensityChange,
    onVoiceChange,
  } = props;

  const statsResource = props.stats ?? { status: "ready", data: DEFAULT_STATS };
  const identityState = props.identity ?? DEFAULT_IDENTITY;

  const folds = useFoldState(props.foldKey ?? "settings", SETTINGS_FOLD_IDS, { first: "theme" });
  // The lab and the markup tests can force every section open; a forced page has no
  // accordion left to fold, so the Fold all pill steps aside.
  const forced = props.openSections;
  const group: FoldState = forced
    ? { ...folds, isOpen: (id: string) => forced.includes(id), setOpen: () => {}, toggle: () => {} }
    : folds;
  const twoFactorOn = twoFactor.status.status === "ready" && !!twoFactor.status.data;
  const bucket = voiceBucket(voice);
  const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

  const settingsHeadRef = useRef<HTMLElement | null>(null);

  // A two-factor code on screen must not be behind a fold: open the section when the
  // flow starts, and leave the accordion alone otherwise.
  const codeWanted = twoFactor.status.status === "ready" && (!!twoFactor.setup || twoFactor.turningOff);
  const wasWanted = useRef(false);
  const openTwoFactor = folds.setOpen;
  useEffect(() => {
    if (codeWanted && !wasWanted.current) openTwoFactor("two-factor", true);
    wasWanted.current = codeWanted;
  }, [codeWanted, openTwoFactor]);

  // The sample answer fades out, swaps, fades back — 140ms, or a jump under reduce
  // motion (app.js:1306-1310).
  const [sample, setSample] = useState(() => voiceSample(voice));
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const next = voiceSample(voice);
    if (next === sample) return;
    setFading(true);
    const delay = reduceMotion || prefersReducedMotion() ? 0 : 140;
    const timer = window.setTimeout(() => {
      setSample(next);
      setFading(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [voice, sample, reduceMotion]);

  // Derive Quiet You profile hero display values
  const identityData = identityState.status.status === "ready" ? identityState.status.data : null;
  const accountData = account.status === "ready" ? account.data : null;
  const isAnon = account.status === "ready" && account.data === null && !identityData?.displayName;

  const profileName = isAnon
    ? "Guest"
    : identityData?.displayName || accountData?.name || identityData?.handle || accountData?.email || "Remy";
  const profileRole = isAnon
    ? "Sign in"
    : identityData?.roleLabel || (identityData?.handle ? `@${identityData.handle}` : "Owner");
  const profileAvatarUrl = identityData?.avatarUrl || "";
  const profileInitial = (profileName.trim().charAt(0) || "R").toUpperCase();

  const counts: YouStats =
    statsResource.status === "ready" && statsResource.data
      ? statsResource.data
      : { memories: 0, skills: 0, connections: 0 };

  const scrollToSettings = () => {
    settingsHeadRef.current?.scrollIntoView?.({
      behavior: reduceMotion || prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  return (
    <section className="view wide view-enter settings-view">
      {/* ── Quiet You board (design/sutaeru-quiet/You.dc.html) ──────────────────── */}
      <div className="you-board" data-testid="you-board">
        <header className="you-top">
          <button
            type="button"
            className="qtap you-top-btn"
            aria-label="Back"
            onClick={() => props.onBack?.()}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <span className="you-spacer" />
          <button
            type="button"
            className="qtap you-top-btn"
            aria-label="More settings"
            onClick={scrollToSettings}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
          </button>
        </header>

        <section className="you-hero" aria-label="Profile">
          <span className="you-avatar" aria-hidden="true">
            {profileAvatarUrl ? (
              <img src={profileAvatarUrl} alt="" className="you-avatar-img" />
            ) : (
              profileInitial
            )}
          </span>
          <h1 className="you-heading">
            <span className="you-name">{profileName}</span>
            <span className="you-role">{profileRole}</span>
          </h1>
          <span className="you-spacer" />
          <SutaeruSeal size={28} rough={false} className="you-seal" />
        </section>

        <div className="you-stats" role="group" aria-label="Workspace counts">
          <Link href="/memories" className="qtap you-stat-card" aria-label={`Memories: ${counts.memories}`}>
            <span className="you-stat-icon accent">
              <MemoriesDotGlyph />
            </span>
            <span className="you-spacer" />
            <YouDotNumber value={counts.memories} />
            <span className="qmono you-stat-label">Memories</span>
          </Link>

          <Link href="/skills" className="qtap you-stat-card" aria-label={`Skills: ${counts.skills}`}>
            <span className="you-stat-icon">
              <SkillsDotGlyph />
            </span>
            <span className="you-spacer" />
            <YouDotNumber value={counts.skills} />
            <span className="qmono you-stat-label">Skills</span>
          </Link>

          <Link href="/connections" className="qtap you-stat-card" aria-label={`Connected: ${counts.connections}`}>
            <span className="you-stat-icon">
              <ConnectedDotGlyph />
            </span>
            <span className="you-spacer" />
            <YouDotNumber value={counts.connections} />
            <span className="qmono you-stat-label">Connected</span>
          </Link>
        </div>

        {statsResource.status === "error" && props.onStatsRetry && (
          <LoadError onRetry={props.onStatsRetry} />
        )}

        <div className="you-themes" role="group" aria-label="Quick theme picker">
          <button
            type="button"
            className="qtap you-theme-btn"
            aria-pressed={theme === "dark"}
            onClick={(event) => {
              tick(reduceMotion, event);
              onThemeChange("dark");
            }}
          >
            <span className={cn("qcard you-theme-preview", theme === "dark" && "is-active")}>
              <span className="you-theme-surface dark">
                <i className="you-theme-pill" />
                <i className="you-theme-line" />
                <i className="you-theme-bar" />
              </span>
            </span>
            <span className={cn("qmono you-theme-name", theme === "dark" && "is-active")}>Dark</span>
          </button>

          <button
            type="button"
            className="qtap you-theme-btn"
            aria-pressed={theme === "light"}
            onClick={(event) => {
              tick(reduceMotion, event);
              onThemeChange("light");
            }}
          >
            <span className={cn("qcard you-theme-preview", theme === "light" && "is-active")}>
              <span className="you-theme-surface light">
                <i className="you-theme-pill" />
                <i className="you-theme-line" />
                <i className="you-theme-bar" />
              </span>
            </span>
            <span className={cn("qmono you-theme-name", theme === "light" && "is-active")}>Light</span>
          </button>

          <button
            type="button"
            className="qtap you-theme-btn"
            aria-pressed={theme === "system"}
            onClick={(event) => {
              tick(reduceMotion, event);
              onThemeChange("system");
            }}
          >
            <span className={cn("qcard you-theme-preview", theme === "system" && "is-active")}>
              <span className="you-theme-surface auto">
                <i className="you-theme-pill" />
                <i className="you-theme-line" />
                <i className="you-theme-bar" />
              </span>
            </span>
            <span className={cn("qmono you-theme-name", theme === "system" && "is-active")}>Auto</span>
          </button>
        </div>
      </div>

      {/* ── All settings & identity folds ───────────────────────────────────────── */}
      <header className="head-row" ref={settingsHeadRef}>
        <div>
          <h2 className="title">
            Settings
          </h2>
          <p className="lede">
            Make Sutaeru feel like yours. Changes apply as you make them.
          </p>
        </div>
        {!forced && <FoldAllButton state={folds} />}
      </header>

      <FoldGroup state={group} className="settings-folds">
        {/* ── Theme ────────────────────────────────────────────────────────────── */}
        <FoldSection id="theme" index={1} label="Theme" pick={cap(theme)} mini={THEME_ITEMS.find((t) => t.id === theme)?.art}>
          <PickTiles label="Theme" items={THEME_ITEMS} value={theme} onChange={(id) => onThemeChange(id as ThemeChoice)} />
        </FoldSection>

        {/* ── Background art ───────────────────────────────────────────────────── */}
        <FoldSection
          id="art"
          index={2}
          label="Background art"
          pick={backgroundArt ? `${artIntensity}%` : "Off"}
          mini={<SutaeruIcon name="image" signal={false} />}
        >
          <div className="toggle-row" style={{ borderTop: 0 }}>
            <div className="tx">
              <b>Background art</b>
              <small>Registration marks, halftones and dither edges</small>
            </div>
            <ToggleSwitch
              checked={backgroundArt}
              label="Background art"
              reduceMotion={reduceMotion}
              onChange={onBackgroundArtChange}
            />
          </div>
          <div className="slider">
            <div className="between">
              <span className="mono ink">Art intensity</span>
              <span className="mono tnum">{artIntensity}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              value={artIntensity}
              style={rangeStyle(20, 100, artIntensity)}
              aria-label="Art intensity"
              onChange={(event) => onArtIntensityChange(Number(event.target.value))}
            />
          </div>
          <div className="intensity-demo">
            <IntensityDemo intensity={artIntensity} theme={theme} />
          </div>
        </FoldSection>

        {/* ── Motion ───────────────────────────────────────────────────────────── */}
        <FoldSection
          id="motion"
          index={3}
          label="Motion"
          pick={reduceMotion ? "Reduced" : "Full"}
          mini={MOTION_ITEMS.find((m) => m.id === (reduceMotion ? "reduced" : "full"))?.art}
        >
          <PickTiles
            label="Motion"
            items={MOTION_ITEMS}
            value={reduceMotion ? "reduced" : "full"}
            onChange={(id) => onReduceMotionChange(id === "reduced")}
          />
        </FoldSection>

        {/* ── How Sutaeru talks ────────────────────────────────────────────────── */}
        <FoldSection
          id="voice"
          index={4}
          label="How Sutaeru talks"
          pick={`${cap(bucket.length)} · ${cap(bucket.tone)}`}
          mini={LENGTH_ITEMS.find((l) => l.id === bucket.length)?.art}
        >
          <PickTiles
            label="Concise to detailed"
            items={LENGTH_ITEMS}
            value={bucket.length}
            onChange={(id) => onVoiceChange({ ...voice, detail: BUCKET_CENTRE[id] ?? voice.detail })}
          />
          <PickTiles
            label="Formal to casual"
            items={TONE_ITEMS}
            value={bucket.tone}
            onChange={(id) => onVoiceChange({ ...voice, tone: BUCKET_CENTRE[id] ?? voice.tone })}
          />
          <div className="set-fine">
            <div className="slider">
              <div className="between">
                <span className="mono">Concise</span>
                <span className="mono">Detailed</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={voice.detail}
                style={rangeStyle(0, 100, voice.detail)}
                aria-label="Concise to detailed"
                onChange={(event) => onVoiceChange({ ...voice, detail: Number(event.target.value) })}
              />
            </div>
            <div className="slider">
              <div className="between">
                <span className="mono">Formal</span>
                <span className="mono">Casual</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={voice.tone}
                style={rangeStyle(0, 100, voice.tone)}
                aria-label="Formal to casual"
                onChange={(event) => onVoiceChange({ ...voice, tone: Number(event.target.value) })}
              />
            </div>
          </div>
          <div className="voice-sample">
            <FocusBrackets className="show tight" />
            <span className="mono">Preview · rooftop solar payback</span>
            <p style={{ opacity: fading ? 0 : 1 }}>{sample}</p>
          </div>
        </FoldSection>

        {/* ── Account & Identity ───────────────────────────────────────────────── */}
        <FoldSection
          id="account"
          index={5}
          label="Account"
          pick={account.status === "ready" ? account.data?.name || account.data?.email || "Signed in" : undefined}
          mini={<SutaeruIcon name="agent" signal={false} />}
        >
          {account.status === "loading" && <LoadingRows />}
          {account.status === "error" && <LoadError onRetry={props.onAccountRetry} />}
          {account.status === "ready" &&
            (account.data ? (
              <>
                <div className="toggle-row" style={{ borderTop: 0 }}>
                  <div className="tx">
                    <b>{account.data.name || account.data.email || "Signed in"}</b>
                    {account.data.email && <small>{account.data.email}</small>}
                  </div>
                  <Link href="/identity" className="btn">
                    Edit profile
                  </Link>
                </div>
                <IdentityEditorSection
                  identity={identityState}
                  onChange={props.onIdentityChange}
                  onTraitInputChange={props.onIdentityTraitInputChange}
                  onTraitAdd={props.onIdentityTraitAdd}
                  onTraitRemove={props.onIdentityTraitRemove}
                  onAvatarFile={props.onIdentityAvatarFile}
                  onAvatarRemove={props.onIdentityAvatarRemove}
                  onSave={props.onIdentitySave}
                  onRetry={props.onIdentityRetry}
                />
              </>
            ) : (
              <p className="set-note">Sign in to manage your account.</p>
            ))}
        </FoldSection>

        {/* ── Two-factor sign-in ───────────────────────────────────────────────── */}
        <FoldSection
          id="two-factor"
          index={6}
          label="Two-factor sign-in"
          pick={twoFactor.status.status === "ready" ? (twoFactorOn ? "On" : "Off") : undefined}
          mini={<SutaeruIcon name="lock" signal={false} />}
        >
          {twoFactor.status.status === "loading" && <LoadingRows />}
          {twoFactor.status.status === "error" && <LoadError onRetry={props.onTwoFactorRetry} />}
          {twoFactor.status.status === "ready" && (
            <>
              <div className="toggle-row" style={{ borderTop: 0 }}>
                <div className="tx">
                  <b>Two-factor sign-in</b>
                  <small>
                    {twoFactorOn
                      ? "On. Sign in needs your password and a 6 digit code."
                      : "Adds a 6 digit code from your authenticator app on top of your password."}
                  </small>
                </div>
                <ToggleSwitch
                  checked={twoFactorOn}
                  label="Two-factor sign-in"
                  reduceMotion={reduceMotion}
                  disabled={twoFactor.busy}
                  onChange={(next) => {
                    props.onTwoFactorToggle(next);
                  }}
                />
              </div>

              {twoFactor.error && (
                <p className="set-alert" role="alert">
                  {twoFactor.error}
                </p>
              )}

              {twoFactor.setup && (
                <div className="panel set-panel" style={{ marginTop: 18, padding: 18 }}>
                  <FocusBrackets className={twoFactor.error ? "show tight alert" : "show tight"} />
                  <p className="set-note">Open your authenticator app, add Sutaeru, and scan this code.</p>
                  <img
                    className="set-qr"
                    src={twoFactor.setup.qrDataUrl}
                    alt="Scan this code with your authenticator app"
                    width={176}
                    height={176}
                  />
                  <div className="set-key">
                    <span className="mono">Can&apos;t scan? Enter this key</span>
                    <div className="between">
                      <code className="set-key-value">{twoFactor.setup.secret}</code>
                      <button type="button" className="btn" onClick={props.onTwoFactorCopyKey}>
                        Copy key
                        <SutaeruIcon name="copy" className="ico" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(twoFactor.setup || twoFactor.turningOff) && (
                <form
                  className="set-field-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    props.onTwoFactorSubmit();
                  }}
                >
                  <label className="set-field">
                    <span className="mono">{twoFactor.turningOff ? "Code to confirm" : "Authentication code"}</span>
                    <input
                      className="set-input"
                      data-testid={twoFactor.turningOff ? "input-2fa-disable-code" : "input-2fa-confirm-code"}
                      autoFocus
                      value={twoFactor.token}
                      onChange={(event) => props.onTwoFactorTokenChange(event.target.value)}
                      inputMode="numeric"
                      autoComplete={twoFactor.setup ? "one-time-code" : "off"}
                      maxLength={6}
                      placeholder="000000"
                    />
                  </label>
                  <button type="submit" className="btn" disabled={twoFactor.busy || twoFactor.token.length !== 6}>
                    {twoFactor.busy ? "Working…" : twoFactor.turningOff ? "Turn off" : "Confirm"}
                  </button>
                  <button type="button" className="btn ghost" disabled={twoFactor.busy} onClick={props.onTwoFactorCancel}>
                    Cancel
                  </button>
                </form>
              )}

              {!twoFactor.setup && !twoFactor.turningOff &&
                (twoFactorOn ? (
                  <button type="button" className="btn ghost" onClick={() => props.onTwoFactorToggle(false)}>
                    Turn off
                  </button>
                ) : (
                  <button type="button" className="btn" disabled={twoFactor.busy} onClick={() => props.onTwoFactorToggle(true)}>
                    {twoFactor.busy ? "Working…" : "Turn on"}
                  </button>
                ))}
            </>
          )}
        </FoldSection>

        {/* ── Plan and usage ───────────────────────────────────────────────────── */}
        <FoldSection
          id="plan"
          index={7}
          label="Plan and usage"
          pick={plan.status.status === "ready" && plan.status.data ? `${titleCase(plan.status.data.tier)} plan` : undefined}
          mini={<SutaeruIcon name="plan" signal={false} />}
        >
          {plan.status.status === "loading" && <LoadingRows />}
          {plan.status.status === "error" && <LoadError onRetry={props.onPlanRetry} />}
          {plan.status.status === "ready" &&
            (plan.status.data ? (
              <>
                <p
                  className="tnum"
                  style={{ font: "800 34px/1 var(--disp)", letterSpacing: "-.03em", margin: "14px 0 4px" }}
                >
                  {titleCase(plan.status.data.tier)} plan
                  {plan.status.data.trialDaysLeft !== null && (
                    <span style={{ color: "var(--quiet)", fontSize: 22 }}>
                      {" "}
                      · {plan.status.data.trialDaysLeft} days left
                    </span>
                  )}
                </p>
                <div className="storage set-meters" style={{ padding: 0, margin: "12px 0 0" }}>
                  {plan.status.data.meters.map((meter) => (
                    <div key={meter.label}>
                      <div className="between">
                        <span className="mono">{meter.label}</span>
                        <span className="mono ink tnum">
                          {meter.used} / {meter.limit}
                        </span>
                      </div>
                      <Segments used={meter.used} limit={meter.limit} />
                    </div>
                  ))}
                </div>
                <p className="lede" style={{ fontSize: 14, marginTop: 12 }}>
                  Messages and Think reset daily. Tasks and voice minutes reset monthly.
                </p>
                {plan.status.data.tier === "free" && (
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: 14 }}
                    disabled={plan.trialBusy}
                    onClick={props.onStartTrial}
                  >
                    {plan.trialBusy ? "Starting…" : "Start free trial"}
                  </button>
                )}
              </>
            ) : (
              <p className="set-note">No usage yet.</p>
            ))}
        </FoldSection>

        {/* ── Models ───────────────────────────────────────────────────────────── */}
        <FoldSection
          id="models"
          index={8}
          label="Engines"
          pick={
            models.status === "ready" && models.data?.length
              ? `${models.data.filter((m) => m.hasKey).length} of ${models.data.length} ready`
              : undefined
          }
          mini={<SutaeruIcon name="models" signal={false} />}
        >
          {models.status === "loading" && <LoadingRows />}
          {models.status === "error" && <LoadError onRetry={props.onModelsRetry} />}
          {models.status === "ready" &&
            (models.data?.length ? (
              <p className="set-note">
                {models.data.every((m) => m.hasKey)
                  ? "Every engine is ready."
                  : `${models.data.filter((m) => !m.hasKey).length} engine(s) are not set up yet. Ask an admin.`}
              </p>
            ) : (
              <p className="set-note">No engines available.</p>
            ))}
        </FoldSection>

        {/* ── Purge password ───────────────────────────────────────────────────── */}
        <FoldSection
          id="purge"
          index={9}
          label="Purge password"
          pick={purge.status.status === "ready" ? (purge.status.data ? "Set" : "Not set") : undefined}
          mini={<SutaeruIcon name="lock" signal={false} />}
        >
          {purge.status.status === "loading" && <LoadingRows />}
          {purge.status.status === "error" && <LoadError onRetry={props.onPurgeRetry} />}
          {purge.status.status === "ready" && (
            <>
              <p className="set-note">
                {purge.status.data
                  ? "A purge password is set. Enter a new one to replace it."
                  : "Set a password required before wiping your data."}
              </p>
              <form
                className="set-field-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (purge.password.length >= 4) props.onPurgeSave();
                }}
              >
                <label className="set-field">
                  <span className="sr">New purge password</span>
                  <input
                    className="set-input"
                    type="password"
                    minLength={4}
                    maxLength={128}
                    value={purge.password}
                    onChange={(event) => props.onPurgePasswordChange(event.target.value)}
                    placeholder="At least 4 characters"
                  />
                </label>
                <button type="submit" className="btn" disabled={purge.busy || purge.password.length < 4}>
                  {purge.busy ? "Saving…" : "Save"}
                </button>
              </form>
            </>
          )}
        </FoldSection>

        {/* ── Connections, Skills & Memories ───────────────────────────────────── */}
        <FoldSection id="connections" index={10} label="Connections" pick="Linked services" mini={<SutaeruIcon name="connections" signal={false} />}>
          <div className="between">
            <p className="set-note">See which services are connected. Keys stay on the server.</p>
            <Link href="/connections" className="btn">
              Open
              <SutaeruIcon name="arrow" className="ico" />
            </Link>
          </div>
          <div className="you-links-row">
            <Link href="/memories" className="btn ghost">
              Memories ({counts.memories})
            </Link>
            <Link href="/skills" className="btn ghost">
              Skills ({counts.skills})
            </Link>
            <Link href="/identity" className="btn ghost">
              Identity profile
            </Link>
          </div>
        </FoldSection>
      </FoldGroup>
    </section>
  );
}

/** The tier name arrives lower-case from the server; the fold shows it capitalised. */
function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
