import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { LabLayout } from "./LabLayout";
import { DotRamp } from "@/components/art/DotRamp";
import { LivingBackground } from "@/components/art/LivingBackground";
import { ChatBarMark } from "@/components/chat/ChatBarMark";
import { Toggle } from "@/components/art";
import { createChatEnergyStore } from "@/lib/motion/chatEnergy";
import { CHAT_PHASES, type ChatPhase } from "@/lib/motion/ramp";
import { DURATION, EASING, cssEasing, type EasingName } from "@/lib/motion/tokens";
import type { LivingVariant } from "@/lib/motion/field";
import { sharedAxis } from "@/lib/motion/transitions";
import { AnimatePresence, motion } from "framer-motion";

const VARIANTS_LIST: LivingVariant[] = ["home", "chat", "studio", "quiet"];
const EASINGS: EasingName[] = ["emphasized", "emphasizedDecelerate", "emphasizedAccelerate", "standard"];

/** /__lab/motion: the chat ramp in every phase, the living background and the M3 motion tokens. */
export default function LabMotion() {
  const [intensity, setIntensity] = useState(70);
  const [reduced, setReduced] = useState(false);
  const [variant, setVariant] = useState<LivingVariant>("home");
  const [bg, setBg] = useState(true);
  const [dark, setDark] = useState(false);
  const [phase, setPhase] = useState<ChatPhase | "live">("live");
  const [axisKey, setAxisKey] = useState(0);
  const [play, setPlay] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", dark ? "dark" : "light");
    root.setAttribute("data-mode", dark ? "dark" : "light");
  }, [dark]);

  // A private store plays a scripted chat so the ramp can be seen without a backend.
  const store = useRef(createChatEnergyStore()).current;
  useEffect(() => {
    if (phase !== "live") return;
    let alive = true;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => alive && fn(), ms));
    const run = () => {
      store.setPhase("thinking");
      at(1800, () => {
        const id = window.setInterval(() => alive && store.tokens(1 + Math.random() * 1.5), 60);
        timers.push(id);
        at(3600, () => {
          clearInterval(id);
          store.setPhase("done");
        });
      });
      at(7200, run);
    };
    run();
    return () => {
      alive = false;
      timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    };
  }, [phase, store]);

  const row: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };
  const reducedProp = reduced ? true : undefined;

  return (
    <LabLayout title="Motion and living art">
      <LivingBackground variant={variant} enabled={bg} intensity={intensity} reducedMotion={reduced} lowEnd={false} />
      <div style={{ display: "grid", gap: 28 }}>
        <section className="card" style={{ padding: 18, borderRadius: 16, display: "grid", gap: 12 }}>
          <div style={row}>
            <label style={row}><Toggle checked={dark} onCheckedChange={setDark} label="Dark" /> Dark</label>
            <label style={row}><Toggle checked={reduced} onCheckedChange={setReduced} label="Reduce motion" /> Reduce motion</label>
            <label style={row}><Toggle checked={bg} onCheckedChange={setBg} label="Background art" /> Background art</label>
            <label style={row}>
              Art intensity {intensity}%
              <input type="range" min={20} max={100} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
            </label>
          </div>
          <div style={row}>
            {VARIANTS_LIST.map((v) => (
              <button key={v} type="button" className="art-chip art-chip-sm" aria-pressed={variant === v} onClick={() => setVariant(v)}>
                {v}
              </button>
            ))}
          </div>
        </section>

        <section className="card" style={{ padding: 18, borderRadius: 16, display: "grid", gap: 14 }}>
          <b>Chat bar mark</b>
          <div style={row}>
            {(["live", ...CHAT_PHASES] as const).map((p) => (
              <button key={p} type="button" className="art-chip art-chip-sm" aria-pressed={phase === p} onClick={() => setPhase(p)}>
                {p}
              </button>
            ))}
          </div>
          <ChatBarMark store={store} phase={phase === "live" ? undefined : phase} reducedMotion={reducedProp} />
          <div style={{ display: "grid", gap: 8 }}>
            {CHAT_PHASES.map((p) => (
              <div key={p} style={row}>
                <span className="mono" style={{ width: 90, fontSize: 11 }}>{p}</span>
                <DotRamp phase={p} energy={p === "streaming" ? 0.7 : undefined} level={p === "listening" ? 0.6 : undefined} reducedMotion={reducedProp} style={{ width: 240, height: 40 }} />
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ padding: 18, borderRadius: 16, display: "grid", gap: 12 }}>
          <b>Easing and duration tokens</b>
          <button type="button" className="art-chip art-chip-sm" onClick={() => setPlay((n) => n + 1)}>Play</button>
          {EASINGS.map((name) => (
            <div key={name} style={{ display: "grid", gap: 4 }}>
              <span className="mono" style={{ fontSize: 11 }}>{name} [{EASING[name].join(", ")}]</span>
              <div style={{ height: 14, borderRadius: 7, background: "color-mix(in srgb, currentColor 8%, transparent)", position: "relative" }}>
                <i
                  key={`${name}-${play}`}
                  style={{
                    position: "absolute", left: 0, top: 1, width: 12, height: 12, borderRadius: 6, background: "currentColor",
                    animation: reduced ? "none" : `lab-slide ${DURATION.long2}ms ${cssEasing(name)} both`,
                  }}
                />
              </div>
            </div>
          ))}
          <style>{"@keyframes lab-slide { from { transform: translateX(0) } to { transform: translateX(min(280px, 70vw)) } }"}</style>
        </section>

        <section className="card" style={{ padding: 18, borderRadius: 16, display: "grid", gap: 12, overflow: "hidden" }}>
          <b>Shared axis (x)</b>
          <button type="button" className="art-chip art-chip-sm" onClick={() => setAxisKey((n) => n + 1)}>Next page</button>
          <AnimatePresence mode="wait">
            <motion.div key={axisKey} variants={sharedAxis({ reduced })} initial="enter" animate="center" exit="exit" style={{ padding: 20, borderRadius: 12, background: "color-mix(in srgb, currentColor 6%, transparent)" }}>
              Page {axisKey + 1}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </LabLayout>
  );
}
