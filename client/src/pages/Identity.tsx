import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  User,
  Loader2,
  Save,
  AtSign,
  Plus,
  X,
  Globe,
  Sparkles,
  Brain,
  MessageSquare,
  Users,
  Upload,
  Camera,
} from "lucide-react";

const LANGUAGES = [
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
];

export default function Identity() {
  useSeoMeta({ title: "Identity", path: "/identity" });

  const utils = trpc.useUtils();

  // ─── Fetch identity ────────────────────────────────────────────────────────
  const { data: identity, isLoading } = trpc.identity.get.useQuery();
  const { data: stats } = trpc.identity.getStats.useQuery();

  // ─── Form state ────────────────────────────────────────────────────────────
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [primaryLanguage, setPrimaryLanguage] = useState("");
  const [personalityTraits, setPersonalityTraits] = useState<string[]>([]);
  const [traitInput, setTraitInput] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ─── Avatar upload mutation ────────────────────────────────────────────────
  const uploadAvatarMutation = trpc.settings.uploadAvatar.useMutation({
    onSuccess: (data) => {
      setAvatarUrl(data.url);
      toast.success("Avatar uploaded!");
      utils.identity.get.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to upload avatar.");
    },
  });

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      toast.error("Please select a JPEG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5 MB.");
      return;
    }
    setIsUploadingAvatar(true);
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
      setIsUploadingAvatar(false);
      // Reset file input so same file can be re-selected
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  // ─── Pre-fill form when identity loads ────────────────────────────────────
  useEffect(() => {
    if (identity) {
      setHandle(identity.handle ?? "");
      setDisplayName(identity.displayName ?? "");
      setBio(identity.bio ?? "");
      setAvatarUrl(identity.avatarUrl ?? "");
      setPrimaryLanguage(identity.primaryLanguage ?? "");
      setPersonalityTraits(
        Array.isArray(identity.personalityTraits) ? identity.personalityTraits : []
      );
    }
  }, [identity]);

  // ─── Upsert mutation ───────────────────────────────────────────────────────
  const upsertMutation = trpc.identity.upsert.useMutation({
    onSuccess: () => {
      toast.success("Identity saved successfully!");
      utils.identity.get.invalidate();
      utils.agent.context.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save identity.");
    },
  });

  const handleSave = () => {
    upsertMutation.mutate({
      handle: handle || undefined,
      displayName: displayName || undefined,
      bio: bio || undefined,
      avatarUrl: avatarUrl || undefined,
      primaryLanguage: primaryLanguage || undefined,
      personalityTraits: personalityTraits.length > 0 ? personalityTraits : undefined,
    });
  };

  // ─── Personality trait helpers ─────────────────────────────────────────────
  const addTrait = () => {
    const trimmed = traitInput.trim();
    if (!trimmed) return;
    if (personalityTraits.includes(trimmed)) {
      setTraitInput("");
      return;
    }
    if (personalityTraits.length >= 10) {
      toast.error("Maximum 10 personality traits allowed.");
      return;
    }
    setPersonalityTraits((prev) => [...prev, trimmed]);
    setTraitInput("");
  };

  const removeTrait = (trait: string) => {
    setPersonalityTraits((prev) => prev.filter((t) => t !== trait));
  };

  const handleTraitKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTrait();
    }
    if (e.key === "Backspace" && traitInput === "" && personalityTraits.length > 0) {
      setPersonalityTraits((prev) => prev.slice(0, -1));
    }
  };

  // ─── Avatar initials ───────────────────────────────────────────────────────
  const getInitials = () => {
    if (displayName) return displayName.slice(0, 2).toUpperCase();
    if (handle) return handle.slice(0, 2).toUpperCase();
    return "SA";
  };

  const isNewIdentity = !identity?.displayName && !identity?.handle;

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const statItems = [
    { icon: Brain, label: "Skills", value: stats?.skillsCount ?? 0, color: "var(--accent-color)", dim: "var(--accent-dim)", border: "var(--accent-border)" },
    { icon: MessageSquare, label: "Memories", value: stats?.memoriesCount ?? 0, color: "var(--secondary-color)", dim: "var(--secondary-dim)", border: "var(--secondary-border)" },
    { icon: Users, label: "Connections", value: stats?.connectionsCount ?? 0, color: "#7aaaf0", dim: "rgba(122,170,240,0.10)", border: "rgba(122,170,240,0.18)" },
  ];

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--accent-color)" }} />
          <span className="text-sm">Loading identity...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8 space-y-6">

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {statItems.map(({ icon: Icon, label, value, color, dim, border }) => (
          <div
            key={label}
            className="glass-card p-4 flex sm:flex-col items-center sm:items-center gap-3 sm:gap-0 sm:text-center"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center sm:mx-auto sm:mb-3 shrink-0"
              style={{ background: dim, border: `1px solid ${border}` }}
            >
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <div className="flex sm:flex-col items-baseline sm:items-center gap-2 sm:gap-0">
              <p className="text-2xl font-light" style={{ color }}>{value}</p>
              <p
                className="text-xs uppercase tracking-widest font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                {label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div>
        <h1
          className="text-xl sm:text-2xl font-bold tracking-tight"
          style={{ color: "var(--foreground)" }}
        >
          {isNewIdentity ? "Create Your Identity" : "Identity Profile"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {isNewIdentity
            ? "Set up your Sutaeru agent identity to personalise your AI experience."
            : "Manage your Sutaeru agent identity and public profile."}
        </p>
      </div>

      {/* ── Profile preview ──────────────────────────────────────────────────── */}
      <div
        className="glass-card p-6"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 0% 50%, var(--accent-dim) 0%, transparent 60%), var(--glass-bg)",
        }}
      >
        <p className="label-trity mb-4">Preview</p>
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-2xl flex items-center justify-center text-lg font-bold overflow-hidden"
            style={{
              background: "var(--accent-dim)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent-color)",
              boxShadow: "0 0 16px var(--accent-glow)",
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              getInitials()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="font-semibold text-base truncate"
              style={{ color: "var(--foreground)" }}
            >
              {displayName || (
                <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>
                  Your Display Name
                </span>
              )}
            </h3>
            <div
              className="flex items-center gap-1 text-sm mt-0.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              <AtSign className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {handle || (
                  <span style={{ fontStyle: "italic" }}>username</span>
                )}
              </span>
            </div>
            {primaryLanguage && (
              <div
                className="flex items-center gap-1 text-xs mt-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                <Globe className="h-3 w-3 shrink-0" />
                <span>
                  {LANGUAGES.find((l) => l.value === primaryLanguage)?.label ?? primaryLanguage}
                </span>
              </div>
            )}
            <p
              className="mt-2 text-sm line-clamp-3"
              style={{ color: "var(--muted-foreground)" }}
            >
              {bio || (
                <span style={{ fontStyle: "italic" }}>
                  No bio yet. Add one below to tell others about your agent.
                </span>
              )}
            </p>
            {personalityTraits.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {personalityTraits.map((trait) => (
                  <span
                    key={trait}
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                    style={{
                      background: "var(--accent-dim)",
                      border: "1px solid var(--accent-border)",
                      color: "var(--accent-light)",
                    }}
                  >
                    {trait}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Edit form ────────────────────────────────────────────────────────── */}
      <div className="glass-card p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
            {isNewIdentity ? "Create Profile" : "Edit Profile"}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {isNewIdentity
              ? "Fill in the details below to create your agent identity."
              : "Update your agent's identity information."}
          </p>
        </div>

        {/* Avatar Upload */}
        <div className="space-y-2">
          <Label
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            Avatar
          </Label>
          <div className="flex items-center gap-4">
            {/* Preview */}
            <div
              className="h-16 w-16 shrink-0 rounded-2xl flex items-center justify-center text-lg font-bold overflow-hidden"
              style={{
                background: "var(--accent-dim)",
                border: "1px solid var(--accent-border)",
                color: "var(--accent-color)",
              }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar preview" className="w-full h-full object-cover" />
              ) : (
                <Camera className="h-5 w-5" style={{ color: "var(--accent-color)" }} />
              )}
            </div>
            {/* Upload button */}
            <div className="flex flex-col gap-1.5">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--accent-dim)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent-color)",
                }}
              >
                {isUploadingAvatar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {isUploadingAvatar ? "Uploading…" : "Upload image"}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => { setAvatarUrl(""); }}
                  className="text-xs transition-colors"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Remove avatar
                </button>
              )}
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                JPG, PNG, GIF or WebP · max 5 MB
              </p>
            </div>
          </div>
        </div>

        <hr className="divider-trity" />

        {/* Handle */}
        <div className="space-y-2">
          <Label
            htmlFor="handle"
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            Handle
          </Label>
          <div className="relative">
            <AtSign
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: "var(--muted-foreground)" }}
            />
            <Input
              id="handle"
              className="pl-9 input-glass"
              placeholder="username"
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace(/[^a-z0-9_-]/gi, ""))}
              maxLength={64}
            />
          </div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Your unique @handle. Letters, numbers, underscores and hyphens only.
          </p>
        </div>

        {/* Display Name */}
        <div className="space-y-2">
          <Label
            htmlFor="displayName"
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            Display Name
          </Label>
          <div className="relative">
            <User
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: "var(--muted-foreground)" }}
            />
            <Input
              id="displayName"
              className="pl-9 input-glass"
              placeholder="Your Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={255}
            />
          </div>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label
            htmlFor="bio"
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            Bio
          </Label>
          <Textarea
            id="bio"
            placeholder="Tell others about your agent — your goals, expertise, or what makes you unique..."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            className="input-glass resize-none"
          />
        </div>

        <hr className="divider-trity" />

        {/* Primary Language */}
        <div className="space-y-2">
          <Label
            htmlFor="primaryLanguage"
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            Primary Language
          </Label>
          <Select value={primaryLanguage} onValueChange={setPrimaryLanguage}>
            <SelectTrigger id="primaryLanguage" className="input-glass w-full">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                <SelectValue placeholder="Select a language..." />
              </div>
            </SelectTrigger>
            <SelectContent
              style={{
                background: "rgba(14,14,14,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(20px)",
              }}
            >
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            The language your agent primarily communicates in.
          </p>
        </div>

        {/* Personality Traits */}
        <div className="space-y-2">
          <Label
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            Personality Traits
          </Label>
          <div
            className="flex flex-wrap items-center gap-1.5 min-h-10 px-3 py-2 transition-all"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: "12px",
              backdropFilter: "blur(12px)",
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor =
                "var(--accent-border)";
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor =
                "rgba(255,255,255,0.10)";
            }}
          >
            {personalityTraits.map((trait) => (
              <span
                key={trait}
                className="inline-flex items-center gap-1 rounded-full text-xs px-3 py-1"
                style={{
                  background: "var(--accent-dim)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent-light)",
                }}
              >
                {trait}
                <button
                  type="button"
                  onClick={() => removeTrait(trait)}
                  className="transition-colors hover:opacity-80"
                  aria-label={`Remove ${trait}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={traitInput}
              onChange={(e) => setTraitInput(e.target.value)}
              onKeyDown={handleTraitKeyDown}
              placeholder={
                personalityTraits.length === 0
                  ? "Type a trait and press Enter..."
                  : personalityTraits.length < 10
                  ? "Add another..."
                  : ""
              }
              disabled={personalityTraits.length >= 10}
              className="flex-1 min-w-[6rem] bg-transparent text-sm outline-none"
              style={{ color: "var(--foreground)" }}
            />
            {traitInput.trim() && (
              <button
                type="button"
                onClick={addTrait}
                className="shrink-0 transition-colors"
                style={{ color: "var(--muted-foreground)" }}
                aria-label="Add trait"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Press Enter or , to add. Up to 10 traits.
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={upsertMutation.isPending}
            className="btn-primary-teal px-6 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {upsertMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isNewIdentity ? (
              <>
                <Sparkles className="h-4 w-4" />
                Create Identity
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
