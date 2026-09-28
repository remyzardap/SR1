import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, RotateCcw, X } from "lucide-react";

interface ChatErrorBannerProps {
  error: string | null;
  onRetry: () => void;
  onDismiss?: () => void;
  retrying?: boolean;
  retryLabel?: string;
}

export function ChatErrorBanner({ error, onRetry, onDismiss, retrying = false, retryLabel = "Retry" }: ChatErrorBannerProps) {
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="flex-none mx-3 sm:mx-6 mb-3"
          role="alert"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive">
            <span className="flex items-start gap-2 text-[13px] break-words min-w-0">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={onRetry}
                disabled={retrying}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-destructive/40 px-3 text-xs font-medium hover:bg-destructive/10 disabled:opacity-60 transition-colors"
              >
                {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {retryLabel}
              </button>
              {onDismiss && (
                <button onClick={onDismiss} aria-label="Dismiss" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-destructive/10">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
