import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SutaeruSeal } from "@/components/brand/SutaeruSeal";
import {
  type DocKind,
  type DocData,
  DOC_DEFAULTS,
  REPORT_ROWS,
  SHEET_ROWS,
  MONITOR_CHART_POINTS,
  getDocDefaults,
} from "@/lib/docMini";

export interface DocMiniProps {
  kind: DocKind | string;
  data?: Partial<DocData> & {
    title?: string;
    kicker?: string;
    cover?: string;
    meta?: string;
    figs?: Array<[string, string]> | Array<{ label: string; value: string }>;
    bars?: number[];
  };
  fill?: number;
  className?: string;
  style?: React.CSSProperties;
}

const W = 560;
const H = 340;

function resolveCoverUrl(cover?: string): string {
  if (!cover) return "/studio/c/cov-solar.webp";
  if (cover.startsWith("/") || cover.startsWith("http")) return cover;
  const id = cover.endsWith(".webp") ? cover.slice(0, -5) : cover;
  return `/studio/c/${id}.webp`;
}

function normalizeFigs(
  rawFigs?: Array<[string, string]> | Array<{ label: string; value: string }>
): Array<[string, string]> {
  if (!rawFigs) return [["Suppliers", "3"], ["Best / Wp", "0.11"], ["Fastest", "4 wk"]];
  return rawFigs.map((f) => {
    if (Array.isArray(f)) return [f[0], f[1]];
    return [f.label, f.value];
  });
}

export function DocMini({ kind: rawKind, data, fill, className, style }: DocMiniProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(0.35);

  const kind = (
    rawKind === "report" || rawKind === "deck" || rawKind === "sheet" || rawKind === "brief" || rawKind === "monitor"
      ? rawKind
      : "report"
  ) as DocKind;

  const defaults = getDocDefaults(kind) || DOC_DEFAULTS.report;
  const merged = { ...defaults, ...(data || {}) };
  const coverUrl = resolveCoverUrl(merged.cover);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const updateScale = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (!w || !h) return;
      const k = Math.min(w / W, h / H) * (fill ? fill : h < 200 ? 1.3 : 1.04);
      setScale(k);
    };

    updateScale();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => updateScale());
      ro.observe(box);
      return () => ro.disconnect();
    }

    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [fill]);

  const renderContent = () => {
    switch (kind) {
      case "report": {
        const figs = normalizeFigs(merged.figs as any);
        const bars = merged.bars || [0.62, 0.7, 0.55, 0.86];
        return (
          <>
            <div
              className="dp page back"
              style={{ left: 292, top: 30, width: 190, height: 268, transform: "rotate(6deg)" }}
            >
              <div className="dp-k">2 · Shortlist</div>
              <div className="dp-h3">Price, lead time and warranty</div>
              <div className="dp-table">
                <b>Supplier</b>
                <b>USD/Wp</b>
                <b>Lead</b>
                <b>Warr.</b>
                {REPORT_ROWS.map((r, i) => (
                  <React.Fragment key={i}>
                    <span>{r.supplier}</span>
                    <span>{r.usdPerWp}</span>
                    <span>{r.leadTime}</span>
                    <span>{r.warranty}</span>
                  </React.Fragment>
                ))}
              </div>
              <div className="dp-lines">
                <i style={{ width: "92%" }} />
                <i style={{ width: "84%" }} />
                <i style={{ width: "88%" }} />
                <i style={{ width: "60%" }} />
              </div>
              <div className="dp-foot">
                <span>Sutaeru</span>
                <span>2</span>
              </div>
            </div>
            <div
              className="dp page front"
              style={{ left: 132, top: 20, width: 200, height: 282, transform: "rotate(-3.5deg)" }}
            >
              <div className="dp-photo" style={{ height: 118, backgroundImage: `url(${coverUrl})` }} />
              <div className="dp-pad">
                <div className="dp-k">{merged.kicker || "Research report"}</div>
                <div className="dp-title">{merged.title}</div>
                <div className="dp-figs">
                  {figs.map(([k, v], i) => (
                    <div key={i}>
                      <span>{k}</span>
                      <b>{v}</b>
                    </div>
                  ))}
                </div>
                <div className="dp-bars">
                  {bars.map((b, i) => (
                    <i
                      key={i}
                      style={{ height: `${Math.round(b * 26)}px` }}
                      className={i === bars.length - 1 ? "hl" : ""}
                    />
                  ))}
                </div>
                <div className="dp-foot">
                  <span>{merged.meta || "Oct 2026 · 12 pages"}</span>
                  <span>1</span>
                </div>
              </div>
            </div>
          </>
        );
      }
      case "deck": {
        return (
          <>
            <div className="dp slide s3" style={{ left: 186, top: 22, width: 300, height: 169 }}>
              <div className="dp-k">03</div>
              <div className="dp-h3">Three risks, three owners</div>
              <div className="dp-lines">
                <i style={{ width: "70%" }} />
                <i style={{ width: "58%" }} />
              </div>
            </div>
            <div className="dp slide s2" style={{ left: 158, top: 46, width: 310, height: 174 }}>
              <div className="dp-k">02 · Revenue</div>
              <div className="dp-bigfig">+12%</div>
              <div className="dp-bars wide">
                {[0.44, 0.52, 0.61, 0.58, 0.72, 0.86].map((b, i) => (
                  <i key={i} style={{ height: `${Math.round(b * 44)}px` }} className={i === 5 ? "hl" : ""} />
                ))}
              </div>
            </div>
            <div
              className="dp slide front cover"
              style={{
                left: 108,
                top: 96,
                width: 344,
                height: 194,
                backgroundImage: `linear-gradient(180deg, rgba(14,13,12,.05), rgba(14,13,12,.78)), url(${coverUrl})`,
              }}
            >
              <div className="dp-k light">{merged.kicker || "TGWI · October 2026"}</div>
              <div className="dp-title light">{merged.title}</div>
              <div className="dp-slide-foot">
                <span>Revenue +12% · Margin 21%</span>
                <span>{merged.meta || "01 / 10"}</span>
              </div>
            </div>
          </>
        );
      }
      case "sheet": {
        return (
          <>
            <div className="dp window" style={{ left: 56, top: 34, width: 430, height: 262 }}>
              <div className="dp-bar">
                <i />
                <i />
                <i />
                <span>{merged.title}.xlsx</span>
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
                  <div className="row" key={i}>
                    <span>{i + 2}</span>
                    <span>{r.no}</span>
                    <span>{r.item}</span>
                    <span className="num">{r.qty}</span>
                    <span>{r.unit}</span>
                    <span className="num">{r.rate}</span>
                    <span className="num">{r.amount}</span>
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
            <div
              className="dp polaroid"
              style={{ left: 392, top: 186, width: 128, height: 112, transform: "rotate(5deg)" }}
            >
              <div className="dp-photo" style={{ height: 82, backgroundImage: `url(${coverUrl})` }} />
              <span>{merged.kicker || "Site · Seminyak"}</span>
            </div>
          </>
        );
      }
      case "brief": {
        return (
          <>
            <div
              className="dp page back"
              style={{ left: 268, top: 34, width: 180, height: 256, transform: "rotate(5deg)" }}
            >
              <div className="dp-k">Appendix</div>
              <div className="dp-lines">
                <i style={{ width: "90%" }} />
                <i style={{ width: "82%" }} />
                <i style={{ width: "86%" }} />
                <i style={{ width: "74%" }} />
                <i style={{ width: "88%" }} />
                <i style={{ width: "52%" }} />
              </div>
            </div>
            <div
              className="dp page front"
              style={{ left: 150, top: 18, width: 206, height: 290, transform: "rotate(-2deg)" }}
            >
              <div className="dp-photo" style={{ height: 74, backgroundImage: `url(${coverUrl})` }} />
              <div className="dp-pad">
                <div className="dp-k">{merged.kicker || "Board brief"} · One page</div>
                <div className="dp-title sm">{merged.title}</div>
                <p className="dp-p">
                  A 120 kWp array with storage delivers power at USD 0.28 to 0.45 per kWh. The case rests on capital
                  grants rather than tariff revenue.
                </p>
                <div className="dp-dec">
                  <div>
                    <span>Decision 1</span>
                    <b>Approve a pilot in one village</b>
                  </div>
                  <div>
                    <span>Decision 2</span>
                    <b>Apply for the capital grant</b>
                  </div>
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
      case "monitor": {
        const pts = MONITOR_CHART_POINTS;
        const linePath = pts.map((y, i) => `${i ? "L" : "M"}${(18 + i * 31.5).toFixed(1)} ${y}`).join(" ");
        const areaPath = `${linePath} L364.5 80 L18 80Z`;
        return (
          <div className="dp card-m" style={{ left: 80, top: 36, width: 400, height: 266 }}>
            <div
              className="dp-photo band"
              style={{
                height: 92,
                backgroundImage: `linear-gradient(90deg, rgba(14,13,12,.72), rgba(14,13,12,.1)), url(${coverUrl})`,
              }}
            >
              <div className="dp-k light">{merged.kicker || "Every 6 hours"}</div>
              <div className="dp-title light sm">{merged.title}</div>
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
              <path d={areaPath} className="area" />
              <path d={linePath} className="line" />
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
      default:
        return null;
    }
  };

  return (
    <div ref={boxRef} className={cn("docbox", className)} style={style} aria-hidden="true">
      <div
        className={cn("doc-stage", `doc-${kind}`)}
        style={{
          width: W,
          height: H,
          transform: `translate(-50%, -50%) scale(${scale.toFixed(4)})`,
        }}
      >
        {renderContent()}
      </div>
    </div>
  );
}

export default DocMini;
