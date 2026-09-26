import { motion } from "framer-motion";
import { CheckCircle, User, Wrench, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import type { IdentityData } from "./IdentityStep";
import type { SkillData } from "./SkillsStep";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", id: "Indonesian", zh: "Chinese", ja: "Japanese",
  ko: "Korean", es: "Spanish", fr: "French", de: "German",
  pt: "Portuguese", ar: "Arabic",
};

interface DoneStepProps {
  identity: IdentityData;
  skills: SkillData[];
  onComplete: () => void;
  isLoading: boolean;
}

export function DoneStep({ identity, skills, onComplete, isLoading }: DoneStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="text-center"
    >
      {/* Success icon */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
        className="w-16 h-16 rounded-full bg-white flex items-center justify-center mx-auto mb-6"
      >
        <CheckCircle className="w-8 h-8 text-black" />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-3xl font-bold text-white mb-2"
      >
        You're all set!
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-neutral-400 mb-8"
      >
        Your agent identity is ready. Here's what we set up:
      </motion.p>

      {/* Summary cards */}
      <div className="space-y-3 text-left mb-8">
        {/* Identity */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="p-4 border border-[#333] rounded-xl bg-neutral-900/50"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold text-white">Identity</h3>
          </div>
          <div className="pl-11 space-y-1">
            <p className="text-sm text-white font-medium">{identity.displayName}</p>
            {identity.handle && (
              <p className="text-xs text-neutral-500">@{identity.handle}</p>
            )}
            <p className="text-xs text-neutral-400 line-clamp-2">{identity.bio}</p>
            {identity.personalityTraits.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {identity.personalityTraits.slice(0, 3).map((trait) => (
                  <span key={trait} className="px-2 py-0.5 border border-[#333] text-neutral-300 text-xs rounded-full">
                    {trait}
                  </span>
                ))}
                {identity.personalityTraits.length > 3 && (
                  <span className="text-xs text-neutral-500">+{identity.personalityTraits.length - 3} more</span>
                )}
              </div>
            )}
            <p className="text-xs text-neutral-500 mt-1">
              Language: {LANGUAGE_NAMES[identity.primaryLanguage] ?? identity.primaryLanguage}
            </p>
          </div>
        </motion.div>

        {/* Skills */}
        {skills.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="p-4 border border-[#333] rounded-xl bg-neutral-900/50"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Wrench className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-semibold text-white">Skills</h3>
              <span className="text-xs text-neutral-500">({skills.length})</span>
            </div>
            <div className="pl-11 space-y-1">
              {skills.map((skill, i) => (
                <div key={i}>
                  <p className="text-sm text-white">{skill.name}</p>
                  <p className="text-xs text-neutral-500 line-clamp-1">{skill.description}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

      </div>

      {/* What's next */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="p-4 border border-dashed border-[#333] rounded-xl mb-8 text-left"
      >
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          <h4 className="text-sm font-medium text-white">What's next?</h4>
        </div>
        <p className="text-sm text-neutral-400 pl-6">
          Head to your dashboard to start chatting with your agent, add more skills, and build your memory.
        </p>
      </motion.div>

      {/* Complete button */}
      <motion.button
        onClick={onComplete}
        disabled={isLoading}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        whileHover={!isLoading ? { scale: 1.02 } : {}}
        whileTap={!isLoading ? { scale: 0.98 } : {}}
        className={`w-full px-6 py-4 rounded-xl font-semibold text-base transition-all duration-200
                   flex items-center justify-center gap-2 ${
                     isLoading
                       ? "bg-neutral-700 text-neutral-400 cursor-not-allowed"
                       : "bg-white text-black hover:bg-neutral-200"
                   }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Setting up your identity...
          </>
        ) : (
          <>
            Go to Dashboard
            <ArrowRight className="w-5 h-5" />
          </>
        )}
      </motion.button>
    </motion.div>
  );
}
