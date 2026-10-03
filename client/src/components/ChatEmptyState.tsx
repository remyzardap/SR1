import { motion } from "framer-motion";
import { useAuth } from "@/_core/hooks/useAuth";

interface ChatEmptyStateProps {
  agentName?: string;
}

/**
 * First run: one greeting with the person's name and one question. No starter
 * cards, no mode icons, no status strip (owner rule for the phone chat).
 */
export function ChatEmptyState({ agentName }: ChatEmptyStateProps) {
  const { user } = useAuth();
  const first = (agentName || user?.name || user?.email || "").trim().split(/\s+/)[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="sk-chat-empty"
    >
      <h2 className="sk-chat-greeting">Hi{first ? ` ${first}` : " there"}.</h2>
      <p className="sk-chat-sub">What should we work on?</p>
    </motion.div>
  );
}
