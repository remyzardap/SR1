import * as React from "react";
import { Link, useSearch } from "wouter";
import { HomeComposerProps, HomeSourceRow } from "@/components/home/HomeComposer";
import { HomeScreen } from "@/components/home/HomeScreen";
import { cn } from "@/lib/utils";
import { LabLayout } from "./LabLayout";
import {
  HOME_LAB_STATES,
  LAB_HOME_SOURCES,
  homeLabComposer,
  type HomeLabState,
} from "./fixtures/home";

/** The lab looks at the screen; nothing here sends anything anywhere. */
const noop = () => {};

function composerProps(state: HomeLabState, sourceRows: HomeSourceRow[]): HomeComposerProps {
  return {
    ...homeLabComposer(state),
    onChange: noop,
    onSubmit: noop,
    onListen: noop,
    onStopListen: noop,
    onModeChange: noop,
    onOpenSettings: noop,
    onThinkingChange: noop,
    onPrivateChange: noop,
    onToggleTool: noop,
    sourceRows,
    onAddAttachment: noop,
    onRemoveAttachment: noop,
  };
}

export default function LabHome() {
  const params = new URLSearchParams(useSearch());
  const requested = params.get("state") as HomeLabState | null;
  const state: HomeLabState = requested && HOME_LAB_STATES.includes(requested) ? requested : "default";

  return (
    <LabLayout title={`Home · ${state}`}>
      <nav aria-label="Home states" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {HOME_LAB_STATES.map((name) => (
          <Link
            key={name}
            href={`/__lab/home?state=${name}`}
            className={cn("pill", name === state && "on")}
            style={{ textDecoration: "none" }}
          >
            {name}
          </Link>
        ))}
      </nav>
      <HomeScreen composer={composerProps(state, LAB_HOME_SOURCES)} listening={state === "recording"} />
    </LabLayout>
  );
}
