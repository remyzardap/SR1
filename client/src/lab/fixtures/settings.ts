/**
 * Fixtures for `/__lab/settings`.
 *
 * Lab-only: the app never imports this file. The data-heavy cards on the settings
 * screen read from tRPC, so the lab supplies its own samples — the prototype's fake
 * values where it had them (app.js:1241-1326) and the real query shapes where it did
 * not. Every state `SettingsView` can be in gets a name, so `?state=<name>` renders
 * that one on its own.
 */

import type {
  AccountInfo,
  ModelInfo,
  PlanInfo,
  PurgeState,
  Resource,
  SettingsViewProps,
  TwoFactorSetup,
  TwoFactorState,
  UsageMeter,
} from "@/components/settings/SettingsView";
import { ART_INTENSITY_DEFAULT, VOICE_DEFAULT, type ThemeChoice, type VoiceStyle } from "@/lib/theme";

/* ── Samples ────────────────────────────────────────────────────────────────────── */

function ready<T>(data: T | null): Resource<T> {
  return { status: "ready", data };
}

const ACCOUNT: AccountInfo = { name: "Rani Prameswari", email: "rani@sutaeru.app" };

/** The four meters the quota query returns, with plausible usage on each. */
const METERS: UsageMeter[] = [
  { label: "Messages today", used: 12, limit: 50 },
  { label: "Tasks this month", used: 38, limit: 50 },
  { label: "Think today", used: 3, limit: 10 },
  { label: "Voice minutes this month", used: 96, limit: 120 },
];

const PLAN: PlanInfo = { tier: "free", trialDaysLeft: null, meters: METERS };

const MODELS: ModelInfo[] = [
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", hasKey: true },
  { id: "gemini-3-pro", label: "Gemini 3 Pro", hasKey: false },
];

const OFF: TwoFactorState = {
  status: ready(false),
  setup: null,
  token: "",
  error: "",
  turningOff: false,
  busy: false,
};

/**
 * A stand-in for the server's QR: a real setup secret only exists mid-enrolment, so
 * the lab draws a plausible-looking pattern instead of shipping a picture of one.
 * Three finder rings, random modules elsewhere, deterministic so the lab does not
 * flicker between renders.
 */
const SETUP: TwoFactorSetup = {
  qrDataUrl: fakeQrDataUrl(),
  secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
};

function fakeQrDataUrl(): string {
  const N = 25;
  let seed = 0x9e3779b1;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const finder = (x: number, y: number): boolean | null => {
    for (const [cx, cy] of [
      [0, 0],
      [N - 7, 0],
      [0, N - 7],
    ]) {
      if (x >= cx && x < cx + 7 && y >= cy && y < cy + 7) {
        return Math.min(Math.min(x - cx, cx + 6 - x), Math.min(y - cy, cy + 6 - y)) !== 1;
      }
    }
    return null;
  };
  let d = "";
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const inFinder = finder(x, y);
      if (inFinder === false) continue;
      if (inFinder === true || rnd() < 0.45) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">` +
    `<rect width="${N}" height="${N}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ── Handlers ───────────────────────────────────────────────────────────────────── */

type HandlerKeys = Extract<keyof SettingsViewProps, `on${string}`>;

export type SettingsHandlers = Pick<SettingsViewProps, HandlerKeys>;
export type SettingsData = Omit<SettingsViewProps, HandlerKeys>;

/** The lab never saves anything; every control is wired to a no-op of the right shape. */
const NOOP: SettingsHandlers = {
  onThemeChange: () => {},
  onBackgroundArtChange: () => {},
  onReduceMotionChange: () => {},
  onArtIntensityChange: () => {},
  onVoiceChange: () => {},
  onAccountRetry: () => {},
  onTwoFactorToggle: () => {},
  onTwoFactorTokenChange: () => {},
  onTwoFactorSubmit: () => {},
  onTwoFactorCancel: () => {},
  onTwoFactorCopyKey: () => {},
  onTwoFactorRetry: () => {},
  onPlanRetry: () => {},
  onStartTrial: () => {},
  onModelsRetry: () => {},
  onPurgePasswordChange: () => {},
  onPurgeSave: () => {},
  onPurgeRetry: () => {},
};

/* ── States ─────────────────────────────────────────────────────────────────────── */

const BASE: SettingsData = {
  theme: "system" as ThemeChoice,
  backgroundArt: true,
  reduceMotion: false,
  artIntensity: ART_INTENSITY_DEFAULT,
  voice: { ...VOICE_DEFAULT } as VoiceStyle,
  account: ready(ACCOUNT),
  twoFactor: OFF,
  plan: { status: ready(PLAN), trialBusy: false },
  models: ready(MODELS),
  purge: { status: ready(false), password: "", busy: false },
};

/**
 * One entry per state the screen can be in. `?state=<name>` renders just that one;
 * with no `?state=` the lab renders all of them in a column.
 */
export const SETTINGS_STATES = {
  default: BASE,
  "theme-light": { ...BASE, theme: "light" },
  "theme-dark": { ...BASE, theme: "dark" },
  "art-off": { ...BASE, backgroundArt: false },
  "motion-reduced": { ...BASE, reduceMotion: true },
  "intensity-min": { ...BASE, artIntensity: 20 },
  "intensity-max": { ...BASE, artIntensity: 100 },
  "voice-min": { ...BASE, voice: { detail: 0, tone: 0 } },
  "voice-max": { ...BASE, voice: { detail: 100, tone: 100 } },
  "all-loading": {
    ...BASE,
    account: { status: "loading" },
    twoFactor: { ...OFF, status: { status: "loading" } },
    plan: { status: { status: "loading" }, trialBusy: false },
    models: { status: "loading" },
    purge: { status: { status: "loading" }, password: "", busy: false },
  },
  "all-error": {
    ...BASE,
    account: { status: "error" },
    twoFactor: { ...OFF, status: { status: "error" } },
    plan: { status: { status: "error" }, trialBusy: false },
    models: { status: "error" },
    purge: { status: { status: "error" }, password: "", busy: false },
  },
  "account-anon": { ...BASE, account: ready(null) },
  "2fa-setup": { ...BASE, twoFactor: { ...OFF, setup: SETUP, token: "123456" } },
  "2fa-verifying": { ...BASE, twoFactor: { ...OFF, setup: SETUP, token: "123456", busy: true } },
  "2fa-rejected": {
    ...BASE,
    twoFactor: { ...OFF, setup: SETUP, token: "000000", error: "That code did not work. Please try again." },
  },
  "2fa-on": { ...BASE, twoFactor: { ...OFF, status: ready(true) } },
  "2fa-disabling": { ...BASE, twoFactor: { ...OFF, status: ready(true), turningOff: true } },
  "plan-empty": { ...BASE, plan: { status: ready(null), trialBusy: false } },
  "plan-trial": { ...BASE, plan: { status: ready({ ...PLAN, trialDaysLeft: 9 }), trialBusy: false } },
  "plan-busy": { ...BASE, plan: { status: ready(PLAN), trialBusy: true } },
  "plan-pro": {
    ...BASE,
    plan: {
      status: ready({ tier: "pro", trialDaysLeft: null, meters: METERS.map((m) => ({ ...m, used: 0 })) }),
      trialBusy: false,
    },
  },
  "models-empty": { ...BASE, models: ready([]) },
  "purge-set": { ...BASE, purge: { status: ready(true), password: "solar-2026", busy: false } },
  "purge-saving": { ...BASE, purge: { status: ready(false), password: "solar-2026", busy: true } },
} satisfies Record<string, SettingsData>;

export type SettingsState = keyof typeof SETTINGS_STATES;

export const SETTINGS_STATE_NAMES = Object.keys(SETTINGS_STATES) as SettingsState[];

/** The full props for one state, no-op handlers included. */
export function settingsFixture(state: SettingsState): SettingsViewProps {
  return { ...SETTINGS_STATES[state], ...NOOP };
}
