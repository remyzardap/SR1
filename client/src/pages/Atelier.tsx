import { useCallback, useState } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import AtelierGuided from "./AtelierGuided";
import QuickCreate from "./QuickCreate";

type Mode = "describe" | "interview";

function readMode(): Mode {
  if (typeof window === "undefined") return "describe";
  return new URLSearchParams(window.location.search).get("mode") === "interview" ? "interview" : "describe";
}

/**
 * Atelier: one place to make finished files.
 * "Describe it" is the quick one-shot flow (format, style, generate); "Interview me" is the
 * guided report studio. Both used to be separate pages (Generate and Atelier).
 */
export default function Atelier() {
  useSeoMeta({ title: "Atelier", path: "/atelier" });
  const [mode, setModeState] = useState<Mode>(readMode);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  return (
    <div className="sk-page sk-atelier">
      <div className="sk-header">
        <div>
          <h1 className="sk-h1">Atelier</h1>
          <p className="sk-sub">Describe the outcome, or let Sutaeru interview you. Either way you get a finished file.</p>
        </div>
        <div className="sk-seg sk-seg-light" role="tablist" aria-label="How do you want to start?">
          <button type="button" role="tab" aria-selected={mode === "describe"} className={`sk-seg-btn${mode === "describe" ? " is-active" : ""}`} onClick={() => setMode("describe")}>Describe it</button>
          <button type="button" role="tab" aria-selected={mode === "interview"} className={`sk-seg-btn${mode === "interview" ? " is-active" : ""}`} onClick={() => setMode("interview")}>Interview me</button>
        </div>
      </div>
      {mode === "describe" ? <QuickCreate embedded /> : <AtelierGuided embedded />}
    </div>
  );
}
