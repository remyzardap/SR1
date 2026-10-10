import * as React from "react";
import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";

import Documents from "@/pages/Documents";
import EditDocument from "@/pages/EditDocument";
import NewDocument from "@/pages/NewDocument";
import Video from "@/pages/Video";
import { LabLayout } from "./LabLayout";

const SCREENS = [
  { id: "documents", label: "Documents landing" },
  { id: "new", label: "New document" },
  { id: "improve", label: "Improve document" },
  { id: "video", label: "Video" },
] as const;

/** Engines the Video page lists, answered locally so the lab needs no server. */
const ENGINES = [
  { id: "gemini", label: "Fast", model: "", qualityModel: "", available: true, defaultEngine: true, supportsReference: true, minDurationSec: 4, maxDurationSec: 8, aspectRatios: ["16:9", "9:16", "1:1"], estimateMinSeconds: 40, estimateMaxSeconds: 90 },
  { id: "openai", label: "Cinematic", model: "", qualityModel: "", available: true, defaultEngine: false, supportsReference: false, minDurationSec: 5, maxDurationSec: 5, aspectRatios: ["16:9", "9:16"], estimateMinSeconds: 60, estimateMaxSeconds: 120 },
  { id: "forge", label: "Open GPU", model: "", qualityModel: "", available: true, defaultEngine: false, supportsReference: false, minDurationSec: 5, maxDurationSec: 5, aspectRatios: ["16:9"], estimateMinSeconds: 180, estimateMaxSeconds: 420 },
];

function useEngineStub() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const original = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/engines")) {
        return Promise.resolve(new Response(JSON.stringify({ engines: ENGINES }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return original(input, init);
    };
    setReady(true);
    return () => {
      window.fetch = original;
    };
  }, []);
  return ready;
}

/** The create flows: documents, new, improve and video. ?screen=documents|new|improve|video */
export default function LabCreate() {
  const params = new URLSearchParams(useSearch());
  const screen = params.get("screen") ?? "documents";
  const theme = params.get("theme");
  const ready = useEngineStub();

  const href = (id: string) => `/__lab/create?screen=${id}${theme ? `&theme=${theme}` : ""}`;

  return (
    <LabLayout title="Create flows" bleed>
      <nav aria-label="Screen" style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 24px 16px" }}>
        {SCREENS.map((s) => (
          <Link key={s.id} href={href(s.id)} className="pill" style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, textDecoration: "none", background: screen === s.id ? "var(--ink)" : "var(--card)", color: screen === s.id ? "var(--paper)" : "var(--ink)", border: "1px solid var(--stroke)" }}>
            {s.label}
          </Link>
        ))}
      </nav>
      {screen === "documents" && <Documents />}
      {screen === "new" && <div className="sk-page sk-documents"><NewDocument /></div>}
      {screen === "improve" && <div className="sk-page sk-documents"><EditDocument embedded /></div>}
      {screen === "video" && ready && <Video />}
    </LabLayout>
  );
}
