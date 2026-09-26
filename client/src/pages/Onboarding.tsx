import { useState, useEffect } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useLocation } from "wouter";
import { AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ProgressIndicator,
  WelcomeStep,
  IdentityStep,
  SkillsStep,
  DoneStep,
} from "@/components/onboarding";
import type { IdentityData } from "@/components/onboarding";
import type { SkillData } from "@/components/onboarding";

type Step = "welcome" | "identity" | "skills" | "done";

const STEPS: Step[] = ["welcome", "identity", "skills", "done"];

const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  identity: "Identity",
  skills: "Skills",
  done: "Done",
};

export default function Onboarding() {
  useSeoMeta({ title: "Welcome to Sutaeru", path: "/onboarding", appendSiteName: false });

  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [identityData, setIdentityData] = useState<IdentityData | null>(null);
  const [skillsData, setSkillsData] = useState<SkillData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user already completed onboarding
  const { data: onboardingStatus } = trpc.identity.getOnboardingStatus.useQuery();

  useEffect(() => {
    if (onboardingStatus?.onboarded) {
      navigate("/chat");
    }
  }, [onboardingStatus, navigate]);

  const upsertIdentity = trpc.identity.upsert.useMutation();
  const createSkill = trpc.skills.create.useMutation();
  const completeOnboarding = trpc.identity.completeOnboarding.useMutation();

  const stepIndex = STEPS.indexOf(currentStep);

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setCurrentStep(next);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setCurrentStep(prev);
  };

  const handleIdentityNext = (data: IdentityData) => {
    setIdentityData(data);
    goNext();
  };

  const handleSkillsNext = (skills: SkillData[]) => {
    setSkillsData(skills);
    goNext();
  };

  const handleComplete = async () => {
    if (!identityData) return;
    setIsSubmitting(true);
    try {
      // 1. Save identity
      await upsertIdentity.mutateAsync({
        displayName: identityData.displayName,
        handle: identityData.handle || undefined,
        bio: identityData.bio,
      });

      // 2. Save skills (in parallel)
      if (skillsData.length > 0) {
        await Promise.all(
          skillsData.map((skill) =>
            createSkill.mutateAsync({
              name: skill.name,
              description: skill.description,
              type: skill.type,
              content: { description: skill.description },
              isPublic: false,
            })
          )
        );
      }

      // 3. Mark onboarding complete
      await completeOnboarding.mutateAsync();

      // 4. Invalidate queries and navigate
      await utils.identity.get.invalidate();
      await utils.skills.list.invalidate();

      toast.success("Welcome to Sutaeru! Your identity is ready.");
      navigate("/chat");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(`Setup failed: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-sutaeru flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator — hide on welcome and done */}
        {currentStep !== "welcome" && currentStep !== "done" && (
          <div className="mb-8">
            <ProgressIndicator
              steps={["identity", "skills"].map((s) => ({
                id: s,
                label: STEP_LABELS[s as Step],
              }))}
              currentStepId={currentStep}
            />
          </div>
        )}

        {/* Step content */}
        <div className="glass border border-[rgba(255,255,255,0.05)] rounded-2xl p-8">
          <AnimatePresence mode="wait">
            {currentStep === "welcome" && (
              <WelcomeStep key="welcome" onNext={goNext} />
            )}
            {currentStep === "identity" && (
              <IdentityStep
                key="identity"
                initialData={identityData ?? undefined}
                onNext={handleIdentityNext}
                onBack={goBack}
              />
            )}
            {currentStep === "skills" && (
              <SkillsStep
                key="skills"
                initialData={skillsData}
                onNext={handleSkillsNext}
                onBack={goBack}
                onSkip={goNext}
              />
            )}
            {currentStep === "done" && identityData && (
              <DoneStep
                key="done"
                identity={identityData}
                skills={skillsData}
                onComplete={handleComplete}
                isLoading={isSubmitting}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Step counter */}
        {currentStep !== "welcome" && (
          <p className="text-center text-xs text-neutral-600 mt-4">
            Step {stepIndex} of {STEPS.length - 1}
          </p>
        )}
      </div>
    </div>
  );
}
