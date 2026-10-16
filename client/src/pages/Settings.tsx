/**
 * Settings — the container for the Quiet You board and SettingsView.
 *
 * `components/settings/SettingsView.tsx` is the ported Quiet You + Settings screen and takes
 * everything through props. This file is where those props come from: the appearance
 * and voice preferences from `lib/theme.ts` (localStorage, applied to <html>), and the
 * account / identity / stats / two-factor / plan / models / purge data from tRPC.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { navigateWithTransition } from "@/lib/transitions";
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
  type IdentityProfile,
  type IdentityState,
  type ModelInfo,
  type PlanInfo,
  type PurgeState,
  type Resource,
  type TwoFactorSetup,
  type TwoFactorState,
  type UsageMeter,
  type YouStats,
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
  const [, navigate] = useLocation();

  /* ── Preferences (localStorage via lib/theme.ts) ──────────────────────────────── */

  const [theme, setTheme] = useState<ThemeChoice>(() => readThemeChoice());
  const [backgroundArt, setBackgroundArtState] = useState<boolean>(() => readBackgroundArt());
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => readReduceMotion());
  const [artIntensity, setArtIntensityState] = useState<number>(() => readArtIntensity());
  const [voice, setVoice] = useState<VoiceStyle>(() => readVoiceStyle());

  /* ── Server data ──────────────────────────────────────────────────────────────── */

  const me = t.auth.me.useQuery(undefined, { retry: false });
  const identityQuery = trpc.identity.get.useQuery(undefined, { retry: false });
  const identityStats = trpc.identity.getStats.useQuery(undefined, { retry: false });
  const quota = t.kemma.quota.useQuery(undefined, { retry: false });
  const availableModels = t.kemma.availableModels.useQuery(undefined, { retry: false });
  const hasPurgePassword = t.kemma.hasPurgePassword.useQuery(undefined, { retry: false });

  const [password, setPassword] = useState("");

  /* ── Identity form state & mutations ──────────────────────────────────────────── */

  const utils = trpc.useUtils();
  const [identityDraft, setIdentityDraft] = useState<IdentityProfile>({
    handle: "",
    displayName: "",
    bio: "",
    avatarUrl: "",
    primaryLanguage: "",
    personalityTraits: [],
    roleLabel: "Owner",
  });
  const [traitInput, setTraitInput] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    const id = identityQuery.data;
    if (id) {
      setIdentityDraft({
        handle: id.handle ?? "",
        displayName: id.displayName ?? "",
        bio: id.bio ?? "",
        avatarUrl: id.avatarUrl ?? "",
        primaryLanguage: id.primaryLanguage ?? "",
        personalityTraits: Array.isArray(id.personalityTraits) ? id.personalityTraits : [],
        roleLabel: "Owner",
      });
    }
  }, [identityQuery.data]);

  const uploadAvatarMutation = trpc.settings.uploadAvatar.useMutation({
    onSuccess: (data) => {
      setIdentityDraft((prev) => ({ ...prev, avatarUrl: data.url }));
      toast.success("Avatar uploaded!");
      void utils.identity.get.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to upload avatar.");
    },
  });

  const handleAvatarFile = async (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      toast.error("Please select a JPEG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5 MB.");
      return;
    }
    setUploadingAvatar(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);
      await uploadAvatarMutation.mutateAsync({
        base64,
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const upsertIdentity = trpc.identity.upsert.useMutation({
    onSuccess: () => {
      toast.success("Identity saved successfully!");
      void utils.identity.get.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save identity.");
    },
  });

  const handleIdentitySave = () => {
    upsertIdentity.mutate({
      handle: identityDraft.handle || undefined,
      displayName: identityDraft.displayName || undefined,
      bio: identityDraft.bio || undefined,
      avatarUrl: identityDraft.avatarUrl || undefined,
      primaryLanguage: identityDraft.primaryLanguage || undefined,
      personalityTraits: identityDraft.personalityTraits.length > 0 ? identityDraft.personalityTraits : undefined,
    });
  };

  const handleTraitAdd = () => {
    const trimmed = traitInput.trim();
    if (!trimmed) return;
    if (identityDraft.personalityTraits.includes(trimmed)) {
      setTraitInput("");
      return;
    }
    if (identityDraft.personalityTraits.length >= 10) {
      toast.error("Maximum 10 personality traits allowed.");
      return;
    }
    setIdentityDraft((prev) => ({
      ...prev,
      personalityTraits: [...prev.personalityTraits, trimmed],
    }));
    setTraitInput("");
  };

  const handleTraitRemove = (trait: string) => {
    setIdentityDraft((prev) => ({
      ...prev,
      personalityTraits: prev.personalityTraits.filter((t) => t !== trait),
    }));
  };

  /* ── Trial & purge mutations ──────────────────────────────────────────────────── */

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

  const stats: Resource<YouStats> = resource<YouStats>(identityStats, (data) => ({
    memories: data?.memoriesCount ?? 0,
    skills: data?.skillsCount ?? 0,
    connections: data?.connectionsCount ?? 0,
  }));

  const identityState: IdentityState = {
    status: resource<IdentityProfile>(identityQuery, () => identityDraft),
    traitInput,
    uploadingAvatar,
    saving: upsertIdentity.isPending,
  };

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
      stats={stats}
      identity={identityState}
      twoFactor={twoFactor}
      plan={{ status: resource<PlanInfo>(quota, () => plan), trialBusy: trial.isPending }}
      models={resource<ModelInfo[]>(availableModels, (data) => (Array.isArray(data) ? data : null))}
      purge={purge}
      onBack={() => navigateWithTransition(navigate, "/chat")}
      onStatsRetry={() => void identityStats.refetch()}
      onIdentityChange={(patch) => setIdentityDraft((prev) => ({ ...prev, ...patch }))}
      onIdentityTraitInputChange={setTraitInput}
      onIdentityTraitAdd={handleTraitAdd}
      onIdentityTraitRemove={handleTraitRemove}
      onIdentityAvatarFile={(file) => void handleAvatarFile(file)}
      onIdentityAvatarRemove={() => setIdentityDraft((prev) => ({ ...prev, avatarUrl: "" }))}
      onIdentitySave={handleIdentitySave}
      onIdentityRetry={() => void identityQuery.refetch()}
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
