import * as React from "react";
import { HomeComposer, type HomeComposerProps } from "@/components/home/HomeComposer";
import { LabLayout } from "./LabLayout";
import { LAB_HOME_SOURCES, homeLabComposer, type HomeLabState } from "./fixtures/home";

const noop = () => {};

/** The composer states side by side, each in its own frame, for a quick visual pass. */
const STATES: HomeLabState[] = ["default", "typing", "deep", "image", "files", "private", "recording", "offline"];

function props(state: HomeLabState): HomeComposerProps {
  return {
    ...homeLabComposer(state),
    initialPanel: null,
    onChange: noop,
    onSubmit: noop,
    onListen: noop,
    onStopListen: noop,
    onModeChange: noop,
    onOpenSettings: noop,
    onThinkingChange: noop,
    onPrivateChange: noop,
    onToggleTool: noop,
    sourceRows: LAB_HOME_SOURCES,
    onAddAttachment: noop,
    onRemoveAttachment: noop,
  };
}

export default function LabComposer() {
  return (
    <LabLayout title="Composer · states">
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        {STATES.map((state) => (
          <section key={state} className={state === "private" ? "private-on" : undefined}>
            <p className="mono" style={{ marginBottom: 12 }}>{state}</p>
            <HomeComposer {...props(state)} />
          </section>
        ))}
      </div>
    </LabLayout>
  );
}
