/**
 * Identity — the agent's own profile, on the shared list pattern (no shadcn).
 *
 * The preview card stays on the left at desktop; the editor to its right is three folds —
 * Profile, Language, Personality — each naming what is set inside it when folded. Fields are
 * native inputs on the redo form styles, and the language list keeps all eighteen entries in
 * one control rather than eighteen tiles.
 */
import { useState, useEffect, useRef, type ChangeEvent, type KeyboardEvent } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { HalftoneRamp } from "@/components/art";
import { LogoMark } from "@/components/chrome/AppHeader";
import { ListFold, ListFolds, ListPage, useListFolds } from "@/components/list";
import { pickArt } from "@/lib/pickArt";
import "@/styles/identity.css";

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

const FOLD_IDS = ["profile", "language", "personality"];

/** The trait field: Enter or comma adds, Backspace on an empty box drops the last one. */
export function TraitEditor({
  traits,
  value,
  onValue,
  onAdd,
  onRemove,
  onKeyDown,
}: {
  traits: string[];
  value: string;
  onValue(next: string): void;
  onAdd(): void;
  onRemove(trait: string): void;
  onKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
}) {
  const full = traits.length >= 10;
  return (
    <>
      <div className="lst-traits">
        {traits.map((trait) => (
          <span className="lst-trait" key={trait}>
            {trait}
            <button type="button" onClick={() => onRemove(trait)} aria-label={`Remove ${trait}`}>
              <SutaeruIcon name="close" signal={false} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={traits.length === 0 ? "Type a trait and press Enter..." : full ? "" : "Add another..."}
          disabled={full}
          aria-label="Personality trait"
        />
        {value.trim() && (
          <button type="button" onClick={onAdd} aria-label="Add trait">
            <SutaeruIcon name="plus" signal={false} />
          </button>
        )}
      </div>
      <p className="lst-note">Press Enter or , to add. Up to 10 traits.</p>
    </>
  );
}

/** The avatar picker: a hidden file input, the same five-MB and format rules as before. */
export function AvatarField({
  avatarUrl,
  uploading,
  onRemove,
  onFile,
}: {
  avatarUrl: string;
  uploading: boolean;
  onRemove(): void;
  onFile(event: ChangeEvent<HTMLInputElement>): void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="lst-field">
      <span className="mono">Avatar</span>
      <div className="row wrap">
        <span className="lst-art id-avatar" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="Avatar preview" /> : <SutaeruIcon name="image" signal={false} />}
        </span>
        <div className="stack">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onFile} />
          <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload image"}
          </button>
          {avatarUrl && (
            <button type="button" className="btn ghost" onClick={onRemove}>
              Remove avatar
            </button>
          )}
        </div>
      </div>
      <p className="lst-note">JPG, PNG, GIF or WebP · max 5 MB</p>
    </div>
  );
}

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

  const handleAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
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
      if (e.target) e.target.value = "";
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
      setPersonalityTraits(Array.isArray(identity.personalityTraits) ? identity.personalityTraits : []);
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

  const statItems = [
    { label: "Skills", value: stats?.skillsCount ?? 0 },
    { label: "Memories", value: stats?.memoriesCount ?? 0 },
    { label: "Connections", value: stats?.connectionsCount ?? 0 },
  ];

  const languageLabel = primaryLanguage ? LANGUAGES.find((l) => l.value === primaryLanguage)?.label ?? primaryLanguage : "";

  const fold = useListFolds("identity", FOLD_IDS, { first: "profile" });

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <section className="view view-enter lst-page">
        <h1 className="title lst-title">Identity</h1>
        <p className="lede" style={{ marginTop: 8 }}>
          Loading identity...
        </p>
      </section>
    );
  }

  return (
    <ListPage
      title={isNewIdentity ? "Create Your Identity" : "Identity Profile"}
      lede={
        isNewIdentity
          ? "Set up your Sutaeru agent identity to personalise your AI experience."
          : "How your agent introduces itself."
      }
      fold={fold}
      wide
      className="id-view"
      actions={
        <button onClick={handleSave} disabled={upsertMutation.isPending} className="btn">
          {upsertMutation.isPending ? "Saving..." : isNewIdentity ? "Create Identity" : "Save Changes"}
        </button>
      }
    >
      <div className="lst-split">
        {/* ── Assistant preview (dark hero card) ──────────────────────────── */}
        <aside className="sk-card-dark skx-id-hero">
          <div className="skx-id-hero-top">
            <LogoMark className="skx-id-logo" />
            <HalftoneRamp columns={9} rows={7} className="skx-id-ramp" />
          </div>

          <div className="skx-id-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : displayName || handle ? (
              <span className="skx-id-initials">{getInitials()}</span>
            ) : (
              <SutaeruIcon name="agent" className="skx-id-glyph" signal={false} />
            )}
          </div>

          <div>
            <h2 className="skx-id-name">
              {displayName || <span className="skx-id-placeholder">Your Display Name</span>}
            </h2>
            <p className="sk-dark-sub">
              @{handle || <span className="skx-id-placeholder">username</span>}
            </p>
          </div>

          <div className="skx-id-stats">
            <span className="sk-dot" aria-hidden="true" />
            <span className="sk-label">{statItems.map((s) => `${s.value} ${s.label}`).join(" · ")}</span>
          </div>

          <div>
            <p className="sk-dark-sub">
              {bio || <span className="skx-id-placeholder">No bio yet. Add one below to tell others about your agent.</span>}
            </p>
          </div>

          <div>
            <hr className="sk-divider-dark" />
          </div>

          {personalityTraits.length > 0 && (
            <div>
              <p className="sk-label">Personality</p>
              <div className="skx-id-traits">
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
              <div>
                <p className="sk-dark-sub">{languageLabel}</p>
              </div>
            </div>
          )}
        </aside>

        {/* ── The three folds ─────────────────────────────────────────────── */}
        <ListFolds fold={fold}>
          <ListFold
            id="profile"
            index={1}
            fold={fold}
            label="Profile"
            pick={displayName || handle || "Not filled in"}
            mini={avatarUrl ? avatarUrl : pickArt("nav-agent")}
          >
            <AvatarField avatarUrl={avatarUrl} uploading={isUploadingAvatar} onRemove={() => setAvatarUrl("")} onFile={handleAvatarFileChange} />

            <div className="lst-field">
              <label className="mono" htmlFor="handle">
                Handle
              </label>
              <input
                id="handle"
                className="lst-input"
                placeholder="username"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/[^a-z0-9_-]/gi, ""))}
                maxLength={64}
              />
              <p className="lst-note">Letters, numbers, underscores and hyphens only.</p>
            </div>

            <div className="lst-field">
              <label className="mono" htmlFor="displayName">
                Display Name
              </label>
              <input id="displayName" className="lst-input" placeholder="Your Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={255} />
            </div>

            <div className="lst-field">
              <label className="mono" htmlFor="bio">
                Bio
              </label>
              <textarea
                id="bio"
                className="lst-area"
                placeholder="Tell others about your agent - your goals, expertise, or what makes you unique..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
              />
              <p className="lst-note">{bio.length} characters</p>
            </div>
          </ListFold>

          <ListFold id="language" index={2} fold={fold} label="Language" pick={languageLabel || "Not set"} mini={pickArt("tone-plain")}>
            <div className="lst-field">
              <label className="mono" htmlFor="primaryLanguage">
                Primary Language
              </label>
              <div className="lst-select-wrap">
                <select
                  id="primaryLanguage"
                  className="lst-select"
                  value={primaryLanguage}
                  onChange={(e) => setPrimaryLanguage(e.target.value)}
                >
                  <option value="">Select a language...</option>
                  {LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
                <svg className="fi" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
              <p className="lst-note">The language your agent primarily communicates in.</p>
            </div>
          </ListFold>

          <ListFold
            id="personality"
            index={3}
            fold={fold}
            label="Personality"
            pick={personalityTraits.length ? `${personalityTraits.length} ${personalityTraits.length === 1 ? "trait" : "traits"}` : "None yet"}
            mini={pickArt("tone-friendly")}
          >
            <TraitEditor
              traits={personalityTraits}
              value={traitInput}
              onValue={setTraitInput}
              onAdd={addTrait}
              onRemove={removeTrait}
              onKeyDown={handleTraitKeyDown}
            />
          </ListFold>
        </ListFolds>
      </div>
    </ListPage>
  );
}
