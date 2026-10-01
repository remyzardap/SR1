interface StepDef {
  id: string;
  label: string;
}

interface ProgressIndicatorProps {
  steps: StepDef[];
  currentStepId: string;
}

/** Segmented progress bar with a mono "STEP n OF N" caption (matches the onboarding reference). */
export function ProgressIndicator({ steps, currentStepId }: ProgressIndicatorProps) {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.id === currentStepId));

  return (
    <div className="sk-progress-steps" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={currentIndex + 1} aria-label={`Step ${currentIndex + 1} of ${steps.length}: ${steps[currentIndex]?.label ?? ""}`}>
      <div className="sk-progress-bars">
        {steps.map((step, index) => (
          <span key={step.id} className={index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : ""} />
        ))}
      </div>
      <p className="sk-progress-caption">Step {currentIndex + 1} of {steps.length}</p>
    </div>
  );
}
