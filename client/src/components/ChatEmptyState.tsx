import { motion } from "framer-motion";
import { Globe, Code2, PenLine, Zap } from "lucide-react";
import { NEON, NEON_FD, NEON_FM } from "@/lib/design";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  { icon: Globe, label: "Search", prompt: "What's happening in Indonesian renewable energy this week?" },
  { icon: Code2, label: "Code", prompt: "Review this code and suggest improvements" },
  { icon: PenLine, label: "Write", prompt: "Draft a professional memo about our Q2 strategy" },
  { icon: Zap, label: "Think", prompt: "Summarise the key points from my last conversation" },
];

interface ChatEmptyStateProps {
  agentName?: string;
  onSuggestion: (s: string) => void;
}

export function ChatEmptyState({ agentName, onSuggestion }: ChatEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="sutaeru-editorial-empty flex flex-col justify-center h-full gap-8 px-4 sm:px-6 py-12"
    >
      <div className="sutaeru-editorial-intro">
        <span className="sutaeru-editorial-kicker">Your workspace / 01</span>
        <motion.h2
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="sutaeru-editorial-title mb-2"
          style={{ color: NEON.ink, fontFamily: NEON_FD }}
        >
          {agentName ? `${agentName}'s Agent` : "Kemma"}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-[11px] tracking-widest uppercase font-mono"
          style={{ color: NEON.muted, fontFamily: NEON_FM }}
        >
          One mind. Every model.
        </motion.p>
      </div>

      <div className="sutaeru-editorial-prompts grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
        {SUGGESTIONS.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={i}
              data-testid={`button-suggestion-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.07 }}
              className="group"
            >
             <Button type="button" variant="ghost" onClick={() => onSuggestion(s.prompt)} className="sutaeru-editorial-prompt text-left w-full h-full block">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: NEON.orangeDim, border: `1px solid ${NEON.orange}25` }}
                >
                  <Icon className="w-3 h-3" style={{ color: NEON.orange }} />
                </div>
                <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: NEON.muted, fontFamily: NEON_FD }}>
                  {s.label}
                </span>
              </div>
              <p className="text-[13px] leading-snug" style={{ color: NEON.ink }}>
                {s.prompt}
              </p>
             </Button>
             </motion.div>
          );
        })}
      </div>

    </motion.div>
  );
}
