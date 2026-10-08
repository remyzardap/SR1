/**
 * Settings — the container.
 *
 * `components/settings/SettingsView.tsx` is the ported prototype screen and takes
 * everything through props. This file is where those props come from: the appearance
 * and voice preferences from `lib/theme.ts` (localStorage, applied to <html>), and the
 * account / two-factor / plan / models / purge data from tRPC.
 */

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  readArtIntensity,
  readBackgroundArt,
  readReduceMotion,
  readThemeChoice,
  readVoiceStyle,
  setArtIntensity,
  setBackgroundArt,
  setReduceMotion,
  setThemeChoice,
  setVoiceStyle,
  type ThemeChoice,
  type VoiceStyle,
} from "@/lib/theme";
import {
  SettingsView,
  type AccountInfo,
  type ModelInfo,
  type PlanInfo,
  type PurgeState,
  type Resource,
  type TwoFactorSetup,
  type TwoFactorState,
  type UsageMeter,
} from "@/components/settings/SettingsView";

export const PROVIDERS = ["Gemini 3 Flash (Preview)"];

const t = trpc as any;

/** Maps a tRPC query onto the view's loading / error / ready shape. */
function resource<T>(query: any, pick?: (data: any) => T | null): Resource<T> {
  if (query.isLoading) return { status: "loading" };
  if (query.isError) return { status: "error" };
  return { status: "ready", data: pick ? pick(query.data) : ((query.data ?? null) as T | null) };
}

export default function Settings() {
  /* ── Preferences (localStorage via lib/theme.ts) ──────────────────────────────── */

  const [theme, setTheme] = useState<ThemeChoice>(() => readThemeChoice());
  const [backgroundArt, setBackgroundArtState] = useState<boolean>(() => readBackgroundArt());
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => readReduceMotion());
  const [artIntensity, setArtIntensityState] = useState<number>(() => readArtIntensity());
  const [voice, setVoice] = useState<VoiceStyle>(() => readVoiceStyle());

  /* ── Server data ──────────────────────────────────────────────────────────────── */

  const me = t.auth.me.useQuery(undefined, { retry: false });
  const quota = t.kemma.quota.useQuery(undefined, { retry: false });
  const availableModels = t.kemma.availableModels.useQuery(undefined, { retry: false });
  const hasPurgePassword = t.kemma.hasPurgePassword.useQuery(undefined, { retry: false });

  const [password, setPassword] = useState("");

  const trial = t.kemma.activateTrial.useMutation({
    onSuccess: () => {
      toast.success("Trial started");
      quota.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setPw = t.kemma.setPurgePassword.useMutation({
    onSuccess: () => {
      toast.success("Purge password saved");
      setPassword("");
      hasPurgePassword.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ── Two-factor sign-in ───────────────────────────────────────────────────────── */

  const utils = trpc.useUtils();
  const twoFactorStatus = t.auth.get2faStatus.useQuery(undefined, { retry: false });
  // The setup key is held in component state only: it is shown on screen, copied on
  // request, and dropped as soon as setup is confirmed or cancelled.
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [turningOff, setTurningOff] = useState(false);

  const clearTwoFactor = () => {
    setSetup(null);
    setToken("");
    setError("");
    setTurningOff(false);
  };

  const start2fa = t.auth.setup2fa.useMutation({
    onSuccess: (data: TwoFactorSetup) => {
      setSetup(data);
      setToken("");
      setError("");
    },
    onError: (e: Error) => toast.error(e.message || "Could not start setup."),
  });
  const confirm2fa = t.auth.verify2fa.useMutation({
    onSuccess: () => {
      clearTwoFactor();
      toast.success("Two-factor is on");
      // Write the new state straight into the query so the card flips to the on
      // state at once instead of showing "Turn on" until the refetch lands.
      utils.auth.get2faStatus.setData(undefined, (prev: any) => ({ ...prev, enabled: true }));
      void twoFactorStatus.refetch();
    },
    onError: (e: Error) => setError(e.message || "That code did not work. Please try again."),
  });
  const disable2fa = t.auth.disable2fa.useMutation({
    onSuccess: () => {
      clearTwoFactor();
      toast.success("Two-factor is off");
      utils.auth.get2faStatus.setData(undefined, (prev: any) => ({ ...prev, enabled: false }));
      void twoFactorStatus.refetch();
    },
    onError: (e: Error) => setError(e.message || "That code did not work. Please try again."),
  });

  const twoFactorBusy = start2fa.isPending || confirm2fa.isPending || disable2fa.isPending;

  const submitTwoFactorToken = () => {
    if (token.length !== 6 || twoFactorBusy) return;
    setError("");
    if (turningOff) disable2fa.mutate({ token });
    else confirm2fa.mutate({ token });
  };

  const copySetupKey = async () => {
    const key = setup?.secret;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      toast.success("Key copied");
    } catch {
      toast.error("Could not copy. Select the key and copy it by hand.");
    }
  };

  /* ── The props the view renders ───────────────────────────────────────────────── */

  const meters: UsageMeter[] | null = quota.data
    ? [
        { label: "Messages today", used: quota.data.messages.used, limit: quota.data.messages.limit },
        { label: "Tasks this month", used: quota.data.tasks.used, limit: quota.data.tasks.limit },
        { label: "Think today", used: quota.data.think.used, limit: quota.data.think.limit },
        { label: "Voice minutes this month", used: quota.data.voice.used, limit: quota.data.voice.limit },
      ]
    : null;

  const plan: PlanInfo | null = quota.data
    ? { tier: quota.data.tier, trialDaysLeft: quota.data.trial?.daysLeft ?? null, meters: meters ?? [] }
    : null;

  const twoFactor: TwoFactorState = {
    status: resource<boolean>(twoFactorStatus, (data) => !!data?.enabled),
    setup,
    token,
    error,
    turningOff,
    busy: twoFactorBusy,
  };

  const purge: PurgeState = {
    status: resource<boolean>(hasPurgePassword, (data) => !!data?.hasPassword),
    password,
    busy: setPw.isPending,
  };

  return (
    <SettingsView
      theme={theme}
      backgroundArt={backgroundArt}
      reduceMotion={reduceMotion}
      artIntensity={artIntensity}
      voice={voice}
      account={resource<AccountInfo>(me, (data) => (data ? { name: data.name ?? "", email: data.email ?? "" } : null))}
      twoFactor={twoFactor}
      plan={{ status: resource<PlanInfo>(quota, () => plan), trialBusy: trial.isPending }}
      models={resource<ModelInfo[]>(availableModels, (data) => (Array.isArray(data) ? data : null))}
      purge={purge}
      onThemeChange={(next) => {
        setTheme(next);
        setThemeChoice(next);
      }}
      onBackgroundArtChange={(next) => {
        setBackgroundArtState(next);
        setBackgroundArt(next);
      }}
      onReduceMotionChange={(next) => {
        setReduceMotionState(next);
        setReduceMotion(next);
      }}
      onArtIntensityChange={(next) => {
        setArtIntensityState(next);
        setArtIntensity(next);
      }}
      onVoiceChange={(next) => {
        setVoice(next);
        setVoiceStyle(next);
      }}
      onAccountRetry={() => me.refetch()}
      onTwoFactorToggle={(next) => {
        setError("");
        if (next) start2fa.mutate();
        else setTurningOff(true);
      }}
      onTwoFactorTokenChange={(next) => {
        setToken(next.replace(/\D/g, "").slice(0, 6));
        setError("");
      }}
      onTwoFactorSubmit={submitTwoFactorToken}
      onTwoFactorCancel={clearTwoFactor}
      onTwoFactorCopyKey={() => void copySetupKey()}
      onTwoFactorRetry={() => twoFactorStatus.refetch()}
      onPlanRetry={() => quota.refetch()}
      onStartTrial={() => trial.mutate()}
      onModelsRetry={() => availableModels.refetch()}
      onPurgePasswordChange={setPassword}
      onPurgeSave={() => setPw.mutate({ password })}
      onPurgeRetry={() => hasPurgePassword.refetch()}
    />
  );
}
