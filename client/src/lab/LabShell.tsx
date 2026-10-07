import * as React from "react";
import { useState } from "react";
import { LabLayout } from "./LabLayout";
import { AppHeader } from "@/components/chrome/AppHeader";

export default function LabShell() {
  const [mode, setMode] = useState<"chat" | "agent">("chat");

  return (
    <LabLayout title="Shell — AppHeader & Navigation">
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <section>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 12, color: "var(--quiet)" }}>
            Chat / Agent Mode Switch ({mode})
          </h2>
          <div style={{ position: "relative", height: 80, border: "1px dashed var(--stroke)", borderRadius: 16, overflow: "hidden" }}>
            <AppHeader
              mode={mode}
              onModeChange={setMode}
              userInitial="R"
              statusText="Kemma · ready"
            />
          </div>
        </section>

        <section>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 12, color: "var(--quiet)" }}>
            Title Mode (Studio)
          </h2>
          <div style={{ position: "relative", height: 80, border: "1px dashed var(--stroke)", borderRadius: 16, overflow: "hidden" }}>
            <AppHeader
              mode="title"
              title="Studio"
              userInitial="R"
            />
          </div>
        </section>

        <section>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 12, color: "var(--quiet)" }}>
            Title Mode (Files)
          </h2>
          <div style={{ position: "relative", height: 80, border: "1px dashed var(--stroke)", borderRadius: 16, overflow: "hidden" }}>
            <AppHeader
              mode="title"
              title="Files"
              userInitial="R"
              statusText="1 running · 45%"
            />
          </div>
        </section>

        <section>
          <h2 style={{ font: "700 16px/1 var(--disp)", marginBottom: 12, color: "var(--quiet)" }}>
            Title Mode (Settings)
          </h2>
          <div style={{ position: "relative", height: 80, border: "1px dashed var(--stroke)", borderRadius: 16, overflow: "hidden" }}>
            <AppHeader
              mode="title"
              title="Settings"
              userInitial="R"
            />
          </div>
        </section>
      </div>
    </LabLayout>
  );
}
