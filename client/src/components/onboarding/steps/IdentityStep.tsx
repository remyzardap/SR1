import { useState } from "react";
import { motion } from "framer-motion";
import { User, AtSign, FileText, Globe, ArrowRight, ArrowLeft } from "lucide-react";

const PERSONALITY_TRAIT_OPTIONS = [
  "Analytical", "Creative", "Direct", "Empathetic", "Focused",
  "Curious", "Strategic", "Detail-oriented", "Collaborative", "Independent",
  "Pragmatic", "Visionary", "Methodical", "Adaptive", "Concise",
];

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "id", name: "Indonesian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "ar", name: "Arabic" },
];

export interface IdentityData {
  handle: string;
  displayName: string;
  bio: string;
  personalityTraits: string[];
  primaryLanguage: string;
}

interface IdentityStepProps {
  initialData?: Partial<IdentityData>;
  onNext: (data: IdentityData) => void;
  onBack: () => void;
}

export function IdentityStep({ initialData, onNext, onBack }: IdentityStepProps) {
  const [formData, setFormData] = useState<IdentityData>({
    handle: initialData?.handle ?? "",
    displayName: initialData?.displayName ?? "",
    bio: initialData?.bio ?? "",
    personalityTraits: initialData?.personalityTraits ?? [],
    primaryLanguage: initialData?.primaryLanguage ?? "en",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof IdentityData, string>>>({});

  const toggleTrait = (trait: string) => {
    setFormData((prev) => ({
      ...prev,
      personalityTraits: prev.personalityTraits.includes(trait)
        ? prev.personalityTraits.filter((t) => t !== trait)
        : prev.personalityTraits.length < 5
        ? [...prev.personalityTraits, trait]
        : prev.personalityTraits,
    }));
  };

  const validate = () => {
    const newErrors: Partial<Record<keyof IdentityData, string>> = {};
    if (!formData.displayName.trim()) newErrors.displayName = "Display name is required";
    if (!formData.bio.trim()) newErrors.bio = "Bio is required";
    if (formData.handle && !/^[a-z0-9_-]{3,32}$/.test(formData.handle)) {
      newErrors.handle = "Handle must be 3–32 lowercase letters, numbers, - or _";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext(formData);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Create your identity</h2>
        <p className="text-neutral-400">This is how your agent presents itself across AI surfaces.</p>
      </div>

      <div className="space-y-5">
        {/* Display Name */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
            <User className="w-4 h-4" />
            Display Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.displayName}
            onChange={(e) => setFormData((p) => ({ ...p, displayName: e.target.value }))}
            placeholder="e.g. Alex Chen"
            className="w-full px-4 py-3 bg-neutral-900 border border-[#333] rounded-lg text-white
                       placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-white/20
                       focus:border-neutral-500 transition-all duration-200"
          />
          {errors.displayName && <p className="mt-1 text-sm text-red-400">{errors.displayName}</p>}
        </div>

        {/* Handle */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
            <AtSign className="w-4 h-4" />
            Handle <span className="text-neutral-500 text-xs font-normal">(optional)</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500">@</span>
            <input
              type="text"
              value={formData.handle}
              onChange={(e) => setFormData((p) => ({ ...p, handle: e.target.value.toLowerCase() }))}
              placeholder="yourhandle"
              className="w-full pl-8 pr-4 py-3 bg-neutral-900 border border-[#333] rounded-lg text-white
                         placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-white/20
                         focus:border-neutral-500 transition-all duration-200"
            />
          </div>
          {errors.handle && <p className="mt-1 text-sm text-red-400">{errors.handle}</p>}
        </div>

        {/* Bio */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
            <FileText className="w-4 h-4" />
            Bio <span className="text-red-400">*</span>
          </label>
          <textarea
            value={formData.bio}
            onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value }))}
            placeholder="Describe yourself, your work, and what you want your AI agent to know about you..."
            rows={3}
            className="w-full px-4 py-3 bg-neutral-900 border border-[#333] rounded-lg text-white
                       placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-white/20
                       focus:border-neutral-500 transition-all duration-200 resize-none"
          />
          {errors.bio && <p className="mt-1 text-sm text-red-400">{errors.bio}</p>}
        </div>

        {/* Personality Traits */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Personality Traits{" "}
            <span className="text-neutral-500 text-xs font-normal">
              (pick up to 5 — {formData.personalityTraits.length}/5)
            </span>
          </label>
          {/* Selected traits */}
          {formData.personalityTraits.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.personalityTraits.map((trait) => (
                <button
                  key={trait}
                  onClick={() => toggleTrait(trait)}
                  className="px-3 py-1.5 bg-white text-black text-sm rounded-full font-medium
                             hover:bg-neutral-200 transition-colors duration-200"
                >
                  {trait} ×
                </button>
              ))}
            </div>
          )}
          {/* Available traits */}
          <div className="flex flex-wrap gap-2">
            {PERSONALITY_TRAIT_OPTIONS.filter((t) => !formData.personalityTraits.includes(t)).map((trait) => (
              <button
                key={trait}
                onClick={() => toggleTrait(trait)}
                disabled={formData.personalityTraits.length >= 5}
                className="px-3 py-1.5 border border-[#333] rounded-full text-sm text-neutral-300
                           hover:border-white hover:text-white disabled:opacity-40 disabled:cursor-not-allowed
                           transition-colors duration-200"
              >
                {trait}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Language */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white mb-2">
            <Globe className="w-4 h-4" />
            Primary Language
          </label>
          <select
            value={formData.primaryLanguage}
            onChange={(e) => setFormData((p) => ({ ...p, primaryLanguage: e.target.value }))}
            className="w-full px-4 py-3 bg-neutral-900 border border-[#333] rounded-lg text-white
                       focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-neutral-500
                       transition-all duration-200 cursor-pointer"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code} className="bg-neutral-900">
                {lang.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 border border-[#333] rounded-xl text-neutral-300
                     hover:border-white hover:text-white transition-colors duration-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white text-black
                     font-semibold rounded-xl hover:bg-neutral-200 transition-colors duration-200"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
