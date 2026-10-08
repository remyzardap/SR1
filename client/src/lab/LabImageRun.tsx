import * as React from "react";
import { Link, useSearch } from "wouter";

import { ImageRunScreen, type ImageRunProps, type RunPicture } from "@/components/studio/ImageRunScreen";
import { DEFAULT_SHOT, type Shot } from "@/lib/studio";
import { FALLBACK_ENGINES, phaseOf } from "@/lib/studioRun";
import { LabLayout } from "./LabLayout";

const shot: Shot = { ...DEFAULT_SHOT, light: "golden" };
const PROMPT = "A ceramic mug on a wooden table in soft morning light.";
const results = ["light-golden", "var-golden-2", "var-golden-3", "var-golden-4"];
const pic = (name: string, i: number): RunPicture => ({ id: name, src: `/studio/l/${name}.webp`, shot, alt: `Picture ${i + 1}` });

const base: ImageRunProps = {
  status: "running", engine: "qwen", quality: "standard", count: 1, prompt: PROMPT, shot,
  progress: 0.62, phase: 1, etaSeconds: 7, creditsText: "2 credits",
  pictures: [{ id: "preview", shot, alt: PROMPT }], pick: 0, onPick: () => {},
  engines: FALLBACK_ENGINES, onCancel: () => {}, onRetry: () => {}, onBackToStudio: () => {}, onEngine: () => {}, onVariations: () => {}, onEdit: () => {},
};

const STATES: Record<string, { label: string; props: Partial<ImageRunProps> }> = {
  queued: { label: "Estimating", props: { progress: 0, phase: 0, etaSeconds: null } },
  running: { label: "Running 62%", props: {} },
  saving: { label: "Saving", props: { progress: 0.95, phase: phaseOf(0.95, true), etaSeconds: 1 } },
  story: { label: "Story shape", props: { shot: { ...shot, ratio: "9:16", look: "film" }, progress: 0.4 } },
  stopped: { label: "Stopped", props: { status: "stopped", progress: 0.38, phase: 1, stopReason: null } },
  error: { label: "Error", props: { status: "stopped", progress: 0.38, phase: 1, stopReason: "The engine timed out before the picture was finished. Your prompt is still saved." } },
  done: { label: "Done", props: { status: "done", progress: 1, phase: 2, took: 17, etaSeconds: null, pictures: [pic(results[0], 0)], downloadHref: "/studio/l/light-golden.webp", downloadName: "ceramic-mug.png" } },
  variants: { label: "Done, 4 variants", props: { status: "done", progress: 1, phase: 2, took: 29, count: 4, etaSeconds: null, pictures: results.map(pic), downloadHref: "/studio/l/light-golden.webp", downloadName: "ceramic-mug-1.png" } },
};

export default function LabImageRun() {
  const params = new URLSearchParams(useSearch());
  const asked = params.get("s");
  const key = asked && STATES[asked] ? asked : "running";
  const theme = params.get("theme");
  const [pick, setPick] = React.useState(0);
  React.useEffect(() => setPick(0), [key]);
  const state = STATES[key].props;
  return (
    <LabLayout title="Image run">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {Object.entries(STATES).map(([id, s]) => (
          <Link key={id} href={`/__lab/image-run?s=${id}${theme ? `&theme=${theme}` : ""}`} className="pill" aria-pressed={id === key}>
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
