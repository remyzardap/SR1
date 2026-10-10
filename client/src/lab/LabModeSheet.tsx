import * as React from "react";
import { useState } from "react";
import { useSearch } from "wouter";

import { AnswerFold } from "@/components/chat/AnswerFold";
import { ModeMenu, SOURCE_ROWS, chatModes } from "@/components/chat/ModeMenu";
import { CHAT_TOOLS } from "@/components/chat/ModeSheet";
import type { ModelChoice } from "@/components/chat/modelChoice";
import { ThinkingBlock } from "@/components/chat/ThinkingBlock";
import { layoutFor, writeFold } from "@/components/fold";
import { LabLayout } from "./LabLayout";

/* The one mode and thread sheet, open as a state (?view=sheet, the default) and the answer's
   one-line fold panels (?view=answer). ?fold=model|sources|tools|skills opens that section;
   ?admin=1 adds Code; ?private=1 shows the Private switch. */

const SKILLS = [{ id: 1, name: "Brand voice" }, { id: 2, name: "Citations" }];

export default function LabModeSheet() {
  const params = new URLSearchParams(useSearch());
  const view = params.get("view") ?? "sheet";
  const fold = params.get("fold");
  const admin = params.get("admin") === "1";
  const withPrivate = params.get("private") === "1";

  if (typeof window !== "undefined") writeFold("lab-mode-sheet", layoutFor(window.innerWidth), [fold ?? "mode"]);

  const [mode, setMode] = useState(params.get("mode") ?? "fast");
  const [model, setModel] = useState<ModelChoice>("auto");
  const [tools, setTools] = useState<string[]>(["web_search"]);
  const [tagged, setTagged] = useState<number[]>([]);
  const [thinking, setThinking] = useState(false);
  const [priv, setPriv] = useState(false);

  return (
    <LabLayout title="Mode and thread sheet">
      {view === "answer" ? (
        <div style={{ maxWidth: 640, display: "grid", gap: 6 }}>
          <p className="mono">Answer panels, folded</p>
          <AnswerFold label="Sources" summary="4 · nature.com, who.int, irena.org">
            <p style={{ margin: 0, padding: "0 16px" }}>Source cards sit here.</p>
          </AnswerFold>
          <ThinkingBlock thinking={"Compared the payback figures across three reports, then checked the assumptions each one makes about energy prices and subsidies."} />
          <AnswerFold label="Turn this into" summary="Report" defaultOpen>
            <p style={{ margin: 0, padding: "0 16px" }}>Report, Deck, Sheet.</p>
          </AnswerFold>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ModeMenu
            initialOpen
            foldKey="lab-mode-sheet"
            mode={mode}
            modes={chatModes(admin)}
            onModeChange={setMode}
            allowedTools={tools}
            onToggleTool={(id) => setTools((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
            sourceRows={SOURCE_ROWS}
            tools={CHAT_TOOLS}
            model={model}
            onModelChange={setModel}
            skills={SKILLS}
            taggedSkills={tagged}
            onToggleSkill={(id) => setTagged((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
            thinking={thinking}
            onThinkingChange={setThinking}
            privateChat={withPrivate ? priv : undefined}
            onPrivateChange={withPrivate ? setPriv : undefined}
          />
        </div>
      )}
    </LabLayout>
  );
}
