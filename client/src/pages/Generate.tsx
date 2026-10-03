import { useMemo } from "react";
import { useLocation } from "wouter";
import { PageTitle } from "@/components/chrome/PageTitle";
import { FocusBrackets } from "@/components/art/FocusBrackets";
import { ConvergeBar } from "@/components/art/ConvergeBar";
import { HalftoneRamp } from "@/components/art/HalftoneRamp";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import "@/styles/documents-start.css";

interface GenerateOption {
  id: string;
  path: string;
  label: string;
  title: string;
  text: string;
  art: React.ReactNode;
}

const GENERATE_OPTIONS: GenerateOption[] = [
  {
    id: "image",
    path: "/images",
    label: "IMAGE",
    title: "Images",
    text: "Describe a picture and choose which engine draws it.",
    art: (
      <svg viewBox="0 0 240 150" aria-hidden="true">
        <rect x="36" y="16" width="168" height="114" rx="16" className="a-paper" />
        <circle cx="82" cy="52" r="14" className="a-spot" />
        <path d="M48 116l46-44 38 34 26-22 36 32" className="a-line" />
        <circle cx="178" cy="40" r="4.5" fill="var(--r-accent, #F4511E)" />
      </svg>
    ),
  },
  {
    id: "video",
    path: "/video",
    label: "VIDEO",
    title: "Video",
    text: "Cinematic motion from prompts or reference photos.",
    art: (
      <svg viewBox="0 0 240 150" aria-hidden="true">
        <rect x="36" y="20" width="168" height="106" rx="16" className="a-paper" />
        <path d="m105 52 42 21-42 21V52Z" className="a-spot" />
        <rect x="52" y="32" width="14" height="10" rx="2" className="a-mark" />
        <rect x="74" y="32" width="14" height="10" rx="2" className="a-mark" />
        <rect x="152" y="32" width="14" height="10" rx="2" className="a-mark" />
        <rect x="174" y="32" width="14" height="10" rx="2" className="a-mark" />
        <circle cx="184" cy="98" r="4" fill="var(--r-accent, #F4511E)" />
      </svg>
    ),
  },
  {
    id: "document",
    path: "/documents",
    label: "DOCUMENT",
    title: "Documents",
    text: "Brief it, interview, or edit an existing file.",
    art: (
      <svg viewBox="0 0 240 150" aria-hidden="true">
        <rect x="74" y="14" width="92" height="120" rx="10" className="a-paper" />
        <path d="M90 44h60M90 60h60M90 76h42" className="a-line" />
        <circle cx="174" cy="40" r="22" className="a-spot" />
        <path d="M174 28v24M162 40h24" className="a-plus" />
      </svg>
    ),
  },
  {
    id: "research",
    path: "/chat?mode=deep",
    label: "RESEARCH",
    title: "Deep research",
    text: "Multi-step web research with citations and reports.",
    art: (
      <svg viewBox="0 0 240 150" aria-hidden="true">
        <rect x="42" y="28" width="112" height="88" rx="14" className="a-paper" />
        <path d="M60 52h76M60 68h60M60 84h40" className="a-line" />
        <circle cx="166" cy="62" r="26" className="a-spot" />
        <circle cx="166" cy="62" r="16" fill="var(--r-paper, #F7F6F2)" />
        <path d="m178 74 24 24" stroke="var(--r-ink, #242320)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="166" cy="62" r="4" fill="var(--r-accent, #F4511E)" />
      </svg>
    ),
  },
];

interface RunningJobInfo {
  type: string;
  title: string;
  progress: number;
  eta: string;
  elapsed: string;
  steps: Array<{ label: string; status: "done" | "running" | "pending"; detail?: string }>;
  destination?: string;
}

export default function Generate() {
  useSeoMeta({ title: "Generate", path: "/generate" });
  const [, navigate] = useLocation();

  const runningJob = useMemo<RunningJobInfo | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const isDemo = params.get("running") === "true" || params.get("demo") === "running";
    if (isDemo) {
      return {
        type: "DEEP RESEARCH",
        title: "Solar cost comparison",
        progress: 0.62,
        eta: "1 MIN LEFT",
        elapsed: "02:41",
        steps: [
          { label: "Plan the research", status: "done" },
          { label: "Search the web", status: "done" },
          { label: "Read 14 sources", status: "done" },
          { label: "Compare vendors", status: "running", detail: "vendor_quotes.xlsx" },
          { label: "Write the report", status: "pending" },
        ],
        destination: "Sutaeru sends it to Telegram.",
      };
    }
    try {
      const stored = localStorage.getItem("sutaeru.activeJob");
      if (stored) return JSON.parse(stored) as RunningJobInfo;
    } catch {
      // ignore
    }
    return null;
  }, []);

  return (
    <div className="sk-page h-full overflow-y-auto px-5 pt-6 pb-28 max-w-2xl mx-auto">
      <header className="mb-6">
        <PageTitle>Generate</PageTitle>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--r-quiet)]">
          {runningJob
            ? "Track in-progress generation or choose a new task."
            : "Choose what to create, or monitor work in progress."}
        </p>
      </header>

      {/* Running now area (04-generate canvas state) */}
      {runningJob && (
        <section className="flex flex-col gap-4 mb-8" aria-label="Running generation">
          {/* Progress Card */}
          <div className="rounded-[28px] bg-[var(--r-card)] border border-[var(--r-card-stroke)] p-6 shadow-sm">
            <div className="flex items-center gap-2 art-mono text-[11px] font-medium tracking-[1.54px] uppercase text-[var(--r-quiet)] mb-3">
              <span className="size-2 rounded-full bg-[var(--r-accent)] inline-block" aria-hidden="true" />
              <span>{runningJob.type} · RUNNING</span>
            </div>

            <div className="flex items-baseline justify-between mb-4">
              <span className="font-['Inter_Tight',sans-serif] text-[42px] font-extrabold leading-none tracking-[-2px] text-[var(--r-ink)]">
                {Math.round(runningJob.progress * 100)}%
              </span>
              <div className="text-right art-mono text-[11px] font-medium tracking-[1.54px] uppercase text-[var(--r-quiet)] leading-tight">
                <div>{runningJob.eta}</div>
                <div className="text-[var(--r-rule)] mt-0.5">ELAPSED {runningJob.elapsed}</div>
              </div>
            </div>

            <ConvergeBar progress={runningJob.progress} showPercent={false} ariaLabel="Generation progress" />
          </div>

          {/* Steps Timeline Card */}
          <div className="rounded-[28px] bg-[var(--r-card)] border border-[var(--r-card-stroke)] p-6 shadow-sm">
            <div className="relative pl-6 flex flex-col gap-5">
              {/* Connecting vertical line */}
              <div
                className="absolute left-[7px] top-2 bottom-3 w-[2px] bg-[var(--r-rule)] opacity-40"
                aria-hidden="true"
              />

              {runningJob.steps.map((step, idx) => {
                const isDone = step.status === "done";
                const isRunning = step.status === "running";

                return (
                  <div key={idx} className="relative flex items-start gap-3">
                    {/* Node Dot */}
                    <span
                      className={`absolute -left-[23px] top-1 size-4 rounded-full flex items-center justify-center transition-colors ${
                        isDone
                          ? "bg-[var(--r-ink)]"
                          : isRunning
                          ? "bg-[var(--r-accent)] ring-4 ring-[var(--r-accent)]/20"
                          : "bg-[var(--r-rule)]"
                      }`}
                      aria-hidden="true"
                    />

                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-[15px] leading-snug ${
                          isDone
                            ? "text-[var(--r-ink)] font-semibold"
                            : isRunning
                            ? "text-[var(--r-ink)] font-bold"
                            : "text-[var(--r-quiet)]"
                        }`}
                      >
                        {step.label}
                      </div>

                      {step.detail && (
                        <div className="relative inline-block mt-2 px-3 py-1 bg-[var(--r-panel)] rounded-lg text-[12px] art-mono text-[var(--r-ink)]">
                          <FocusBrackets tone="ink" />
                          <span>{step.detail}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delivery Card */}
          {runningJob.destination && (
            <div className="relative overflow-hidden rounded-[28px] bg-[var(--r-ink)] text-[var(--r-paper)] p-6 shadow-sm flex items-center justify-between">
              <div className="relative z-10 max-w-[65%]">
                <span className="art-mono block text-[11px] font-medium tracking-[1.54px] uppercase text-[var(--r-rule)] mb-1">
                  WHEN IT IS DONE
                </span>
                <p className="text-[17px] font-bold leading-snug text-[var(--r-paper)]">
                  {runningJob.destination}
                </p>
              </div>

              <div className="relative shrink-0 text-[var(--r-paper)] opacity-80" aria-hidden="true">
                <HalftoneRamp columns={7} rows={6} cell={10} minRadius={0.8} maxRadius={3.2} />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Visual Option Cards */}
      <section aria-label="Creation options">
        {runningJob && (
          <span className="art-mono block text-[11px] font-medium tracking-[1.54px] uppercase text-[var(--r-quiet)] mb-3">
            START SOMETHING ELSE
          </span>
        )}

        <div className="sk-doc-grid">
          {GENERATE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => navigate(opt.path)}
              className="sk-doc-card text-left focus:outline-none"
            >
              <span className="sk-doc-art">{opt.art}</span>
              <span className="sk-doc-body">
                <span className="sk-doc-label">{opt.label}</span>
                <span className="sk-doc-title">{opt.title}</span>
                <span className="sk-doc-text">{opt.text}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
