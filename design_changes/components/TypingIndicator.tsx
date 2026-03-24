import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 mb-6">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono text-[#e8442a] shrink-0"
        style={{
          background: "rgba(232,68,42,0.1)",
          border: "1px solid rgba(232,68,42,0.2)",
        }}
      >
        S
      </div>
      <div
        className="px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5 items-center"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[#00c8c8]/60"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
