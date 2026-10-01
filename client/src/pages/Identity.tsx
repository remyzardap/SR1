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
import { Loader2, Upload } from "lucide-react";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { SutaeruGlyph } from "@/components/SutaeruGlyph";

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
    { label: "Skills", value: stats?.skillsCount ?? 0 },
    { label: "Memories", value: stats?.memoriesCount ?? 0 },
    { label: "Connections", value: stats?.connectionsCount ?? 0 },
  ];

  const languageLabel = primaryLanguage
    ? LANGUAGES.find((l) => l.value === primaryLanguage)?.label ?? primaryLanguage
    : "";

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="sk-page">
        <div className="sk-card sk-empty max-w-md">
          <span className="sk-label">Identity</span>
          <p className="sk-empty-text">Loading identity...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sk-page">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="sk-header">
        <div>
          <h1 className="sk-h1">
            {isNewIdentity ? "Create Your Identity" : "Identity Profile"}
          </h1>
          <p className="sk-sub">
            {isNewIdentity
              ? "Set up your Sutaeru agent identity to personalise your AI experience."
              : "Manage your Sutaeru agent identity and public profile."}
          </p>
        </div>
        <div className="sk-actions">
          <button
            onClick={handleSave}
            disabled={upsertMutation.isPending}
            className="sk-btn"
          >
            {upsertMutation.isPending
              ? "Saving..."
              : isNewIdentity
              ? "Create Identity"
              : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ── Assistant preview (dark feature card) ───────────────────────── */}
        <aside className="sk-card-dark self-start">
          <p className="sk-label">Preview</p>

          {/* Glyph / avatar block */}
          <div className="mt-4 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[20px] bg-white/[0.06]">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : displayName || handle ? (
              <span className="text-3xl font-semibold text-[var(--art-paper)]">
                {getInitials()}
              </span>
            ) : (
              <SutaeruGlyph className="w-40 text-[var(--art-paper)]" />
            )}
          </div>

          <div className="mt-6">
            {/* one-off size: the reference renders the assistant name larger than .sk-dark-title */}
            <h2 className="sk-dark-title" style={{ fontSize: "30px" }}>
              {displayName || (
                <span className="font-normal italic text-[rgba(247,246,242,0.5)]">
                  Your Display Name
                </span>
              )}
            </h2>
            <p className="sk-dark-sub">
              @
              {handle || (
                <span className="italic text-[rgba(247,246,242,0.5)]">username</span>
              )}
            </p>
          </div>

          {/* Status line */}
          <div className="sk-row mt-5">
            <span className="sk-dot sk-dot-orange" />
            <span className="sk-label">
              {statItems.map((s) => `${s.value} ${s.label}`).join(" · ")}
            </span>
          </div>

          <div className="mt-4">
            <p className="sk-dark-sub line-clamp-3">
              {bio || (
                <span className="italic text-[rgba(247,246,242,0.5)]">
                  No bio yet. Add one below to tell others about your agent.
                </span>
              )}
            </p>
          </div>

          <div className="my-6">
            <hr className="sk-divider-dark" />
          </div>

          {personalityTraits.length > 0 && (
            <div className="mb-6">
              <p className="sk-label">Personality</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {personalityTraits.map((trait) => (
                  <span key={trait} className="sk-chip">
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          )}

          {languageLabel && (
            <div>
              <p className="sk-label">Languages</p>
              <div className="mt-2">
                <p className="sk-dark-sub">{languageLabel}</p>
              </div>
            </div>
          )}
        </aside>

        {/* ── Editor sections ─────────────────────────────────────────────── */}
        <div className="sk-stack">
          {/* Profile */}
          <section className="sk-card">
            <p className="sk-label">Profile</p>
            <h2 className="mt-3 text-[22px] font-semibold tracking-tight">
              {isNewIdentity ? "Create Profile" : "Edit Profile"}
            </h2>
            <p className="sk-sub">
              {isNewIdentity
                ? "Fill in the details below to create your agent identity."
                : "Update your agent's identity information."}
            </p>

            {/* Avatar Upload */}
            <div className="sk-field mt-7">
              <Label className="sk-label">Avatar</Label>
              <div className="sk-row">
                {/* Preview */}
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-[#F1EFEA] text-[var(--art-ink)]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar preview" className="h-full w-full object-cover" />
                  ) : (
                    <SutaeruIcon name="image" className="h-6 w-6" />
                  )}
                </div>
                {/* Upload button */}
                <div className="sk-col">
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
                    className="sk-btn sk-btn-sm self-start"
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
                      className="sk-muted min-h-11 text-sm transition-colors hover:underline"
                    >
                      Remove avatar
                    </button>
                  )}
                  <p className="sk-meta">JPG, PNG, GIF or WebP · max 5 MB</p>
                </div>
              </div>
            </div>

            <div className="my-7">
              <hr className="sk-hairline" />
            </div>

            {/* Handle */}
            <div className="sk-field">
              <Label htmlFor="handle" className="sk-label">
                Handle
              </Label>
              <Input
                id="handle"
                className="sk-input focus-visible:ring-0"
                placeholder="username"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/[^a-z0-9_-]/gi, ""))}
                maxLength={64}
              />
              <p className="sk-muted mt-2 text-xs">
                Your unique @handle. Letters, numbers, underscores and hyphens only.
              </p>
            </div>

            {/* Display Name */}
            <div className="sk-field mt-6">
              <Label htmlFor="displayName" className="sk-label">
                Display Name
              </Label>
              <Input
                id="displayName"
                className="sk-input focus-visible:ring-0"
                placeholder="Your Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={255}
              />
            </div>

            {/* Bio */}
            <div className="sk-field mt-6">
              <Label htmlFor="bio" className="sk-label">
                Bio
              </Label>
              <Textarea
                id="bio"
                placeholder="Tell others about your agent - your goals, expertise, or what makes you unique..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="sk-textarea focus-visible:ring-0"
              />
              <p className="sk-meta mt-2">{bio.length} characters</p>
            </div>

            <div className="my-7">
              <hr className="sk-hairline" />
            </div>

            {/* Primary Language */}
            <div className="sk-field">
              <Label htmlFor="primaryLanguage" className="sk-label">
                Primary Language
              </Label>
              <Select value={primaryLanguage} onValueChange={setPrimaryLanguage}>
                <SelectTrigger
                  id="primaryLanguage"
                  className="h-12 w-full rounded-[20px] border-0 bg-[var(--art-paper)] px-4 text-[15px] shadow-none data-[size=default]:h-12 focus-visible:ring-0"
                >
                  <SelectValue placeholder="Select a language..." />
                </SelectTrigger>
                <SelectContent className="rounded-[20px] border-0 bg-white shadow-lg">
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="sk-muted mt-2 text-xs">
                The language your agent primarily communicates in.
              </p>
            </div>
          </section>

          {/* Personality */}
          <section className="sk-card">
            <p className="sk-label">Personality</p>
            <div className="sk-field mt-3">
              <Label className="sk-label">Personality Traits</Label>
              <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-[20px] bg-[var(--art-paper)] px-3 py-2">
                {personalityTraits.map((trait) => (
                  <span
                    key={trait}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--art-ink)] py-1.5 pl-3.5 pr-1.5 text-xs font-medium text-[var(--art-paper)]"
                  >
                    {trait}
                    <button
                      type="button"
                      onClick={() => removeTrait(trait)}
                      className="-my-2 -mr-1.5 flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors hover:bg-white/15"
                      aria-label={`Remove ${trait}`}
                    >
                      <SutaeruIcon name="close" signal={false} className="h-3 w-3" />
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
                  className="min-w-[6rem] flex-1 bg-transparent text-sm outline-none"
                />
                {traitInput.trim() && (
                  <button
                    type="button"
                    onClick={addTrait}
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center transition-colors"
                    aria-label="Add trait"
                  >
                    <SutaeruIcon name="plus" signal={false} className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="sk-muted mt-2 text-xs">
                Press Enter or , to add. Up to 10 traits.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
