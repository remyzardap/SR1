import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText,
  Table,
  Presentation,
  FileCode,
  Sparkles,
  Loader2,
  CheckCircle2,
  Download,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const FORMAT_OPTIONS: { value: Format; label: string; icon: React.ElementType; desc: string }[] = [
  { value: "pdf", label: "PDF", icon: FileText, desc: "Portable, print-ready" },
  { value: "docx", label: "Word", icon: FileText, desc: "Editable document" },
  { value: "xlsx", label: "Excel", icon: Table, desc: "Spreadsheet with data" },
  { value: "pptx", label: "PowerPoint", icon: Presentation, desc: "Slide presentation" },
  { value: "md", label: "Markdown", icon: FileCode, desc: "Plain text markup" },
];

const STYLE_COLORS: Record<string, { bg: string; accent: string; text: string }> = {
  minimal: { bg: "#f8fafc", accent: "#6366f1", text: "#1a1a1a" },
  corporate: { bg: "#eff6ff", accent: "#1e3a5f", text: "#1e3a5f" },
  creative: { bg: "#faf5ff", accent: "#7c3aed", text: "#4c1d95" },
  "serif-classic": { bg: "#fefce8", accent: "#b45309", text: "#292524" },
  "dark-tech": { bg: "#0f172a", accent: "#22d3ee", text: "#e2e8f0" },
};

type Step = "prompt" | "styles" | "generating" | "done";

export default function Generate() {
  const [step, setStep] = useState<Step>("prompt");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<Format>("pdf");
  const [styleCards, setStyleCards] = useState<StyleCard[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [generatedFile, setGeneratedFile] = useState<{ name: string; url: string } | null>(null);

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Progress steps */}
      <div className="mb-10 flex items-center gap-2 text-sm">
        {(["prompt", "styles", "generating", "done"] as Step[]).map((s, i) => {
          const labels: Record<Step, string> = {
            prompt: "Describe",
            styles: "Choose Style",
            generating: "Generating",
            done: "Done",
          };
          const isActive = step === s;
          const isPast =
            ["prompt", "styles", "generating", "done"].indexOf(step) >
            ["prompt", "styles", "generating", "done"].indexOf(s);
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <span
                className={cn(
                  "rounded-full px-3 py-1 font-medium transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                  isPast && "text-muted-foreground line-through",
                  !isActive && !isPast && "text-muted-foreground"
                )}
              >
                {labels[s]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step 1: Prompt */}
      {step === "prompt" && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display mb-1 text-2xl font-700 text-foreground">
              What would you like to create?
            </h1>
            <p className="text-sm text-muted-foreground">
              Describe the content, purpose, and any key details. The more context, the better the result.
            </p>
          </div>

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A quarterly business report for a SaaS startup showing revenue growth, churn rate, and key milestones for Q3 2025..."
            className="min-h-[140px] resize-none text-base"
            maxLength={2000}
          />
          <div className="text-right text-xs text-muted-foreground">{prompt.length}/2000</div>

          {/* Format selector */}
          <div>
            <label className="mb-3 block text-sm font-medium text-foreground">Output format</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all",
                    format === opt.value
                      ? "border-primary bg-accent text-accent-foreground ring-2 ring-primary"
                      : "border-border bg-card text-card-foreground hover:border-primary/40 hover:bg-accent/50"
                  )}
                >
                  <opt.icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={handleGetStyles}
            disabled={!prompt.trim() || getStylesMutation.isPending}
          >
            {getStylesMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating styles...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Choose a Style</>
            )}
          </Button>
        </div>
      )}

      {/* Step 2: Style cards */}
      {step === "styles" && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display mb-1 text-2xl font-700 text-foreground">
              Pick your visual style
            </h1>
            <p className="text-sm text-muted-foreground">
              Each card represents a different aesthetic. Click one to select it, then generate.
            </p>
          </div>

          {getStylesMutation.isPending ? (
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">AI is crafting style options for you...</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {styleCards.map((card) => {
                const colors = STYLE_COLORS[card.id] ?? STYLE_COLORS["minimal"];
                const isSelected = selectedStyle === card.id;
                return (
                  <button
                    key={card.id}
                    onClick={() => setSelectedStyle(card.id)}
                    className={cn(
                      "style-card group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all",
                      isSelected
                        ? "selected border-primary ring-2 ring-primary"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    {/* Visual preview */}
                    <div
                      className="h-28 w-full p-4"
                      style={{ background: colors.bg }}
                    >
                      <div
                        className="mb-1.5 h-2.5 w-3/4 rounded-full"
                        style={{ background: colors.accent }}
                      />
                      <div
                        className="mb-1 h-1.5 w-full rounded-full opacity-30"
                        style={{ background: colors.text }}
                      />
                      <div
                        className="mb-1 h-1.5 w-5/6 rounded-full opacity-20"
                        style={{ background: colors.text }}
                      />
                      <div
                        className="h-1.5 w-4/6 rounded-full opacity-20"
                        style={{ background: colors.text }}
                      />
                      {card.previewText && (
                        <p
                          className="mt-2 line-clamp-2 text-xs opacity-60"
                          style={{ color: colors.text, fontFamily: card.fontStyle === "serif" ? "Georgia, serif" : card.fontStyle === "monospace" ? "monospace" : "inherit" }}
                        >
                          {card.previewText}
                        </p>
                      )}
                    </div>

                    {/* Card info */}
                    <div className="flex flex-1 flex-col gap-1 bg-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-600 text-foreground">{card.label}</span>
                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{card.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("prompt")} className="flex-1">
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleGenerate}
              disabled={!selectedStyle || generateMutation.isPending}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Generate {format.toUpperCase()}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Generating */}
      {step === "generating" && (
        <div className="flex flex-col items-center gap-6 py-24 text-center">
          <div className="relative">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="font-display mb-2 text-xl font-700 text-foreground">
              Generating your {format.toUpperCase()}...
            </h2>
            <p className="text-sm text-muted-foreground">
              The AI is writing and formatting your document. This usually takes 10–30 seconds.
            </p>
          </div>
          <div className="flex gap-2">
            {["Writing content", "Applying style", "Building file"].map((label, i) => (
              <Badge key={label} variant="secondary" className="animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>
                {label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && generatedFile && (
        <div className="flex flex-col items-center gap-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h2 className="font-display mb-2 text-2xl font-700 text-foreground">
              Your file is ready!
            </h2>
            <p className="text-muted-foreground">{generatedFile.name}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href={generatedFile.url} target="_blank" rel="noopener noreferrer" download>
                <Download className="mr-2 h-4 w-4" />
                Download File
              </a>
            </Button>
            <Button variant="outline" size="lg" onClick={handleReset}>
              Generate Another
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your file has been saved to the{" "}
            <a href="/files" className="text-primary underline underline-offset-2">
              File Manager
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
