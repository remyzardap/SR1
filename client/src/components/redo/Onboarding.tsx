import { SutaeruGlyph, SutaeruSeal } from "@/components/brand";
import { ChevronRight, ChevronLeft, Check } from "lucide-react";

export type OnboardingStep = "welcome" | "identity" | "skills" | "apikey" | "done";

export interface OnboardingProgressProps {
  steps: Array<{ id: string; label: string }>;
  currentStepId: string;
  className?: string;
}

export function OnboardingProgress({ steps, currentStepId, className }: OnboardingProgressProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);
  const activeSteps = steps.filter((_, i) => i < currentIndex);

  return (
    <div className={`sk-onboarding-progress ${className || ""}`} aria-label="Onboarding progress">
      <div className="sk-progress-track" aria-hidden="true" />
      <div className="sk-progress-fill" style={{ width: steps.length > 1 ? `${(currentIndex / (steps.length - 1)) * 100}%` : "100%" }} aria-hidden="true" />
      {steps.map((step, index) => (
        <button
          key={step.id}
          type="button"
          className={`sk-progress-step ${index <= currentIndex ? "active" : ""} ${index === currentIndex ? "current" : ""}`}
          aria-current={index === currentIndex ? "step" : undefined}
          disabled={true}
        >
          <span className="sk-progress-dot" aria-hidden="true">
            {index < currentIndex && <Check className="sk-progress-check" aria-hidden="true" />}
          </span>
          <span className="sk-progress-label">{step.label}</span>
        </button>
      ))}
    </div>
  );
}

export interface WelcomeStepProps {
  onNext: () => void;
  className?: string;
}

export function WelcomeStep({ onNext, className }: WelcomeStepProps) {
  return (
    <div className={`sk-onboarding-step sk-welcome-step ${className || ""}`}>
      <div className="sk-welcome-content">
        <SutaeruGlyph detail="full" size={120} className="sk-welcome-mark" />
        <h2>Welcome to Sutaeru</h2>
        <p>Search, deep research, and agents that keep working while you&apos;re away.</p>
        <p>Let&apos;s set up your workspace in a few quick steps.</p>
      </div>
      <button type="button" className="btn ink big" onClick={onNext}>Get started</button>
    </div>
  );
}

export interface IdentityData {
  displayName: string;
  handle: string;
  bio: string;
}

export interface IdentityStepProps {
  initialData?: IdentityData;
  onNext: (data: IdentityData) => void;
  onBack: () => void;
  className?: string;
}

export function IdentityStep({ initialData, onNext, onBack, className }: IdentityStepProps) {
  // This is a presentational component - state handled by container
  return (
    <div className={`sk-onboarding-step sk-identity-step ${className || ""}`}>
      <h2>Your identity</h2>
      <p className="sk-step-sub">How you&apos;ll appear in Sutaeru. Your handle is unique.</p>

      <form className="sk-onboarding-form" onSubmit={(e) => { e.preventDefault(); onNext({ displayName: "", handle: "", bio: "" }); }}>
        <label className="sk-field">
          <span className="sk-label">Display name</span>
          <input type="text" autoComplete="name" placeholder="Your name" defaultValue={initialData?.displayName || ""} />
        </label>
        <label className="sk-field">
          <span className="sk-label">@handle</span>
          <div className="sk-handle-input">
            <span className="sk-handle-prefix">@</span>
            <input type="text" autoComplete="username" placeholder="yourhandle" defaultValue={initialData?.handle || ""} />
          </div>
          <p className="sk-field-hint">Letters, numbers, underscores. 3&ndash;30 characters.</p>
        </label>
        <label className="sk-field">
          <span className="sk-label">Bio (optional)</span>
          <textarea rows={3} placeholder="What you do, what you&apos;re into&hellip;" defaultValue={initialData?.bio || ""} />
        </label>

        <div className="sk-step-actions">
          <button type="button" className="btn ghost" onClick={onBack}>
            <ChevronLeft className="ico" aria-hidden="true" />
            Back
          </button>
          <button type="submit" className="btn ink big">Continue</button>
        </div>
      </form>
    </div>
  );
}

export interface SkillData {
  name: string;
  description: string;
  type: "prompt" | "workflow" | "tool_definition" | "behavior";
}

const SKILL_TYPE_LABELS: Record<SkillData["type"], string> = {
  prompt: "Prompt",
  workflow: "Workflow",
  tool_definition: "Tool",
  behavior: "Behavior",
};

export interface SkillsStepProps {
  initialData: SkillData[];
  onNext: (skills: SkillData[]) => void;
  onBack: () => void;
  onSkip: () => void;
  className?: string;
}

export function SkillsStep({ initialData, onNext, onBack, onSkip, className }: SkillsStepProps) {
  return (
    <div className={`sk-onboarding-step sk-skills-step ${className || ""}`}>
      <h2>Your skills</h2>
      <p className="sk-step-sub">Tell Sutaeru what you&apos;re good at so it can help better. Optional.</p>

      <form className="sk-onboarding-form" onSubmit={(e) => { e.preventDefault(); onNext(initialData); }}>
        <div className="sk-skills-list" role="list" aria-label="Your skills">
          {initialData.map((skill, index) => (
            <div key={index} className="sk-skill-item">
              <div className="sk-skill-info">
                <strong>{skill.name}</strong>
                <span className="sk-skill-type">{SKILL_TYPE_LABELS[skill.type]}</span>
              </div>
              <p className="sk-skill-desc">{skill.description}</p>
            </div>
          ))}
          {initialData.length === 0 && (
            <p className="sk-skills-empty">No skills added yet.</p>
          )}
        </div>

        <button type="button" className="sk-add-skill btn" onClick={() => {}}>
          <svg className="ico" viewBox="0 0 96 96" aria-hidden="true"><path d="M48 20v56M20 48h56"/></svg>
          Add a skill
        </button>

        <div className="sk-step-actions">
          <button type="button" className="btn ghost" onClick={onBack}>
            <ChevronLeft className="ico" aria-hidden="true" />
            Back
          </button>
          <button type="button" className="btn" onClick={onSkip}>Skip for now</button>
          <button type="submit" className="btn ink big">Continue</button>
        </div>
      </form>
    </div>
  );
}

export interface ApiKeyData {
  provider: string;
  apiKey: string;
}

export interface ApiKeyStepProps {
  initialData?: ApiKeyData;
  onNext: (data: ApiKeyData) => void;
  onBack: () => void;
  onSkip: () => void;
  className?: string;
}

export function ApiKeyStep({ initialData, onNext, onBack, onSkip, className }: ApiKeyStepProps) {
  const providers = [
    { id: "openai", name: "OpenAI", env: "OPENAI_API_KEY" },
    { id: "anthropic", name: "Anthropic", env: "ANTHROPIC_API_KEY" },
    { id: "google", name: "Google (Gemini)", env: "GOOGLE_API_KEY" },
    { id: "other", name: "Other (OpenAI-compatible)", env: "CUSTOM_API_KEY" },
  ];

  return (
    <div className={`sk-onboarding-step sk-apikey-step ${className || ""}`}>
      <h2>Connect AI</h2>
      <p className="sk-step-sub">Add an API key so Sutaeru can use your preferred model. Optional.</p>

      <form className="sk-onboarding-form" onSubmit={(e) => { e.preventDefault(); onNext(initialData || { provider: "", apiKey: "" }); }}>
        <label className="sk-field">
          <span className="sk-label">Provider</span>
          <select defaultValue={initialData?.provider || ""}>
            <option value="">Select a provider</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="sk-field">
          <span className="sk-label">API Key</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="sk-&hellip; or your key"
            defaultValue={initialData?.apiKey || ""}
          />
          <p className="sk-field-hint">Stored encrypted. Never shared.</p>
        </label>

        <div className="sk-step-actions">
          <button type="button" className="btn ghost" onClick={onBack}>
            <ChevronLeft className="ico" aria-hidden="true" />
            Back
          </button>
          <button type="button" className="btn" onClick={onSkip}>Skip for now</button>
          <button type="submit" className="btn ink big">Continue</button>
        </div>
      </form>
    </div>
  );
}

export interface DoneStepProps {
  identity: IdentityData;
  skills: SkillData[];
  apiKey?: ApiKeyData;
  onComplete: () => void;
  isLoading: boolean;
  className?: string;
}

export function DoneStep({ identity, skills, apiKey, onComplete, isLoading, className }: DoneStepProps) {
  return (
    <div className={`sk-onboarding-step sk-done-step ${className || ""}`}>
      <SutaeruSeal className="sk-done-seal" rough={false} />
      <h2>You&apos;re all set, {identity.displayName}!</h2>
      <p className="sk-step-sub">Here&apos;s what we&apos;ve configured for you.</p>

      <div className="sk-done-summary">
        <div className="sk-done-item">
          <SutaeruGlyph detail="compact" size={32} className="sk-done-icon" />
          <div>
            <strong>Identity</strong>
            <span>{identity.displayName} {identity.handle && `(@${identity.handle})`}</span>
          </div>
        </div>
        <div className="sk-done-item">
          <svg className="sk-done-icon ico" viewBox="0 0 96 96" aria-hidden="true"><path d="M48 17c18 0 29 13 29 31v25H19V48c0-18 11-31 29-31Z"/><circle cx="48" cy="47" r="14"/></svg>
          <div>
            <strong>Skills</strong>
            <span>{skills.length} skill{skills.length !== 1 ? "s" : ""} added</span>
          </div>
        </div>
        {apiKey && (
          <div className="sk-done-item">
            <svg className="sk-done-icon ico" viewBox="0 0 96 96" aria-hidden="true"><rect x="23" y="42" width="50" height="37" rx="6"/></svg>
            <div>
              <strong>AI Connection</strong>
              <span>{apiKey.provider} connected</span>
            </div>
          </div>
        )}
      </div>

      <button type="button" className="btn ink big" onClick={onComplete} disabled={isLoading}>
        {isLoading ? (
          <>
            <span className="sk-spinner" aria-hidden="true" />
            Setting up&hellip;
          </>
        ) : (
          "Enter Sutaeru"
        )}
      </button>
    </div>
  );
}

export default { OnboardingProgress, WelcomeStep, IdentityStep, SkillsStep, ApiKeyStep, DoneStep };