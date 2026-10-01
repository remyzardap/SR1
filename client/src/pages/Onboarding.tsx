import { useState, useEffect } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useLocation } from "wouter";
import { AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { LandingMark } from "@/components/LandingMark";
import { toast } from "sonner";
import {
  ProgressIndicator,
  WelcomeStep,
  IdentityStep,
  SkillsStep,
  ApiKeyStep,
  DoneStep,
} from "@/components/onboarding";
import type { IdentityData } from "@/components/onboarding";
import type { SkillData } from "@/components/onboarding";
import type { ApiKeyData } from "@/components/onboarding";

type Step = "welcome" | "identity" | "skills" | "apikey" | "done";

const STEPS: Step[] = ["welcome", "identity", "skills", "apikey", "done"];

const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  identity: "Identity",
  skills: "Skills",
  apikey: "Connect AI",
  done: "Done",
};

export default function Onboarding() {
  useSeoMeta({ title: "Welcome to Sutaeru", path: "/onboarding", appendSiteName: false });

  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [identityData, setIdentityData] = useState<IdentityData | null>(null);
  const [skillsData, setSkillsData] = useState<SkillData[]>([]);
  const [apiKeyData, setApiKeyData] = useState<ApiKeyData | undefined>(undefined);
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

      // 3. Save API key as a connection
      if (apiKeyData) {
        await addConnection.mutateAsync({
          provider: apiKeyData.provider,
          type: "llm_api_key",
          displayName: `${apiKeyData.provider} API Key`,
          encryptedCredentials: apiKeyData.apiKey,
        });
      }

      // 4. Mark onboarding complete
      await completeOnboarding.mutateAsync();

      // 5. Invalidate queries and navigate
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
    <div className="sk-onboarding">
      <span className="sk-plus sk-plus-tl" aria-hidden="true" />
      <span className="sk-plus sk-plus-tr" aria-hidden="true" />
      <span className="sk-plus sk-plus-bl" aria-hidden="true" />
      <span className="sk-plus sk-plus-br" aria-hidden="true" />
      <div className="sk-onboarding-inner">
        <LandingMark className="sk-onboarding-mark" />

        {/* Progress indicator: hidden on welcome and done */}
        {currentStep !== "welcome" && currentStep !== "done" && (
          <ProgressIndicator
            steps={["identity", "skills", "apikey"].map((s) => ({
              id: s,
              label: STEP_LABELS[s as Step],
            }))}
            currentStepId={currentStep}
          />
        )}

        <div className="sk-onboarding-step">
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
            {currentStep === "apikey" && (
              <ApiKeyStep
                key="apikey"
                initialData={apiKeyData}
                onNext={handleApiKeyNext}
                onBack={goBack}
                onSkip={goNext}
              />
            )}
            {currentStep === "done" && identityData && (
              <DoneStep
                key="done"
                identity={identityData}
                skills={skillsData}
                apiKey={apiKeyData}
                onComplete={handleComplete}
                isLoading={isSubmitting}
              />
            )}
          </AnimatePresence>
        </div>

        <p className="sk-auth-foot">Search <i>&middot;</i> Research <i>&middot;</i> Do</p>
      </div>
    </div>
  );
}
