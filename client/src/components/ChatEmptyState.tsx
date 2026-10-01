import { motion } from "framer-motion";
import { useAuth } from "@/_core/hooks/useAuth";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";

const SUGGESTIONS: Array<{ icon: SutaeruIconName; label: string; prompt: string }> = [
  { icon: "search", label: "Search", prompt: "What's happening in Indonesian renewable energy this week?" },
  { icon: "report", label: "Write", prompt: "Draft a professional memo about our Q2 strategy" },
  { icon: "research", label: "Research", prompt: "Compare off-grid solar and battery costs for remote villages" },
  { icon: "code", label: "Code", prompt: "Review this code and suggest improvements" },
];

interface ChatEmptyStateProps {
  agentName?: string;
  onSuggestion: (s: string) => void;
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function ChatEmptyState({ agentName, onSuggestion }: ChatEmptyStateProps) {
  const { user } = useAuth();
  const first = (agentName || user?.name || "").trim().split(/\s+/)[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="sk-chat-empty"
    >
      <span className="sk-label">Kemma <b>/</b> Ready</span>
      <h2 className="sk-chat-greeting">{greeting()}{first ? `, ${first}.` : "."}</h2>

      <div className="sk-chat-try">
        <span className="sk-label">Try</span>
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s.label}
            type="button"
            data-testid={`button-suggestion-${i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.05 }}
            onClick={() => onSuggestion(s.prompt)}
            className="sk-chat-suggestion"
          >
            <SutaeruIcon name={s.icon} className="sk-chat-suggestion-icon" />
            <span>{s.prompt}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
