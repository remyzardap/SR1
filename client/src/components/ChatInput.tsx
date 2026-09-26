import { useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { NEON } from "@/lib/design";

interface ChatInputProps {
  value: string;
  isStreaming: boolean;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop?: () => void;
}

export function ChatInput({
  value,
  isStreaming,
  onChange,
  onKeyDown,
  onSend,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <div className="sutaeru-chat-input flex-none" style={{ background: "transparent" }}>
      <div className="w-full max-w-2xl mx-auto">
        <motion.div
          animate={focused
            ? { boxShadow: "0 0 0 1.5px rgba(10,10,10,0.12), 0 8px 40px rgba(0,0,0,0.08)" }
            : { boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }
          }
          transition={{ duration: 0.2 }}
          className="sutaeru-input-box relative flex items-end gap-2 px-4 py-3"
          style={{
            background: "#ffffff",
            border: focused ? "1px solid rgba(10,10,10,0.14)" : "1px solid rgba(10,10,10,0.06)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Message Kemma…"
            rows={1}
            disabled={false}
            className="flex-1 min-w-0 resize-none bg-transparent text-[14px] outline-none leading-relaxed min-h-[24px] max-h-[180px]"
            style={{
              color: NEON.ink,
              fontFamily: "'Manrope', sans-serif",
              caretColor: NEON.orange,
            }}
          />

          <AnimatePresence mode="wait">
            {isStreaming ? (
              <motion.button
                key="stop"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={onStop}
                className="shrink-0 w-12 h-12 rounded-md flex items-center justify-center transition-all duration-200"
                style={{
                  background: NEON.orangeDim,
                  border: `1px solid ${NEON.orange}40`,
                  color: NEON.orange,
                }}
                title="Stop generation" aria-label="Stop generation"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </motion.button>
            ) : (
              <motion.button
                key="send"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: canSend ? 1 : 0.35 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={onSend}
                disabled={!canSend}
                className="shrink-0 w-12 h-12 rounded-md flex items-center justify-center transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  background: canSend ? NEON.black : "rgba(10,10,10,0.08)",
                  color: canSend ? NEON.cream : NEON.muted,
                  boxShadow: canSend ? "0 2px 12px rgba(0,0,0,0.18)" : "none",
                }}
                title="Send message" aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="text-center text-[10px] mt-2 font-mono tracking-widest uppercase hidden sm:block" style={{ color: NEON.muted }}>
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
