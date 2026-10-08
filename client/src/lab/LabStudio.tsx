import * as React from "react";
import { Link, useSearch } from "wouter";

import { StudioScreen } from "@/components/studio/StudioScreen";
import { useStudioForm, type StudioInit } from "@/components/studio/useStudioForm";
import { FALLBACK_ENGINES } from "@/lib/studioRun";
import { LabLayout } from "./LabLayout";

/* Lab states for the studio: every tile group is on screen in each one. */
const STATES: Record<string, { label: string; init: StudioInit }> = {
  default: { label: "Default", init: {} },
  golden: { label: "Golden detail", init: { shot: { shot: "detail", light: "golden", lens: "100" }, directionOn: true } },
  painted: { label: "Painted reference", init: { shot: { look: "painted" } } },
  clay: { label: "Clay reference", init: { shot: { look: "clay", ratio: "4:3" } } },
  film: { label: "Film, night, story", init: { shot: { look: "film", light: "night", ratio: "9:16", angle: "low" }, quality: "high", count: 4 } },
  ink: { label: "Ink and dots", init: { shot: { look: "ink", angle: "top" } } },
  quoted: { label: "Quoted words", init: { prompt: 'A ceramic mug that says "SUTAERU" on a wooden table.' } },
  sketch: { label: "Sketch view", init: { vf: "sketch", shot: { angle: "high", shot: "close" }, prompt: 'A mug that says "HELLO"' } },
};

const AVAILABLE = FALLBACK_ENGINES.map((e) => e.id);

function Studio({ init }: { init: StudioInit }) {
  const f = useStudioForm(AVAILABLE, init);
  const [refs, setRefs] = React.useState<{ name: string; src: string }[]>([]);
  return (
    <StudioScreen
      shot={f.shot}
      onPick={f.pick}
      prompt={f.prompt}
      onPrompt={f.setPrompt}
      maxPrompt={2000}
      label={f.label}
      vf={f.vf}
      onVf={f.setVf}
      grid={f.grid}
      onGrid={f.setGrid}
      directionOn={f.directionOn}
      onDirection={f.changeDirection}
      engines={FALLBACK_ENGINES}
      engine={f.engine}
      suggested={f.suggested}
      why={f.why}
      onEngine={f.setEngine}
      quality={f.quality}
      onQuality={f.setQuality}
      count={f.count}
      onCount={f.setCount}
      refs={refs}
      maxRefs={2}
      onAddRefs={() => setRefs((r) => (r.length < 2 ? [...r, { name: "ref.webp", src: "/studio/t/ref.webp" }] : r))}
      onRemoveRef={(i) => setRefs((r) => r.filter((_, idx) => idx !== i))}
      onBegin={() => {}}
      canBegin={f.prompt.trim().length > 0}
      backLabel="Agent"
    />
  );
}

export default function LabStudio() {
  const params = new URLSearchParams(useSearch());
  const asked = params.get("s");
  const key = asked && STATES[asked] ? asked : "default";
  const theme = params.get("theme");
  const q = (s: string) => `?s=${s}${theme ? `&theme=${theme}` : ""}`;
  return (
    <LabLayout title="Image studio">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {Object.entries(STATES).map(([id, s]) => (
          <Link key={id} href={`/__lab/studio${q(id)}`} className="pill" aria-pressed={id === key}>
            {s.label}
          </Link>
        ))}
      </div>
      <div style={{ margin: "0 -24px" }}>
        <Studio key={key} init={STATES[key].init} />
      </div>
    </LabLayout>
  );
}
