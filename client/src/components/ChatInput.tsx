import { useRef, useEffect, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
    <div
      className="flex-none px-3 sm:px-4 pb-4 pt-2"
      style={{ background: "transparent" }}
    >
      <div className="w-full max-w-2xl mx-auto">
        {/* Floating input container */}
        <motion.div
          animate={focused ? { boxShadow: "0 0 0 1.5px rgba(242,242,242,0.15), 0 8px 40px rgba(0,0,0,0.5)" } : { boxShadow: "0 4px 24px rgba(0,0,0,0.35)" }}
          transition={{ duration: 0.2 }}
          className="relative flex items-end gap-2 px-4 py-3 rounded-2xl"
          style={{
            background: "rgba(18,18,18,0.92)",
            backdropFilter: "blur(28px)",
            border: focused ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Message S1…"
            rows={1}
            disabled={false}
            className="flex-1 min-w-0 resize-none bg-transparent text-[14px] outline-none leading-relaxed min-h-[24px] max-h-[180px]"
            style={{
              color: "#f2f2f2",
              fontFamily: "'DM Sans', sans-serif",
              caretColor: "#f2f2f2",
            }}
          />

          {/* Send / Stop button */}
          <AnimatePresence mode="wait">
            {isStreaming ? (
              <motion.button
                key="stop"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={onStop}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200"
                style={{
                  background: "rgba(249,115,22,0.15)",
                  border: "1px solid rgba(249,115,22,0.35)",
                  color: "#f97316",
                }}
                title="Stop generation"
              >
                <Square className="h-3 w-3 fill-current" />
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
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 disabled:cursor-not-allowed"
                style={{
                  background: canSend ? "#f2f2f2" : "rgba(242,242,242,0.08)",
                  color: canSend ? "#050505" : "rgba(242,242,242,0.4)",
                  boxShadow: canSend ? "0 2px 12px rgba(242,242,242,0.2)" : "none",
                }}
                title="Send message"
              >
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Hint */}
        <p className="text-center text-[10px] mt-2 font-mono tracking-widest uppercase hidden sm:block" style={{ color: "rgba(242,242,242,0.18)" }}>
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
