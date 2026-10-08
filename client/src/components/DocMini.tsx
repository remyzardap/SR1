/* ─────────────────────────────────────────────────────────────────────────────
   DocMini.tsx — finished files shown as real miniature documents.
   Ported from design/sutaeru-app/docs.js: every preview is composed on a 560 × 340
   stage with real type and real figures, then scaled to fill whatever box it sits in.
   The numbers are sample data from lib/docMini.ts, the same the prototype ships.
   ─────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { SutaeruSeal } from "@/components/brand/SutaeruSeal";
import { cn } from "@/lib/utils";
import {
  BRIEF_DECISIONS,
  DOC_DEFAULTS,
  MONITOR_CHART_POINTS,
  REPORT_ROWS,
  SHEET_ROWS,
  type DocData,
  type DocFigure,
  type DocKind,
  type DocReport,
} from "@/lib/docMini";
import { photoUrl } from "@/lib/studioPhotos";

const STAGE_W = 560;
const STAGE_H = 340;

/** The report's front page bars and the deck's revenue series are part of the drawing. */
const REPORT_LINES = [92, 84, 88, 60];
const DECK_BARS = [0.44, 0.52, 0.61, 0.58, 0.72, 0.86];
const BRIEF_LINES = [90, 82, 86, 74, 88, 52];

export type DocOverrides = Partial<
  Pick<DocData, "title" | "kicker" | "cover"> & { meta?: string; figs?: DocFigure[]; bars?: number[] }
>;

export interface DocMiniProps {
  kind: DocKind;
  /** Overrides for the sample document (title, kicker, cover, meta). */
  data?: DocOverrides;
  /** Scale factor when the box is known, e.g. 1.2. Otherwise 1.3 for short boxes, 1.04 for tall ones. */
  fill?: number;
  className?: string;
}

/**
 * A miniature document, scaled to fill its box. The parent must be positioned;
 * the stage is absolutely centred and scaled to the smaller of the two ratios.
 */
export function DocMini({ kind, data, fill, className }: DocMiniProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const stage = stageRef.current;
    if (!box || !stage) return;
    const place = () => fitStage(box, stage, fill);
    place();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(place);
    ro.observe(box);
    return () => ro.disconnect();
  }, [fill]);

  const doc = { ...DOC_DEFAULTS[kind], ...data } as DocData;

  return (
    <div className="docbox" aria-hidden="true" ref={boxRef} data-fill={fill}>
      <div
        className={cn("doc-stage", `doc-${kind}`, className)}
        ref={stageRef}
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        <Stage kind={kind} doc={doc} />
      </div>
    </div>
  );
}

/* Scale every stage to fill its box; keeps working as boxes resize. */
function fitStage(box: HTMLElement, stage: HTMLElement, fill?: number): void {
  const w = box.clientWidth;
  const h = box.clientHeight;
  if (!w || !h) return;
  const factor = fill ?? (Number(box.dataset.fill) || (h < 200 ? 1.3 : 1.04));
  const k = Math.min(w / STAGE_W, h / STAGE_H) * factor;
  stage.style.transform = `translate(-50%, -50%) scale(${k.toFixed(4)})`;
}

function Stage({ kind, doc }: { kind: DocKind; doc: DocData }) {
  switch (kind) {
    case "report":
      return <ReportDoc doc={doc as DocReport} />;
    case "deck":
      return <DeckDoc doc={doc} />;
    case "sheet":
      return <SheetDoc doc={doc} />;
    case "brief":
      return <BriefDoc doc={doc} />;
    case "monitor":
      return <MonitorDoc doc={doc} />;
    default:
      return null;
  }
}

const cover = (name: string) => `url(${photoUrl(name, "l")})`;
const photoLayer = (name: string, style: CSSProperties): CSSProperties => ({
  backgroundImage: cover(name),
  ...style,
});

function ReportDoc({ doc }: { doc: DocReport }) {
  const last = doc.bars.length - 1;
  return (
    <>
      <div className="dp page back" style={box(292, 30, 190, 268, 6)}>
        <div className="dp-k">2 · Shortlist</div>
        <div className="dp-h3">Price, lead time and warranty</div>
        <div className="dp-table">
          {["Supplier", "USD/Wp", "Lead", "Warr."].map((h) => (
            <b key={h}>{h}</b>
          ))}
          {REPORT_ROWS.map((r) => (
            <React.Fragment key={r.supplier}>
              <span>{r.supplier}</span>
              <span>{r.usdPerWp}</span>
              <span>{r.leadTime}</span>
              <span>{r.warranty}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="dp-lines">
          {REPORT_LINES.map((w) => (
            <i key={w} style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="dp-foot">
          <span>Sutaeru</span>
          <span>2</span>
        </div>
      </div>
      <div className="dp page front" style={box(132, 20, 200, 282, -3.5)}>
        <div className="dp-photo" style={photoLayer(doc.cover, { height: 118 })} />
        <div className="dp-pad">
          <div className="dp-k">{doc.kicker}</div>
          <div className="dp-title">{doc.title}</div>
          <div className="dp-figs">
            {doc.figs.map((f) => (
              <div key={f.label}>
                <span>{f.label}</span>
                <b>{f.value}</b>
              </div>
            ))}
          </div>
          <div className="dp-bars">
            {doc.bars.map((b, i) => (
              <i key={i} className={i === last ? "hl" : undefined} style={{ height: Math.round(b * 26) }} />
            ))}
          </div>
          <div className="dp-foot">
            <span>{doc.meta}</span>
            <span>1</span>
          </div>
        </div>
      </div>
    </>
  );
}

function DeckDoc({ doc }: { doc: DocData }) {
  return (
    <>
      <div className="dp slide s3" style={box(186, 22, 300, 169)}>
        <div className="dp-k">03</div>
        <div className="dp-h3">Three risks, three owners</div>
        <div className="dp-lines">
          <i style={{ width: "70%" }} />
          <i style={{ width: "58%" }} />
        </div>
      </div>
      <div className="dp slide s2" style={box(158, 46, 310, 174)}>
        <div className="dp-k">02 · Revenue</div>
        <div className="dp-bigfig">+12%</div>
        <div className="dp-bars wide">
          {DECK_BARS.map((b, i) => (
            <i key={i} className={i === 5 ? "hl" : undefined} style={{ height: Math.round(b * 44) }} />
          ))}
        </div>
      </div>
      <div
        className="dp slide front cover"
        style={
          {
            ...box(108, 96, 344, 194),
            backgroundImage: `linear-gradient(180deg,rgba(14,13,12,.05),rgba(14,13,12,.78)),${cover(doc.cover)}`,
          } as CSSProperties
        }
      >
        <div className="dp-k light">{doc.kicker}</div>
        <div className="dp-title light">{doc.title}</div>
        <div className="dp-slide-foot">
          <span>Revenue +12% · Margin 21%</span>
          <span>{doc.meta}</span>
        </div>
      </div>
    </>
  );
}

function SheetDoc({ doc }: { doc: DocData }) {
  return (
    <>
      <div className="dp window" style={box(56, 34, 430, 262)}>
        <div className="dp-bar">
          <i />
          <i />
          <i />
          <span>{doc.title}.xlsx</span>
        </div>
        <div className="dp-fx">
          <b>F9</b>
          <span>=SUM(F2:F8)</span>
        </div>
        <div className="dp-grid">
          <div className="hdr">
            <span />
            {["A", "B", "C", "D", "E", "F"].map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="row th">
            <span>1</span>
            <span>No</span>
            <span>Item</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Rate</span>
            <span>Amount</span>
          </div>
          {SHEET_ROWS.map((r, i) => (
            <div className="row" key={r.no}>
              <span>{i + 2}</span>
              {[r.no, r.item, r.qty, r.unit, r.rate, r.amount].map((c, j) => (
                <span key={j} className={j >= 4 || j === 2 ? "num" : undefined}>
                  {c}
                </span>
              ))}
            </div>
          ))}
          <div className="row total">
            <span>9</span>
            <span />
            <span>Total</span>
            <span />
            <span />
            <span />
            <span className="num sel">1,067.4m</span>
          </div>
        </div>
        <div className="dp-tabs">
          <span className="on">Structure</span>
          <span>Finishes</span>
          <span>MEP</span>
          <span>Summary</span>
        </div>
      </div>
      <div className="dp polaroid" style={box(392, 186, 128, 112, 5)}>
        <div className="dp-photo" style={photoLayer(doc.cover, { height: 82 })} />
        <span>{doc.kicker}</span>
      </div>
    </>
  );
}

function BriefDoc({ doc }: { doc: DocData }) {
  return (
    <>
      <div className="dp page back" style={box(268, 34, 180, 256, 5)}>
        <div className="dp-k">Appendix</div>
        <div className="dp-lines">
          {BRIEF_LINES.map((w) => (
            <i key={w} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      <div className="dp page front" style={box(150, 18, 206, 290, -2)}>
        <div className="dp-photo" style={photoLayer(doc.cover, { height: 74 })} />
        <div className="dp-pad">
          <div className="dp-k">{doc.kicker} · One page</div>
          <div className="dp-title sm">{doc.title}</div>
          <p className="dp-p">
            A 120 kWp array with storage delivers power at USD 0.28 to 0.45 per kWh. The case rests on capital
            grants rather than tariff revenue.
          </p>
          <div className="dp-dec">
            {BRIEF_DECISIONS.map((d) => (
              <div key={d.label}>
                <span>{d.label}</span>
                <b>{d.text}</b>
              </div>
            ))}
          </div>
          <div className="dp-sign">
            <span>Prepared by Sutaeru</span>
            <SutaeruSeal className="seal dp-seal" rough={false} />
          </div>
        </div>
      </div>
    </>
  );
}

function MonitorDoc({ doc }: { doc: DocData }) {
  const path = MONITOR_CHART_POINTS.map(
    (y, i) => `${i ? "L" : "M"}${(18 + i * 31.5).toFixed(1)} ${y}`
  ).join(" ");
  return (
    <div className="dp card-m" style={box(80, 36, 400, 266)}>
      <div
        className="dp-photo band"
        style={
          {
            height: 92,
            backgroundImage: `linear-gradient(90deg,rgba(14,13,12,.72),rgba(14,13,12,.1)),${cover(doc.cover)}`,
          } as CSSProperties
        }
      >
        <div className="dp-k light">{doc.kicker}</div>
        <div className="dp-title light sm">{doc.title}</div>
      </div>
      <div className="dp-pad row2">
        <div>
          <span className="dp-k">I-3 industry · IDR / kWh</span>
          <b className="dp-bigfig sm">1,114.74</b>
        </div>
        <div className="dp-live">
          <i />
          Watching
        </div>
      </div>
      <svg className="dp-chart" viewBox="0 0 380 80" preserveAspectRatio="none">
        <path d={`${path} L364.5 80 L18 80Z`} className="area" />
        <path d={path} className="line" />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="0" x2="380" y1={20 + i * 18} y2={20 + i * 18} className="grid" />
        ))}
        <circle cx="364.5" cy="40" r="4" className="end" />
      </svg>
      <div className="dp-foot pad">
        <span>Jul</span>
        <span>Aug</span>
        <span>Sep</span>
        <span>Oct</span>
      </div>
    </div>
  );
}

/** Absolute placement on the 560 × 340 stage, with the prototype's page tilts. */
function box(left: number, top: number, width: number, height: number, rotate?: number): CSSProperties {
  return { left, top, width, height, transform: rotate === undefined ? undefined : `rotate(${rotate}deg)` };
}

export default DocMini;
