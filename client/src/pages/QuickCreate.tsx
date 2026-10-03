import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { ConvergeBar, FocusBrackets } from "@/components/art";
import { useTimedProgress } from "@/hooks/useTimedProgress";
import "@/styles/atelier-reskin.css";

type Format = "pdf" | "docx" | "xlsx" | "pptx" | "md";

interface StyleCard {
  id: string;
  label: string;
  description: string;
  previewText: string;
  primaryColor: string;
  accentColor: string;
  fontStyle: string;
  layout: string;
}

const FORMAT_OPTIONS: { value: Format; label: string; desc: string }[] = [
  { value: "pdf", label: "PDF", desc: "Portable, print-ready" },
  { value: "docx", label: "Word", desc: "Editable document" },
  { value: "xlsx", label: "Excel", desc: "Spreadsheet with data" },
  { value: "pptx", label: "PowerPoint", desc: "Slide presentation" },
  { value: "md", label: "Markdown", desc: "Plain text markup" },
];

const STYLE_COLORS: Record<string, { bg: string; accent: string; text: string }> = {
  minimal: { bg: "#f8fafc", accent: "#6366f1", text: "#1a1a1a" },
  corporate: { bg: "#eff6ff", accent: "#1e3a5f", text: "#1e3a5f" },
  creative: { bg: "#faf5ff", accent: "#7c3aed", text: "#4c1d95" },
  "serif-classic": { bg: "#fefce8", accent: "#b45309", text: "#292524" },
  "dark-tech": { bg: "#0f172a", accent: "#22d3ee", text: "#e2e8f0" },
};

type Step = "prompt" | "styles" | "generating" | "done";

const STEPS: Step[] = ["prompt", "styles", "generating", "done"];
const STEP_LABELS: Record<Step, string> = {
  prompt: "Describe",
  styles: "Choose Style",
  generating: "Generating",
  done: "Done",
};

/** Vertical step timeline in the running view: done is ink, current is orange, pending is grey. */
function StepTimeline({ step }: { step: Step }) {
  const current = STEPS.indexOf(step);
  return (
    <ol className="sk-at-timeline">
      {STEPS.map((s, i) => {
        const state = i < current ? "is-done" : i === current ? "is-active" : "";
        const stateLabel = i < current ? "Done" : i === current ? "In progress" : "";
        return (
          <li key={s} className={`sk-at-step${state ? ` ${state}` : ""}`} aria-current={i === current ? "step" : undefined}>
            <span className="sk-at-step-dot" aria-hidden="true" />
            <span className="sk-at-step-label">{STEP_LABELS[s]}</span>
            <span className="sk-at-step-state">{stateLabel}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function QuickCreate({ embedded = false }: { embedded?: boolean } = {}) {
  const [step, setStep] = useState<Step>("prompt");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<Format>("pdf");
  const [styleCards, setStyleCards] = useState<StyleCard[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [generatedFile, setGeneratedFile] = useState<{ name: string; url: string } | null>(null);

  // The generate call reports no percentage; the bar runs on a time estimate.
  const run = useTimedProgress(step === "generating", 20);

  const getStylesMutation = trpc.files.getStyleOptions.useMutation({
    onSuccess: (data) => {
      setStyleCards(data);
      setStep("styles");
    },
    onError: (err) => {
      toast.error("Failed to generate style options: " + err.message);
    },
  });

  const generateMutation = trpc.files.generate.useMutation({
    onSuccess: (data) => {
      setGeneratedFile({ name: data.file?.name ?? "Generated File", url: data.downloadUrl });
      setStep("done");
    },
    onError: (err) => {
      toast.error("Generation failed: " + err.message);
      setStep("styles");
    },
  });

  const handleGetStyles = () => {
    if (!prompt.trim()) { toast.error("Please enter a prompt first"); return; }
    getStylesMutation.mutate({ prompt, format });
    setStep("styles");
  };

  const handleGenerate = () => {
    if (!selectedStyle) { toast.error("Please select a style first"); return; }
    setStep("generating");
    generateMutation.mutate({ prompt, format, styleId: selectedStyle });
  };

  const handleReset = () => {
    setStep("prompt");
    setPrompt("");
    setFormat("pdf");
    setStyleCards([]);
    setSelectedStyle(null);
    setGeneratedFile(null);
  };

  const activeFormat = FORMAT_OPTIONS.find((opt) => opt.value === format);
  const runTitle = prompt.trim() || `${activeFormat?.label ?? "File"} file`;
  const statusWord = step === "generating" ? "Running" : step === "done" ? "Done" : "Ready";

  return (
    <div className={embedded ? "sk-at-flow w-full" : "sk-page sk-at-flow mx-auto max-w-5xl"}>
      <div className="sk-at-main">
        {/* Step 1: Prompt */}
        {step === "prompt" && (
          <section className="sk-card flex flex-col gap-6">
            <div>
              <h2 className="sk-at-run-title" style={{ marginTop: 0 }}>
                What would you like to create?
              </h2>
              <p className="sk-sub" style={{ margin: 0 }}>
                Describe the content, purpose, and any key details. The more context, the better the result.
              </p>
            </div>

            <div className="sk-field">
              <span className="sk-label">Output format</span>
              <div className="sk-row" role="radiogroup" aria-label="Output format">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={format === opt.value}
                    onClick={() => setFormat(opt.value)}
                    className={`sk-pill sk-pill-sm${format === opt.value ? " is-active" : ""}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="sk-empty-text" style={{ marginTop: 8 }}>{activeFormat?.desc}</p>
            </div>

            <div className="sk-field">
              <label className="sk-label" htmlFor="quick-create-prompt">Prompt</label>
              <textarea
                id="quick-create-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. A quarterly business report for a SaaS startup showing revenue growth, churn rate, and key milestones for Q3 2025..."
                className="sk-textarea"
                style={{ minHeight: 160 }}
                maxLength={2000}
              />
              <span className="sk-label sk-num" style={{ display: "block", marginTop: 8, textAlign: "right" }}>
                {prompt.length} / 2000
              </span>
            </div>

            <button
              type="button"
              className="sk-btn self-start"
              onClick={handleGetStyles}
              disabled={!prompt.trim() || getStylesMutation.isPending}
            >
              {getStylesMutation.isPending ? (
                <><span className="sk-at-spin" aria-hidden="true" /> Generating styles...</>
              ) : (
                <><SutaeruIcon name="make" className="size-4" /> Choose a Style</>
              )}
            </button>
          </section>
        )}

        {/* Step 2: Style cards */}
        {step === "styles" && (
          <section className="sk-card flex flex-col gap-6">
            <div>
              <h2 className="sk-at-run-title" style={{ marginTop: 0 }}>
                Pick your visual style
              </h2>
              <p className="sk-sub" style={{ margin: 0 }}>
                Each card represents a different aesthetic. Click one to select it, then generate.
              </p>
            </div>

            {getStylesMutation.isPending ? (
              <div className="sk-empty">
                <span className="sk-at-spin" aria-hidden="true" />
                <p className="sk-empty-text">AI is crafting style options for you...</p>
              </div>
            ) : (
              <div className="sk-at-tiles" role="radiogroup" aria-label="Visual style">
                {styleCards.map((card) => {
                  const colors = STYLE_COLORS[card.id] ?? STYLE_COLORS["minimal"];
                  const isSelected = selectedStyle === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedStyle(card.id)}
                      className={`sk-tile sk-at-tile${isSelected ? " is-active" : ""}`}
                    >
                      {isSelected && <FocusBrackets />}
                      {isSelected && (
                        <span className="sk-at-tile-check" aria-hidden="true">
                          <SutaeruIcon name="check" />
                        </span>
                      )}

                      {/* Visual preview: keeps the style's own swatch colors, it depicts the output */}
                      <div className="sk-at-swatch" style={{ background: colors.bg }}>
                        <span className="sk-at-swatch-line" style={{ width: "72%", background: colors.accent }} />
                        <span className="sk-at-swatch-line" style={{ width: "100%", background: colors.text, opacity: 0.3 }} />
                        <span className="sk-at-swatch-line" style={{ width: "84%", background: colors.text, opacity: 0.2 }} />
                        <span className="sk-at-swatch-line" style={{ width: "66%", background: colors.text, opacity: 0.2 }} />
                        {card.previewText && (
                          <p
                            className="sk-at-swatch-text"
                            style={{ color: colors.text, fontFamily: card.fontStyle === "serif" ? "Georgia, serif" : card.fontStyle === "monospace" ? "monospace" : "inherit" }}
                          >
                            {card.previewText}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <p className="sk-tile-title">{card.label}</p>
                        <p className="sk-empty-text">{card.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="sk-row">
              <button type="button" className="sk-btn sk-btn-ghost" onClick={() => setStep("prompt")}>
                Back
              </button>
              <button
                type="button"
                className="sk-btn"
                onClick={handleGenerate}
                disabled={!selectedStyle || generateMutation.isPending}
              >
                <SutaeruIcon name="make" className="size-4" />
                Generate {format.toUpperCase()}
              </button>
            </div>
          </section>
        )}

        {/* Step 3: Generating */}
        {step === "generating" && (
          <section className="sk-card flex flex-col gap-5" role="status" aria-live="polite">
            <div className="sk-at-run-top">
              <span className="sk-at-status">
                <span className="sk-dot sk-dot-ink" aria-hidden="true" /> Generating
              </span>
              <span className="sk-meta sk-num">STEP {STEPS.indexOf(step) + 1} OF {STEPS.length}</span>
            </div>
            <div>
              <h2 className="sk-at-run-title" style={{ marginTop: 0 }}>
                Generating your {format.toUpperCase()}...
              </h2>
              <p className="sk-sub" style={{ margin: 0 }}>
                The AI is writing and formatting your document. This usually takes 10-30 seconds.
              </p>
            </div>
            <ConvergeBar progress={run.progress} etaSeconds={run.etaSeconds} dots={7} label="DRAFTING THE PAGE" ariaLabel={`Generating your ${format.toUpperCase()}`} />
            <div className="sk-at-now">
              <span className="sk-at-now-label">Now</span>
              <div className="sk-at-now-row">
                {["Writing content", "Applying style", "Building file"].map((label, i) => (
                  <span key={label} className="sk-chip" style={{ animation: "sk-pulse 1.6s ease-in-out infinite", animationDelay: `${i * 0.3}s` }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Step 4: Done */}
        {step === "done" && generatedFile && (
          <section className="sk-card flex flex-col gap-6 sk-at-result" role="status" aria-live="polite">
            <FocusBrackets />
            <div className="sk-between">
              <span className="sk-icon-tile">
                <SutaeruIcon name="check" />
              </span>
              <span className="sk-chip sk-chip-idle">
                <span className="sk-dot sk-dot-ink" aria-hidden="true" /> Done
              </span>
            </div>
            <ConvergeBar progress={1} state="done" etaOverride={`TOOK ${Math.max(1, run.elapsedSeconds)} S`} showPercent={false} ariaLabel="Document finished" />
            <div>
              <h2 className="sk-at-run-title" style={{ marginTop: 0 }}>
                Your file is ready!
              </h2>
              <p className="sk-sub" style={{ margin: 0 }}>{generatedFile.name}</p>
            </div>
            <div className="sk-row">
              <a
                href={generatedFile.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="sk-btn"
              >
                <SutaeruIcon name="download" className="size-4" /> Download File
              </a>
              <button type="button" className="sk-btn sk-btn-ghost" onClick={handleReset}>
                Generate Another
              </button>
            </div>
            <p className="sk-empty-text">
              Your file has been saved to the{" "}
              <a
                href="/files"
                style={{ color: "var(--art-ink)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                File Manager
              </a>
            </p>
          </section>
        )}
      </div>

      {/* Running view */}
      <aside className="sk-at-rail">
        <div className="sk-card">
          <div className="sk-at-run-top">
            <span className="sk-at-status">
              <span className="sk-dot" aria-hidden="true" /> Generate · {statusWord}
            </span>
            <span className="sk-meta sk-num">STEP {STEPS.indexOf(step) + 1} OF {STEPS.length}</span>
          </div>
          <p className="sk-at-run-title">{runTitle}</p>
          <StepTimeline step={step} />
          <div className="sk-at-now">
            <span className="sk-at-now-label">Now</span>
            <p className="sk-at-now-text">
              {step === "prompt" && "Write the prompt and pick the output format."}
              {step === "styles" && "Choose one of the styles, then generate the file."}
              {step === "generating" && `Building your ${activeFormat?.label ?? "file"}.`}
              {step === "done" && "The file is finished and saved to the File Manager."}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
