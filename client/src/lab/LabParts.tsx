import * as React from "react";
import { useState } from "react";

import {
  FoldAllButton,
  FoldGroup,
  FoldSection,
  GoBar,
  LiveTag,
  PickTiles,
  PromptField,
  Showcase,
  TwoUp,
  useFoldState,
  type PickItem,
  type ShowcaseItem,
} from "@/components/fold";
import { LabLayout } from "./LabLayout";

/* Every shared Studio-standard part in every state. Pictures come from /studio/o/ (shipped by the
   images package); a missing file falls back to a quiet panel, which is itself a state worth seeing. */

const O = (n: string) => `/studio/o/${n}.webp`;

const MODES: ShowcaseItem[] = [
  { id: "fast", name: "Fast", art: O("fast"), badge: "Quick answers" },
  { id: "research", name: "Deep research", art: O("research") },
  { id: "image", name: "Image", art: O("image") },
  { id: "document", name: "Document", art: O("document") },
  { id: "code", name: "Code", art: O("code") },
];

const DOC_KIND: ShowcaseItem[] = [
  { id: "rewrite", name: "Rewrite", art: O("rewrite") },
  { id: "reformat", name: "Keep content, fix layout", art: O("reformat") },
];

const MODELS: PickItem[] = [
  { id: "auto", label: "Auto", sub: "Picks for you", art: O("model-auto") },
  { id: "fast", label: "Fast", sub: "Quickest", art: O("model-fast") },
  { id: "best", label: "Best", sub: "Sharpest", art: O("model-best") },
];

const SOURCES: PickItem[] = [
  { id: "web", label: "Web", art: O("src-web") },
  { id: "files", label: "My files", art: O("src-files") },
  { id: "drive", label: "Drive", art: O("src-drive") },
];

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 className="mono ink" style={{ margin: "0 0 12px" }}>{title}</h2>
      {children}
    </section>
  );
}

function Folds() {
  const ids = ["model", "sources", "mode", "depth"];
  const state = useFoldState("lab-parts", ids);
  const [model, setModel] = useState("auto");
  const [src, setSrc] = useState("web");
  const [mode, setMode] = useState("research");
  const m = MODELS.find((x) => x.id === model)!;
  const s = SOURCES.find((x) => x.id === src)!;
  return (
    <>
      <div className="head-row" style={{ marginBottom: 4 }}>
        <b className="mono ink">Sections ({state.layout})</b>
        <FoldAllButton state={state} />
      </div>
      <FoldGroup state={state}>
        <FoldSection id="model" index={1} label="Model" pick={m.label} mini={m.art}>
          <PickTiles label="Model" items={MODELS} value={model} onChange={setModel} />
        </FoldSection>
        <FoldSection id="sources" index={2} label="Sources" pick={s.label} mini={s.art}>
          <PickTiles label="Sources" items={SOURCES} value={src} onChange={setSrc} />
        </FoldSection>
        <FoldSection id="mode" index={3} label="Mode" pick={MODES.find((x) => x.id === mode)!.name} mini={MODES.find((x) => x.id === mode)!.art}>
          <Showcase label="Mode" items={MODES} value={mode} onChange={setMode} />
        </FoldSection>
        <FoldSection id="depth" index={4} label="A very long section label example" pick="A very long pick that must stay on one line and end in an ellipsis, always">
          <p className="why">No mini picture here: the pick stands alone.</p>
        </FoldSection>
      </FoldGroup>
    </>
  );
}

export default function LabParts() {
  const [model, setModel] = useState("fast");
  const [mode, setMode] = useState("image");
  const [kind, setKind] = useState("reformat");
  const [prompt, setPrompt] = useState("");
  const [long, setLong] = useState("A glass of water on a wooden table in the early morning, soft window light falling across the grain, a single sprig of rosemary beside it and a folded linen cloth behind, shot close with a shallow focus. ".repeat(2));
  return (
    <LabLayout title="Shared parts">
      <div style={{ maxWidth: 560, margin: "0 auto", "--gutter": "0px" } as React.CSSProperties}>
        <Row title="Fold section: folded, open, controlled, long text">
          <FoldSection id="a" index={1} label="Shot" pick="Close up · Fills the frame" mini={O("model-best")}>
            <p className="why">Open on its own (uncontrolled, starts folded).</p>
          </FoldSection>
          <FoldSection id="b" index={2} label="Angle" pick="Eye level" defaultOpen>
            <p className="why">Starts open, no mini picture.</p>
          </FoldSection>
          <FoldSection id="c" index={3} label="Light" pick="Golden hour with a very long description that has to run out of room" mini={O("model-fast")} open={false}>
            <p className="why">Controlled and held folded.</p>
          </FoldSection>
        </Row>

        <Row title="Fold group with Fold all / Open all (resize to 390 / 900 / 1280 to see the rules)">
          <Folds />
        </Row>

        <Row title="Pick tiles (selected = ink outline + tick + brackets)">
          <PickTiles label="Model" items={MODELS} value={model} onChange={setModel} />
        </Row>

        <Row title="Showcase: one big card, peek of the next, pager">
          <Showcase label="Mode" items={MODES} value={mode} onChange={setMode} />
        </Row>
        <Row title="Showcase, small cards">
          <Showcase label="Mode small" size="sm" items={MODES} value={mode} onChange={setMode} />
        </Row>
        <Row title="Two-up (exactly two options)">
          <TwoUp label="Kind" items={DOC_KIND} value={kind} onChange={setKind} />
        </Row>
        <Row title="Showcase with a missing picture (fallback)">
          <Showcase
            label="Missing"
            items={[{ id: "x", name: "No picture yet", art: "/studio/o/does-not-exist.webp" }, { id: "y", name: "Also none", art: "/studio/o/nope.webp" }, { id: "z", name: "Third", art: "/studio/o/nope2.webp" }]}
            value="x"
            onChange={() => {}}
          />
        </Row>

        <Row title="Prompt field: empty, grown, with reference photo">
          <div style={{ display: "grid", gap: 14 }}>
            <PromptField value={prompt} onChange={setPrompt} placeholder="Describe your picture" onAddRefs={() => {}} maxRefs={2} />
            <PromptField value={long} onChange={setLong} placeholder="Describe your picture" onAddRefs={() => {}} maxRefs={2} refs={[{ name: "ref.webp", src: "/studio/t/ref.webp" }]} onRemoveRef={() => {}} />
          </div>
        </Row>

        <Row title="Live tag (on a picture)">
          <div style={{ position: "relative", height: 120, borderRadius: 20, overflow: "hidden", background: `center/cover url(${O("model-best")}), var(--panel)` }}>
            <div style={{ position: "absolute", left: 14, top: 14 }}>
              <LiveTag />
            </div>
          </div>
        </Row>

        <Row title="Go bar (sticky at the bottom of this column)">
          <GoBar summary="Draw 2 pictures" detail="Fast · About 12 s" actionLabel="Begin" onAction={() => {}} />
          <GoBar summary="Nothing to draw yet" detail="Describe your picture" actionLabel="Begin" onAction={() => {}} disabled />
        </Row>
        <div style={{ height: 80 }} />
      </div>
    </LabLayout>
  );
}
