import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { Button } from "@/components/ui/button";
import { FocusBrackets, LinearDitherBar, StatusPill, Toggle } from "@/components/art";
import "@/styles/list-pages.css";

/** A review is one LLM pass over the skill folder; the bar is timed against that. */
const REVIEW_SECONDS = 25;

export function AgentSkillsPanel() {
  const utils = (trpc as any).useUtils();
  const list = (trpc as any).kemma.agentSkills.useQuery(undefined, { retry: false });
  const [open, setOpen] = useState<string | null>(null);
  // When a review started, so the bar and its countdown can move between renders.
  const [reviewClock, setReviewClock] = useState<{ slug: string; startedAt: number } | null>(null);
  const [, setSecond] = useState(0);

  const refresh = () => utils.kemma.agentSkills.invalidate();
  const review = (trpc as any).kemma.reviewAgentSkill.useMutation({
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = (trpc as any).kemma.setAgentSkillEnabled.useMutation({
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewingSlug = review.isPending ? String(review.variables?.slug ?? "") : undefined;
  useEffect(() => {
    if (!reviewingSlug) {
      setReviewClock(null);
      return;
    }
    setReviewClock((prev) => (prev?.slug === reviewingSlug ? prev : { slug: reviewingSlug, startedAt: Date.now() }));
    const timer = window.setInterval(() => setSecond((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [reviewingSlug]);

  // Owner-only: hide for non-admins and when the server has no skill folders.
  if (list.isLoading) {
    return (
      <div className="lp-card lp-stack mb-5" aria-label="Loading skill folders">
        <span className="lp-mono">Skill folders</span>
        <span className="lp-skeleton" style={{ height: 20, width: "40%" }} />
        <span className="lp-skeleton" style={{ height: 14, width: "70%" }} />
      </div>
    );
  }
  if (list.isError || !list.data || list.data.length === 0) return null;

  return (
    <section className="lp-card mb-5">
      <header className="mb-4 flex items-start gap-4">
        <span className="lp-tile mt-0.5">
          <SutaeruIcon name="review" />
        </span>
        <div className="min-w-0">
          <p className="lp-mono">Owner only</p>
          <h2 className="lp-row-title m-0 mt-1">Skill folders</h2>
          <p className="mt-1 mb-0 max-w-2xl lp-body">
            Kemma only uses a skill after you review it and switch it on. Editing a skill file switches it off until you review it again.
          </p>
        </div>
      </header>

      <ul className="m-0 list-none p-0 lp-rows">
        {list.data.map((s: any) => {
          const reviewing = reviewingSlug === s.slug;
          const busy = reviewing || (toggle.isPending && toggle.variables?.slug === s.slug);
          const isOpen = open === s.slug;
          const on = s.status === "enabled";
          const elapsed = reviewing && reviewClock ? (Date.now() - reviewClock.startedAt) / 1000 : 0;
          return (
            <li key={s.slug} className="lp-row lp-row-block">
              {/* The folder being reviewed, or the one whose report is open, is the active row. */}
              {(reviewing || isOpen) && <FocusBrackets />}
              <div className="lp-row-main">
                <div className="lp-row-foot" style={{ marginTop: 0 }}>
                  <span className="lp-row-title truncate">{s.slug}</span>
                  <StatusPill status={on ? "running" : s.status === "rejected" ? "failed" : "idle"} />
                </div>
                {s.changedSinceApproval && <span className="lp-body">changed since last approval</span>}
                <p className="mt-1 mb-0 line-clamp-2 lp-body">{s.description}</p>
                {reviewing && (
                  <div className="lp-row-full">
                    <LinearDitherBar
                      progress={Math.min(0.92, elapsed / REVIEW_SECONDS)}
                      etaSeconds={Math.max(0, Math.round(REVIEW_SECONDS - elapsed))}
                      stepLabel="Reviewing"
                      ariaLabel={`Reviewing ${s.slug}`}
                    />
                  </div>
                )}
              </div>

              <div className="lp-row-side">
                {s.report && (
                  <Button variant="ghost" size="sm" onClick={() => setOpen(isOpen ? null : s.slug)} className="lp-btn lp-btn-sm lp-btn-quiet">
                    <SutaeruIcon name="report" className="mr-1.5 h-4 w-4" />
                    {isOpen ? "Hide report" : "Report"}
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled={busy} onClick={() => review.mutate({ slug: s.slug })} className="lp-btn lp-btn-sm lp-btn-quiet">
                  {reviewing ? "Reviewing..." : s.status === "unreviewed" ? "Review" : "Review again"}
                </Button>
                <Toggle
                  checked={on}
                  disabled={busy || (!on && (s.status === "unreviewed" || s.status === "rejected"))}
                  label={`Turn ${s.slug} on or off`}
                  onCheckedChange={(next) => toggle.mutate({ slug: s.slug, enabled: next })}
                />
              </div>

              {isOpen && s.report && (
                <div className="lp-row-full lp-report">
                  <p className="m-0 lp-body">{s.report.summary}</p>
                  <dl className="grid gap-2 lp-body sm:grid-cols-2">
                    <div><dt className="lp-mono">Verdict</dt><dd className="m-0">{s.verdict}</dd></div>
                    <div><dt className="lp-mono">Files</dt><dd className="m-0">{s.files.length}{s.report.hasScripts ? " (includes scripts, sandbox only)" : ""}</dd></div>
                    <div className="sm:col-span-2"><dt className="lp-mono">Tools it asks for</dt><dd className="m-0">{s.report.requestedTools.join(", ") || "none"}</dd></div>
                    {s.report.ruleOverrideAttempts.length > 0 && (
                      <div className="sm:col-span-2"><dt className="lp-mono">Rule override attempts</dt><dd className="m-0">{s.report.ruleOverrideAttempts.join("; ")}</dd></div>
                    )}
                  </dl>
                  {s.report.notes.length > 0 && (
                    <ul className="m-0 list-disc space-y-1 pl-5 lp-body">
                      {s.report.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
