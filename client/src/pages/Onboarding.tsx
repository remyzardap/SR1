import { useState, useEffect } from "react";
import { PaperGrain } from "@/components/art";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useLocation } from "wouter";
import { AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  OnboardingProgress,
  WelcomeStep,
  IdentityStep,
  SkillsStep,
  ApiKeyStep,
  DoneStep,
  type OnboardingStep,
  type IdentityData,
  type SkillData,
  type ApiKeyData,
} from "@/components/redo/Onboarding";

const STEPS: OnboardingStep[] = ["welcome", "identity", "skills", "apikey", "done"];

const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  identity: "Identity",
  skills: "Skills",
  apikey: "Connect AI",
  done: "Done",
};

const PROGRESS_STEPS = [
  { id: "identity", label: "Identity" },
  { id: "skills", label: "Skills" },
  { id: "apikey", label: "Connect AI" },
];

export default function OnboardingPage() {
  useSeoMeta({ title: "Welcome to Sutaeru", path: "/onboarding", appendSiteName: false });

  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [identityData, setIdentityData] = useState<IdentityData | null>(null);
  const [skillsData, setSkillsData] = useState<SkillData[]>([]);
  const [apiKeyData, setApiKeyData] = useState<ApiKeyData | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: onboardingStatus } = trpc.identity.getOnboardingStatus.useQuery();

  useEffect(() => {
    if (onboardingStatus?.onboarded) {
      navigate("/chat");
    }
  }, [onboardingStatus, navigate]);

  const upsertIdentity = trpc.identity.upsert.useMutation();
  const createSkill = trpc.skills.create.useMutation();
  const addConnection = trpc.connections.add.useMutation();
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

  const handleApiKeyNext = (data: ApiKeyData) => {
    setApiKeyData(data);
    goNext();
  };

  const handleComplete = async () => {
    if (!identityData) return;
    setIsSubmitting(true);
    try {
      await upsertIdentity.mutateAsync({
        displayName: identityData.displayName,
        handle: identityData.handle || undefined,
        bio: identityData.bio,
      });

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

      if (apiKeyData) {
        await addConnection.mutateAsync({
          provider: apiKeyData.provider,
          type: "llm_api_key",
          displayName: `${apiKeyData.provider} API Key`,
          encryptedCredentials: apiKeyData.apiKey,
        });
      }

      await completeOnboarding.mutateAsync();

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

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return <WelcomeStep key="welcome" onNext={goNext} />;
      case "identity":
        return <IdentityStep key="identity" initialData={identityData ?? undefined} onNext={handleIdentityNext} onBack={goBack} />;
      case "skills":
        return <SkillsStep key="skills" initialData={skillsData} onNext={handleSkillsNext} onBack={goBack} onSkip={goNext} />;
      case "apikey":
        return <ApiKeyStep key="apikey" initialData={apiKeyData} onNext={handleApiKeyNext} onBack={goBack} onSkip={goNext} />;
      case "done":
        return identityData && (
          <DoneStep
            key="done"
            identity={identityData}
            skills={skillsData}
            apiKey={apiKeyData}
            onComplete={handleComplete}
            isLoading={isSubmitting}
          />
        );
    }
  };

  return (
    <div className="sk-onboarding">
      <PaperGrain />
      <span className="sk-plus sk-plus-tl" aria-hidden="true" />
      <span className="sk-plus sk-plus-tr" aria-hidden="true" />
      <div className="sk-onboarding-inner">
        <div className="sk-onboarding-mark">
          <svg className="glyph" viewBox="0 0 96 96" aria-hidden="true"><path d="M48 14c2 18 12 30 30 34-18 4-28 16-30 34-2-18-12-30-30-34 18-4 28-16 30-34Z" fill="currentColor"/></svg>
        </div>

        {currentStep !== "welcome" && currentStep !== "done" && (
          <OnboardingProgress
            steps={PROGRESS_STEPS}
            currentStepId={currentStep}
          />
        )}

        <div className="sk-onboarding-step">
          <AnimatePresence mode="wait">
            {renderStep()}
          </AnimatePresence>
        </div>

        <p className="sk-auth-foot">Search <i>&middot;</i> Research <i>&middot;</i> Do</p>
      </div>
    </div>
  );
}