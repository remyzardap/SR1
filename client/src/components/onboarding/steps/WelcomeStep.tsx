import { motion } from "framer-motion";
import { Sparkles, Brain, Layers, ArrowRight } from "lucide-react";
import { LandingMark } from "@/components/LandingMark";

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
        className="w-20 h-16 flex items-center justify-center mx-auto mb-8"
      >
        <LandingMark className="sutaeru-login-mark" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-4xl font-bold text-foreground mb-4"
      >
        Welcome to Sutaeru
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-lg text-muted-foreground mb-12 max-w-md mx-auto leading-relaxed"
      >
        One identity. Every model. For life.
        <br />
        <span className="text-muted-foreground text-base">
          Build your persistent AI agent soul — skills, memories, and context that travel with you across every AI surface.
        </span>
      </motion.p>

      {/* Feature highlights */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 sm:mb-12"
      >
        {[
          { icon: Brain, label: "Persistent Memory", desc: "Your context, always remembered" },
          { icon: Layers, label: "Portable Skills", desc: "Capabilities that follow you" },
          { icon: Sparkles, label: "Any AI Model", desc: "Works with every LLM" },
        ].map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="p-4 border border-border rounded-xl bg-card text-left"
          >
            <Icon className="w-5 h-5 text-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">{desc}</p>
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
        className="w-full max-w-sm mx-auto px-8 py-4 bg-primary text-primary-foreground font-semibold text-base rounded-xl
                   hover:bg-[#3a3936] transition-colors duration-200 flex items-center justify-center gap-2"
      >
        Get Started
        <ArrowRight className="w-5 h-5" />
      </motion.button>
    </motion.div>
  );
}
