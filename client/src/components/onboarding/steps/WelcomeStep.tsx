import { motion } from "framer-motion";
import { Sparkles, Brain, Layers, ArrowRight } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="text-center"
    >
      {/* Logo mark */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-8"
      >
        <span className="text-black font-bold text-2xl tracking-tight">S</span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-4xl font-bold text-white mb-4"
      >
        Welcome to Sutaeru
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-lg text-neutral-400 mb-12 max-w-md mx-auto leading-relaxed"
      >
        One identity. Every model. For life.
        <br />
        <span className="text-neutral-500 text-base">
          Build your persistent AI agent soul — skills, memories, and context that travel with you across every AI surface.
        </span>
      </motion.p>

      {/* Feature highlights */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-3 gap-4 mb-12"
      >
        {[
          { icon: Brain, label: "Persistent Memory", desc: "Your context, always remembered" },
          { icon: Layers, label: "Portable Skills", desc: "Capabilities that follow you" },
          { icon: Sparkles, label: "Any AI Model", desc: "Works with every LLM" },
        ].map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="p-4 border border-[#222] rounded-xl bg-[#111] text-left"
          >
            <Icon className="w-5 h-5 text-white mb-2" />
            <p className="text-sm font-medium text-white">{label}</p>
            <p className="text-xs text-neutral-500 mt-1">{desc}</p>
          </div>
        ))}
      </motion.div>

      <motion.button
        onClick={onNext}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full max-w-sm mx-auto px-8 py-4 bg-white text-black font-semibold text-base rounded-xl
                   hover:bg-neutral-200 transition-colors duration-200 flex items-center justify-center gap-2"
      >
        Get Started
        <ArrowRight className="w-5 h-5" />
      </motion.button>
    </motion.div>
  );
}
