import { motion } from "framer-motion";
import { Check } from "lucide-react";

interface StepDef {
  id: string;
  label: string;
}

interface ProgressIndicatorProps {
  steps: StepDef[];
  currentStepId: string;
}

export function ProgressIndicator({ steps, currentStepId }: ProgressIndicatorProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <motion.div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors duration-300 ${
                    isCompleted
                      ? "bg-white text-black"
                      : isCurrent
                      ? "bg-white text-black ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0a]"
                      : "bg-neutral-800 text-neutral-500 border border-[#333]"
                  }`}
                  initial={false}
                  animate={{ scale: isCurrent ? 1.1 : 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : index + 1}
                </motion.div>
                <span
                  className={`mt-1.5 text-xs font-medium ${
                    isCurrent ? "text-white" : isCompleted ? "text-neutral-400" : "text-neutral-600"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="flex-1 h-px mx-2 mb-5 bg-neutral-800 relative overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-white"
                    initial={{ width: 0 }}
                    animate={{ width: isCompleted ? "100%" : "0%" }}
                    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
