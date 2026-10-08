import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
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

const PROGRESS_STEPS = [
  { id: "identity", label: "Identity" },
  { id: "skills", label: "Skills" },
  { id: "apikey", label: "Connect AI" },
];

const SAMPLE_IDENTITY: IdentityData = {
  displayName: "Remy",
  handle: "remy",
  bio: "Building tools for thought.",
};

const SAMPLE_SKILLS: SkillData[] = [
  { name: "Code Reviewer", description: "Reviews code for best practices", type: "prompt" },
  { name: "API Workflow", description: "Automates API integration tasks", type: "workflow" },
];

const SAMPLE_APIKEY: ApiKeyData = {
  provider: "OpenAI",
  apiKey: "sk-...",
};

export default function LabOnboarding() {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [identity, setIdentity] = useState<IdentityData | null>(null);
  const [skills, setSkills] = useState<SkillData[]>([]);
  const [apiKey, setApiKey] = useState<ApiKeyData | undefined>(undefined);

  const renderStep = () => {
    switch (step) {
      case "welcome":
        return <WelcomeStep key="welcome" onNext={() => setStep("identity")} />;
      case "identity":
        return <IdentityStep key="identity" initialData={identity || undefined} onNext={setIdentity} onBack={() => setStep("welcome")} />;
      case "skills":
        return <SkillsStep key="skills" initialData={skills} onNext={setSkills} onBack={() => setStep("identity")} onSkip={() => setStep("apikey")} />;
      case "apikey":
        return <ApiKeyStep key="apikey" initialData={apiKey} onNext={setApiKey} onBack={() => setStep("skills")} onSkip={() => setStep("done")} />;
      case "done":
        return identity && (
          <DoneStep
            key="done"
            identity={identity}
            skills={skills}
            apiKey={apiKey}
            onComplete={() => {}}
            isLoading={false}
          />
        );
    }
  };

  return (
    <LabLayout bleed title="Onboarding — Multi-step Setup">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "0 24px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--quiet)" }}>
            Step:
            <select value={step} onChange={(e) => setStep(e.target.value as OnboardingStep)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--stroke)", background: "var(--card)", color: "var(--ink)" }}>
              {STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>

        <section style={{ borderTop: "1px dashed var(--stroke)", borderBottom: "1px dashed var(--stroke)", overflow: "hidden" }}>
          <div style={{ minHeight: 600 }}>
            <div className="sk-onboarding">
              <span className="sk-plus sk-plus-tl" aria-hidden="true" />
              <span className="sk-plus sk-plus-tr" aria-hidden="true" />
              <span className="sk-plus sk-plus-bl" aria-hidden="true" />
              <span className="sk-plus sk-plus-br" aria-hidden="true" />
              <div className="sk-onboarding-inner">
                <div className="sk-onboarding-mark">
                  <svg className="glyph" viewBox="0 0 96 96" aria-hidden="true"><path d="M48 14c2 18 12 30 30 34-18 4-28 16-30 34-2-18-12-30-30-34 18-4 28-16 30-34Z" fill="currentColor"/></svg>
                </div>

                {step !== "welcome" && step !== "done" && (
                  <OnboardingProgress
                    steps={PROGRESS_STEPS}
                    currentStepId={step}
                  />
                )}

                <div className="sk-onboarding-step">
                  {renderStep()}
                </div>

                <p className="sk-auth-foot">Search <i>&middot;</i> Research <i>&middot;</i> Do</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </LabLayout>
  );
}