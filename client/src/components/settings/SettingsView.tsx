/**
 * Settings — the port of `VIEWS.settings` from design/sutaeru-app (app.js:1241-1326).
 *
 * Presentational only: every value comes in through props and every change goes back
 * out through a handler. Nothing here fetches or writes to storage — the container
 * that binds this to tRPC and to `lib/theme.ts` is `client/src/pages/Settings.tsx`.
 *
 * The Appearance and "How Sutaeru talks" cards are a direct port (same markup
 * structure, class names and copy). The cards the prototype faked with sample data
 * (Notifications) are gone, and the screens the app already had real data for
 * (account, two-factor, plan, models, purge, connections) are restyled into the same
 * card language.
 */

import * as React from "react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Link } from "wouter";

import { FocusBrackets } from "@/components/art/FocusBrackets";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { drawDitherRamp } from "@/lib/dither";
import type { ThemeChoice, VoiceStyle } from "@/lib/theme";

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
}

/* ── Prototype copy ─────────────────────────────────────────────────────────────── */

/** The sample answers behind the "How Sutaeru talks" sliders (app.js:1241-1244). */
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

/* ── Theme previews (app.js:1252-1258) ──────────────────────────────────────────── */

const PREVIEW_LIGHT = { bg: "#F7F6F2", card: "#FFFFFF", ink: "#242320", seg: "#DAD7CF" };
const PREVIEW_DARK = { bg: "#1C1B19", card: "#252421", ink: "#F4F2EC", seg: "#403F3A" };
type PreviewPalette = typeof PREVIEW_LIGHT;

const THEME_OPTIONS: [ThemeChoice, string][] = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "System"],
];

/** One mock screen: a title bar, a card with a line in it, a dot and the accent mark. */
function PreviewPane({ palette }: { palette: PreviewPalette }) {
  const w = 160;
  return (
    <>
      <rect x={0} y={0} width={w} height={92} fill={palette.bg} />
      <rect x={12} y={14} width={Math.min(70, w - 24)} height={8} rx={4} fill={palette.ink} />
      <rect x={12} y={30} width={w - 24} height={34} rx={8} fill={palette.card} />
      <rect x={20} y={40} width={Math.min(50, w - 40)} height={4} rx={2} fill={palette.seg} />
      <circle cx={w - 24} cy={76} r={8} fill={palette.ink} />
      <circle cx={18} cy={76} r={3} fill="#F4511E" />
    </>
  );
}

/**
 * The little mock screen inside each theme option. The System tile is the same pane
 * twice, split by a diagonal, so the tile itself shows the light/dark pairing.
 * (Ids are the prototype's: one System tile is on screen at a time.)
 */
export function ThemePreview({ kind }: { kind: ThemeChoice }) {
  if (kind === "system") {
    return (
      <svg viewBox="0 0 160 92" preserveAspectRatio="xMidYMid slice">
        <defs>
          <clipPath id="tpL">
            <path d="M0 0H100L60 92H0Z" />
          </clipPath>
          <clipPath id="tpD">
            <path d="M100 0H160V92H60Z" />
          </clipPath>
        </defs>
        <g clipPath="url(#tpL)">
          <PreviewPane palette={PREVIEW_LIGHT} />
        </g>
        <g clipPath="url(#tpD)">
          <PreviewPane palette={PREVIEW_DARK} />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 160 92" preserveAspectRatio="xMidYMid slice">
      <PreviewPane palette={kind === "dark" ? PREVIEW_DARK : PREVIEW_LIGHT} />
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
 * A card body while its data is in flight. The bar is decorative, so the word
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
      <p className="set-note">Couldn't load this right now.</p>
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

/* ── The screen ─────────────────────────────────────────────────────────────────── */

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

  const twoFactorOn = twoFactor.status.status === "ready" && !!twoFactor.status.data;

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

  return (
    <section className="view wide view-enter settings-view">
      <h1 className="title" style={{ fontSize: "clamp(40px,7vw,56px)" }}>
        Settings
      </h1>
      <p className="lede" style={{ marginTop: 8 }}>
        Make Sutaeru feel like yours. Changes apply as you make them.
      </p>

      <div className="set-grid">
        {/* ── Appearance ───────────────────────────────────────────────────────── */}
        <div className="card set-card">
          <span className="mono">Theme</span>
          <div className="themes" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map(([id, name]) => (
              <button
                key={id}
                type="button"
                className="theme-opt"
                role="radio"
                aria-checked={theme === id}
                data-theme-opt={id}
                onClick={() => onThemeChange(id)}
              >
                <span className="tp">
                  <ThemePreview kind={id} />
                </span>
                <span>{name}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 18 }}>
            <div className="toggle-row">
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
            <div className="toggle-row">
              <div className="tx">
                <b>Reduce motion</b>
                <small>Bars and dials jump to their state instead of moving</small>
              </div>
              <ToggleSwitch
                checked={reduceMotion}
                label="Reduce motion"
                reduceMotion={reduceMotion}
                onChange={onReduceMotionChange}
              />
            </div>
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
        </div>

        {/* ── How Sutaeru talks ────────────────────────────────────────────────── */}
        <div className="card set-card">
          <span className="mono">How Sutaeru talks</span>
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
          <div className="voice-sample">
            <FocusBrackets className="show tight" />
            <span className="mono">Preview · rooftop solar payback</span>
            <p style={{ opacity: fading ? 0 : 1 }}>{sample}</p>
          </div>
        </div>

        {/* ── Account ──────────────────────────────────────────────────────────── */}
        <div className="card set-card">
          <span className="mono">Account</span>
          <div style={{ marginTop: 14 }}>
            {account.status === "loading" && <LoadingRows />}
            {account.status === "error" && <LoadError onRetry={props.onAccountRetry} />}
            {account.status === "ready" &&
              (account.data ? (
                <div className="toggle-row" style={{ borderTop: 0 }}>
                  <div className="tx">
                    <b>{account.data.name || account.data.email || "Signed in"}</b>
                    {account.data.email && <small>{account.data.email}</small>}
                  </div>
                  <Link href="/identity" className="btn">
                    Edit profile
                  </Link>
                </div>
              ) : (
                <p className="set-note">Sign in to manage your account.</p>
              ))}
          </div>
        </div>

        {/* ── Two-factor sign-in ───────────────────────────────────────────────── */}
        <div className="card set-card">
          <span className="mono">Two-factor sign-in</span>
          <div style={{ marginTop: 14 }}>
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

                {!twoFactor.setup && !twoFactor.turningOff && (
                  twoFactorOn ? (
                    <button type="button" className="btn ghost" onClick={() => props.onTwoFactorToggle(false)}>
                      Turn off
                    </button>
                  ) : (
                    <button type="button" className="btn" disabled={twoFactor.busy} onClick={() => props.onTwoFactorToggle(true)}>
                      {twoFactor.busy ? "Working…" : "Turn on"}
                    </button>
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Plan and usage ───────────────────────────────────────────────────── */}
        <div className="card set-card">
          <span className="mono">Plan and usage</span>
          <div style={{ marginTop: 14 }}>
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
          </div>
        </div>

        {/* ── Models ───────────────────────────────────────────────────────────── */}
        <div className="card set-card">
          <span className="mono">Models</span>
          <div style={{ marginTop: 14 }}>
            {models.status === "loading" && <LoadingRows />}
            {models.status === "error" && <LoadError onRetry={props.onModelsRetry} />}
            {models.status === "ready" &&
              (models.data?.length ? (
                <div>
                  {models.data.map((model) => (
                    <div className="toggle-row" key={model.id}>
                      <div className="tx">
                        <b>{model.label}</b>
                      </div>
                      {model.hasKey ? <span className="tag">Ready</span> : <span className="tag quiet">Not configured</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="set-note">No models available.</p>
              ))}
          </div>
        </div>

        {/* ── Purge password ───────────────────────────────────────────────────── */}
        <div className="card set-card">
          <span className="mono">Purge password</span>
          <div style={{ marginTop: 14 }}>
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
          </div>
        </div>

        {/* ── Connections ──────────────────────────────────────────────────────── */}
        <div className="card set-card">
          <span className="mono">Connections</span>
          <div className="between" style={{ marginTop: 12 }}>
            <p className="set-note">See which services are connected. Keys stay on the server.</p>
            <Link href="/connections" className="btn">
              Open
              <SutaeruIcon name="arrow" className="ico" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The tier name arrives lower-case from the server; the card shows it capitalised. */
function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
