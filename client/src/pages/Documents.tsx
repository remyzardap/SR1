import { useState } from "react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import NewDocument from "./NewDocument";
import EditDocument from "./EditDocument";
import { PageTitle } from "@/components/chrome/PageTitle";
import { TwoUp } from "@/components/fold";
import { pickArt } from "@/lib/pickArt";
import "@/styles/documents-start.css";

type Start = "new" | "edit" | null;
type Mode = "describe" | "interview";

function readParams(): { start: Start; mode: Mode } {
  if (typeof window === "undefined") return { start: null, mode: "describe" };
  const p = new URLSearchParams(window.location.search);
  const mode: Mode = p.get("mode") === "interview" ? "interview" : "describe";
  const s = p.get("start");
  // Older links only carried ?mode=, which always meant making a new document.
  const start: Start = s === "new" || s === "edit" ? s : p.get("mode") ? "new" : null;
  return { start, mode };
}

/**
 * Documents: one place to make and change finished files. The first screen asks the one question that
 * matters, new or existing, with the two options shown as picture cards.
 * (This page was called Atelier; the /atelier address still works and lands here.)
 */
export default function Documents() {
  useSeoMeta({ title: "Documents", path: "/documents" });
  const initial = readParams();
  const [start, setStart] = useState<Start>(initial.start);

  const sync = (next: Start) => {
    const url = new URL(window.location.href);
    url.search = "";
    if (next) url.searchParams.set("start", next);
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  const setStartBoth = (next: Start) => { setStart(next); sync(next); };

  if (!start) {
    return (
      <div className="sk-page sk-documents">
        <div className="sk-header">
          <div>
            <PageTitle className="skx-title-flush">Documents</PageTitle>
          </div>
        </div>
        <TwoUp
          label="Start a document"
          value=""
          onChange={(id) => setStartBoth(id as Start)}
          items={[
            { id: "new", name: "New document", art: pickArt("doc-proposal"), description: "Start from an idea" },
            { id: "edit", name: "Improve a file", art: pickArt("rewrite"), description: "Start from a file" },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="sk-page sk-documents">
      <div className="sk-header">
        <div>
          <button type="button" className="sk-doc-back" onClick={() => setStartBoth(null)}>← All documents</button>
          <PageTitle className="skx-title-flush">{start === "new" ? "New document" : "Improve document"}</PageTitle>
        </div>
      </div>
      {start === "new" ? (
        <NewDocument startInInterview={initial.mode === "interview"} />
      ) : (
        <EditDocument embedded onBack={() => setStartBoth(null)} />
      )}
    </div>
  );
}
