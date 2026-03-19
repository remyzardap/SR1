import { AnimatePresence, motion } from "framer-motion";

interface ChatErrorBannerProps {
  error: string | null;
  onRetry: () => void;
}

export function ChatErrorBanner({ error, onRetry }: ChatErrorBannerProps) {
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="flex-none mx-3 sm:mx-6 mb-3"
        >
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl text-red-400/80"
            style={{
              background: "rgba(232,68,42,0.06)",
              border: "1px solid rgba(232,68,42,0.2)",
            }}
          >
            <span className="text-[12px] font-mono break-words min-w-0 mr-2">
              {error}
            </span>
            <button
              onClick={onRetry}
              className="text-[10px] tracking-widest uppercase border border-red-900/40 px-3 py-1 rounded-lg hover:bg-red-900/20 transition-colors shrink-0 font-mono"
            >
              Retry
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
