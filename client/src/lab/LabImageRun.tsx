import * as React from "react";
import { Link, useSearch } from "wouter";

import { ImageRunScreen, type ImageRunProps, type RunPicture } from "@/components/studio/ImageRunScreen";
import { DEFAULT_SHOT, type Shot } from "@/lib/studio";
import { FALLBACK_ENGINES, PREP_MS, runStatus } from "@/lib/studioRun";
import { LabLayout, useLabSettings } from "./LabLayout";

const shot: Shot = { ...DEFAULT_SHOT, light: "golden" };
const PROMPT = "A ceramic mug on a wooden table in soft morning light.";
const results = ["light-golden", "var-golden-2", "var-golden-3", "var-golden-4"];
const pic = (name: string, i: number): RunPicture => ({ id: name, src: `/studio/l/${name}.webp`, shot, alt: `Picture ${i + 1}` });
const EXPECTED = 10000;

const base: ImageRunProps = {
  status: "running", engine: "gemini", quality: "standard", count: 1, prompt: PROMPT, shot,
  progress: 0, phase: 1, etaSeconds: null, creditsText: "2 credits",
  pictures: [{ id: "preview", shot, alt: PROMPT }], pick: 0, onPick: () => {},
  engines: FALLBACK_ENGINES, onCancel: () => {}, onRetry: () => {}, onBackToStudio: () => {}, onEngine: () => {}, onVariations: () => {}, onEdit: () => {},
};

/** A frozen moment of a run that usually takes EXPECTED ms, `at` ms in. */
function moment(at: number, engine: ImageRunProps["engine"] = "gemini"): Partial<ImageRunProps> {
  const s = runStatus({ elapsedMs: at, expectedMs: EXPECTED, engine });
  return { engine, progress: s.progress, etaSeconds: s.etaSeconds, word: s.word, timeText: s.timeText, slow: s.slow };
}

const done: Partial<ImageRunProps> = {
  status: "done", progress: 1, phase: 2, took: 12, etaSeconds: null, pictures: [pic(results[0], 0)],
  downloadHref: "/studio/l/light-golden.webp", downloadName: "ceramic-mug.png",
};

const STATES: Record<string, { label: string; props: Partial<ImageRunProps> }> = {
  start: { label: "Start", props: moment(0) },
  early: { label: "Early", props: moment(PREP_MS + 1800) },
  mid: { label: "Mid", props: moment(PREP_MS + 5000) },
  late: { label: "Late", props: moment(PREP_MS + 9200) },
  slow: { label: "Slow (GPU cold start)", props: moment(PREP_MS + 140000, "forge") },
  done: { label: "Done", props: done },
  variants: { label: "Done, 4 variants", props: { ...done, count: 4, took: 29, pictures: results.map(pic) } },
  error: { label: "Error", props: { status: "stopped", progress: 0.46, stopReason: "The engine timed out before the picture was finished. Your prompt is still saved." } },
  cancelled: { label: "Cancelled", props: { status: "stopped", progress: 0.46, stopReason: null } },
  story: { label: "Story shape", props: { ...moment(PREP_MS + 5000), shot: { ...shot, ratio: "9:16", look: "film" } } },
  play: { label: "Play 12 s run", props: {} },
};

/** A simulated 12 s run: the real progress logic, then the picture lands at 12 s. */
function usePlay(active: boolean): Partial<ImageRunProps> {
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const t0 = performance.now();
    const id = window.setInterval(() => setT(performance.now() - t0), 100);
    return () => window.clearInterval(id);
  }, [active]);
  if (!active) return {};
  if (t >= 12000) return { ...done, took: 12 };
  return moment(t);
}

export default function LabImageRun() {
  const params = new URLSearchParams(useSearch());
  const asked = params.get("state") ?? params.get("s");
  const key = asked && STATES[asked] ? asked : "mid";
  const theme = params.get("theme");
  const [pick, setPick] = React.useState(0);
  React.useEffect(() => setPick(0), [key]);
  useLabSettings();
  const play = usePlay(key === "play");
  const state = key === "play" ? play : STATES[key].props;
  if (params.get("bare") === "1") {
    return (
      <main style={{ padding: "16px 20px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <ImageRunScreen {...base} {...state} shot={state.shot ?? shot} pick={pick} onPick={setPick} />
      </main>
    );
  }
  return (
    <LabLayout title="Image run">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {Object.entries(STATES).map(([id, s]) => (
          <Link key={id} href={`/__lab/image-run?state=${id}${theme ? `&theme=${theme}` : ""}`} className="pill" aria-pressed={id === key}>
            {s.label}
          </Link>
        ))}
      </div>
      <div style={{ margin: "0 -24px" }}>
        <ImageRunScreen {...base} {...state} shot={state.shot ?? shot} pick={pick} onPick={setPick} />
      </div>
    </LabLayout>
  );
}
