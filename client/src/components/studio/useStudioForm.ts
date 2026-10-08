import { useCallback, useMemo, useRef, useState } from "react";

import { DEFAULT_SHOT, type Shot, type StudioGroup } from "@/lib/studio";
import { labelFromPrompt, suggestEngine, type EngineId, type Quality } from "@/lib/studioRun";

export const DEFAULT_PROMPT = "A ceramic mug on a wooden table in soft morning light.";

export interface StudioInit {
  shot?: Partial<Shot>;
  prompt?: string;
  quality?: Quality;
  count?: number;
  engine?: EngineId | null;
  vf?: "photo" | "sketch";
  directionOn?: boolean;
}

/** Everything the person sets in the studio. The screen is controlled by this, in the app and in the lab. */
export function useStudioForm(available: EngineId[], init: StudioInit = {}) {
  const [shot, setShot] = useState<Shot>({ ...DEFAULT_SHOT, ...init.shot });
  const [prompt, setPrompt] = useState(init.prompt ?? DEFAULT_PROMPT);
  const [engineChoice, setEngineChoice] = useState<EngineId | null>(init.engine ?? null);
  const [quality, setQuality] = useState<Quality>(init.quality ?? "standard");
  const [count, setCount] = useState(init.count ?? 1);
  const [vf, setVf] = useState<"photo" | "sketch">(init.vf ?? "photo");
  const [grid, setGrid] = useState(true);
  /* Camera choices reach the engine as words. Off until the person picks a tile or turns it on. */
  const [directionOn, setDirectionOn] = useState(init.directionOn ?? false);
  const touched = useRef(false);

  const label = useMemo(() => labelFromPrompt(prompt), [prompt]);
  const suggestion = useMemo(() => suggestEngine(shot, label, available), [shot, label, available]);
  const engine: EngineId = engineChoice && available.includes(engineChoice) ? engineChoice : suggestion.id;

  const pick = useCallback(<G extends StudioGroup>(group: G, value: Shot[G]) => {
    setShot((cur) => ({ ...cur, [group]: value }));
    if (group !== "ratio" && !touched.current) setDirectionOn(true);
  }, []);
  const changeDirection = useCallback((next: boolean) => {
    touched.current = true;
    setDirectionOn(next);
  }, []);

  return {
    shot, pick, prompt, setPrompt, label,
    engine, suggested: suggestion.id, why: suggestion.why, setEngine: setEngineChoice,
    quality, setQuality, count, setCount,
    vf, setVf, grid, setGrid,
    directionOn, changeDirection,
  };
}

export type StudioForm = ReturnType<typeof useStudioForm>;
