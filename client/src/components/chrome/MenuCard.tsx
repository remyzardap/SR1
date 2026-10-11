import * as React from "react";
import { useEffect, useRef, useState } from "react";

import { Pic } from "@/components/fold";
import { DocMini } from "@/components/art/DocMini";

import type { MenuCardKind } from "./menuModel";

/* The art on one logo-menu card: paper pages, drawn the way the Report, Deck and Sheet
   previews are. Agent, Documents and Files reuse DocMini; Chat, Images and Video draw
   their own pages on a 350 x 232 stage that scales to the card. No icons. */

const STAGE_W = 350;
const STAGE_H = 232;

function Stage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const fit = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (w && h) setK(Math.min(w / STAGE_W, h / STAGE_H));
    };
    fit();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fit);
      return () => window.removeEventListener("resize", fit);
    }
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  return (
    <span ref={ref} className="lm-stage" style={{ transform: `translate(-50%, -50%) scale(${k.toFixed(4)})` }}>
      {children}
    </span>
  );
}

function ChatPages() {
  return (
    <Stage>
      <span className="lm-paper" style={{ left: 196, top: 34, width: 132, height: 210, padding: "16px 14px", transform: "rotate(5deg)" }}>
        <span className="lm-lines">
          <i style={{ width: "88%" }} />
          <i style={{ width: "70%" }} />
          <i style={{ width: "80%" }} />
        </span>
      </span>
      <span className="lm-paper" style={{ left: 62, top: 20, width: 216, height: 250, padding: 16, transform: "rotate(-2.5deg)" }}>
        <span className="lm-k">Today</span>
        <span
          style={{
            display: "block", margin: "9px 0 0 auto", width: 148, boxSizing: "border-box", padding: "8px 10px",
            borderRadius: "12px 12px 3px 12px", background: "#242320", color: "#fff", font: "600 9px/1.25 var(--body)",
          }}
        >
          Plan my week around Friday?
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 14 }}>
          <i style={{ display: "block", width: 6, height: 6, borderRadius: "50%", background: "#F4511E" }} />
          <span className="lm-k" style={{ fontSize: 6.5 }}>Sutaeru</span>
        </span>
        <span style={{ display: "block", marginTop: 7, font: "800 17px/1.04 var(--display, var(--body))", letterSpacing: "-.035em" }}>
          Here is the short answer.
        </span>
        <span className="lm-lines" style={{ marginTop: 11 }}>
          <i style={{ width: "94%" }} />
          <i style={{ width: "86%" }} />
          <i style={{ width: "58%" }} />
        </span>
        <span
          style={{
            position: "absolute", left: 14, right: 14, top: 172, height: 30, boxSizing: "border-box", display: "flex",
            alignItems: "center", justifyContent: "space-between", padding: "0 4px 0 12px", borderRadius: 15,
            background: "#F3F1EC", font: "500 8px/1 var(--body)", color: "#7A776F",
          }}
        >
          Message
          <i style={{ display: "block", width: 22, height: 22, borderRadius: "50%", background: "#242320" }} />
        </span>
      </span>
    </Stage>
  );
}

function StudioPages({ art }: { art: string }) {
  return (
    <Stage>
      <span className="lm-paper" style={{ left: 52, top: 22, width: 190, height: 236, padding: "8px 8px 0", transform: "rotate(-5deg)" }}>
        <span className="lm-ph" style={{ height: 156 }}>
          <Pic art={art} eager />
        </span>
        <span className="lm-k" style={{ padding: "11px 2px", fontSize: 6.5 }}>Golden hour</span>
      </span>
      <span className="lm-paper" style={{ left: 206, top: 60, width: 122, height: 160, padding: "6px 6px 0", transform: "rotate(6deg)" }}>
        <span className="lm-ph" style={{ height: 104 }}>
          <Pic art={art} eager />
        </span>
        <span className="lm-k" style={{ padding: "9px 2px", fontSize: 5.5 }}>4:5</span>
      </span>
    </Stage>
  );
}

function VideoPages({ art }: { art: string }) {
  return (
    <Stage>
      <span className="lm-paper" style={{ left: 92, top: 58, width: 240, height: 150, padding: 6, transform: "rotate(4deg)" }}>
        <span className="lm-ph" style={{ height: "100%" }}>
          <Pic art={art} eager />
        </span>
      </span>
      <span className="lm-paper" style={{ left: 34, top: 26, width: 282, height: 178, padding: "6px 6px 0", transform: "rotate(-1.5deg)" }}>
        <span className="lm-ph" style={{ height: 132 }}>
          <Pic art={art} eager />
        </span>
        <span style={{ position: "relative", display: "block", height: 2, margin: "15px 4px 0", borderRadius: 1, background: "#E4E1DA" }}>
          <i style={{ position: "absolute", left: 0, top: 0, height: 2, width: "40%", borderRadius: 1, background: "#242320" }} />
          <i style={{ position: "absolute", left: "40%", top: -3, width: 8, height: 8, marginLeft: -4, borderRadius: "50%", background: "#F4511E" }} />
        </span>
        <span className="lm-k" style={{ display: "flex", justifyContent: "space-between", margin: "8px 4px 0", fontSize: 6 }}>
          <span>0:12</span>
          <span>0:30</span>
        </span>
      </span>
    </Stage>
  );
}

export function MenuCardArt({ kind, art }: { kind: MenuCardKind; art: string }) {
  switch (kind) {
    case "chat":
      return <ChatPages />;
    case "studio":
      return <StudioPages art={art} />;
    case "video":
      return <VideoPages art={art} />;
    default:
      return <DocMini kind={kind} fill={1.08} />;
  }
}

export default MenuCardArt;
