import * as React from "react";
import { cn } from "@/lib/utils";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { Button } from "@/components/ui/button";
import { SutaeruSeal, SutaeruStamp } from "@/components/brand/SutaeruSeal";

export interface ResultCardProps {
  kind: "report" | "deck" | "sheet" | "brief" | "monitor" | "image";
  title: string;
  summary: string;
  figures: Array<{ label: string; value: string }>;
  meta: string;
  comparison?: {
    head: string[];
    rows: Array<{ cells: string[]; isBest?: boolean }>;
  };
  documentPreview?: React.ReactNode;
  isWide?: boolean;
  status: "finished" | "error";
  errorMessage?: string;
  onDownload?: () => void;
  onOpenDocuments?: () => void;
  onShare?: () => void;
  onFollowUp?: (text: string) => void;
  onBack?: () => void;
  className?: string;
}

function SettledStamp({ pressing, size = 92, className, style }: { pressing?: boolean; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={cn("done-stamp", pressing && "pressing", className)}
      style={{
        position: "absolute",
        width: size,
        height: size,
        color: "var(--hero-ink)",
        opacity: 0.9,
        transform: "rotate(-9deg)",
        pointerEvents: "none",
        zIndex: 1,
        ...style,
      }}
      aria-hidden="true"
    >
      <SutaeruStamp className="stamp" style={{ width: "100%", height: "100%", display: "block" }} />
    </span>
  );
}

function MiniStamp({ className }: { className?: string }) {
  return (
    <span className={cn("mini-stamp", className)} style={{ width: 40, height: 40, color: "var(--ink)", flex: "none", transform: "rotate(-8deg)" }} aria-hidden="true">
      <SutaeruStamp className="stamp" style={{ width: "100%", height: "100%", display: "block" }} />
    </span>
  );
}

function DitherEdge({ className }: { className?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const intensityRef = React.useRef(70);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--hero-ink").trim() || "#F4F2EC";
      const k = intensityRef.current / 100;
      const s = 2;
      const seed = 4;

      function rng(seed: number) {
        let a = seed >>> 0;
        return () => {
          a = (a + 0x6d2b79f5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      const R = rng(seed);
      for (let py = 0; py < h; py += s) {
        for (let px = 0; px < w; px += s) {
          const u = px / w;
          const v = py / h;
          let d = Math.pow(Math.max(0, (u - 0.12) / 0.88), 1.5) * (0.8 + 0.2 * Math.sin(v * 3.1 + 0.6));
          if (R() < d * k) {
            ctx.fillRect(px, py, s * 0.78, s * 0.78);
          }
        }
      }
    };

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return <canvas ref={canvasRef} className={cn("edge art-deco", className)} aria-hidden="true" style={{ position: "absolute", right: 0, top: 0, width: "46%", height: "70%", pointerEvents: "none" }} />;
}

function DocumentPreview({ kind, title, children }: { kind: string; title: string; children?: React.ReactNode }) {
  if (children) {
    return <div className="result-doc" style={{ display: "block", position: "absolute", right: 0, top: 0, bottom: 0, width: "46%" }}>{children}</div>;
  }

  return (
    <div className="result-doc" style={{ display: "block", position: "absolute", right: 0, top: 0, bottom: 0, width: "46%" }}>
      <div className="docbox" style={{ inset: "10px 18px 10px 0", position: "absolute" }}>
        <div style={{ aspectRatio: "1.6", borderRadius: 12, background: "var(--panel)", overflow: "hidden" }}>
          <svg viewBox="0 0 560 340" style={{ width: "100%", height: "100%" }}>
            <rect x="0" y="0" width="560" height="340" fill="var(--paper)" />
            <rect x="20" y="20" width="520" height="300" rx="8" fill="var(--card)" stroke="var(--stroke)" />
            <text x="40" y="60" fontFamily="var(--disp)" fontSize="24" fontWeight="800" fill="var(--ink)">{kind === "deck" ? "Deck cover" : kind === "sheet" ? "Spreadsheet" : "Report cover"}</text>
            <text x="40" y="100" fontFamily="var(--body)" fontSize="14" fill="var(--quiet)">{title}</text>
            <rect x="40" y="120" width="200" height="80" rx="4" fill="var(--accent-tint)" />
            <text x="50" y="165" fontFamily="var(--body)" fontSize="12" fill="var(--accent)">Cover photo</text>
            {kind === "sheet" && (
              <>
                <rect x="40" y="220" width="480" height="80" rx="4" fill="var(--card)" stroke="var(--stroke)" />
                <text x="50" y="250" fontFamily="var(--mono)" fontSize="11" fill="var(--ink)">A1: Structure  B1: 1.42bn  C1: 46%</text>
                <text x="50" y="270" fontFamily="var(--mono)" fontSize="11" fill="var(--ink)">A2: Finishes  B2: 0.86bn  C2: 28%</text>
              </>
            )}
            {kind === "deck" && (
              <>
                <rect x="40" y="220" width="150" height="80" rx="4" fill="var(--card)" stroke="var(--stroke)" />
                <rect x="210" y="220" width="150" height="80" rx="4" fill="var(--card)" stroke="var(--stroke)" />
                <rect x="380" y="220" width="150" height="80" rx="4" fill="var(--card)" stroke="var(--stroke)" />
                <text x="50" y="260" fontFamily="var(--body)" fontSize="11" fill="var(--quiet)">Slide 2</text>
                <text x="220" y="260" fontFamily="var(--body)" fontSize="11" fill="var(--quiet)">Slide 3</text>
                <text x="390" y="260" fontFamily="var(--body)" fontSize="11" fill="var(--quiet)">Slide 4</text>
              </>
            )}
          </svg>
        </div>
        <SettledStamp className="doc-stamp" pressing={false} size={104} style={{ position: "absolute", width: 104, height: 104, right: 46, bottom: 34, color: "var(--accent)", transform: "rotate(-11deg)", zIndex: 2, mixBlendMode: "normal", opacity: 0.92 }} />
      </div>
    </div>
  );
}

function ComparisonTable({ head, rows }: { head: string[]; rows: Array<{ cells: string[]; isBest?: boolean }> }) {
  return (
    <div className="card cmp" style={{ padding: "6px 22px", overflowX: "auto", marginTop: 20 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520, fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "14px 10px 10px 0", font: "500 11px/1 var(--mono)", letterSpacing: "1.54px", textTransform: "uppercase", color: "var(--quiet)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={row.isBest ? "best" : ""} style={{ ...(row.isBest && { fontWeight: 600 }) }}>
              {row.cells.map((cell, j) => (
                <td key={j} style={{ padding: "14px 10px 14px 0", borderTop: "1px solid var(--hair)", fontSize: 15, ...(j === 0 && { font: "700 16px/1.25 var(--disp)" }) }}>
                  {cell}
                  {j === 0 && row.isBest && (
                    <span className="tag bestmark" style={{ display: "inline-flex", marginLeft: 8, verticalAlign: "1px", height: 26, padding: "0 10px", borderRadius: 999, background: "var(--panel)", font: "500 11px/1 var(--mono)", letterSpacing: "1.54px", textTransform: "uppercase", color: "var(--ink)" }}>
                      Pick
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FollowUpComposer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, padding: "12px 16px", border: "1px solid var(--stroke)", borderRadius: 28, marginTop: "28px calc(var(--gutter) * -1) -40px", background: "linear-gradient(to top, var(--paper) 70%, transparent)" }}>
      <label htmlFor="done-followup" className="sr">Ask a follow up</label>
      <input
        id="done-followup"
        type="text"
        placeholder="Ask a follow up"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", fontSize: 16 }}
        enterKeyHint="send"
      />
      <Button type="submit" className="icon-btn ink" style={{ width: 44, height: 44 }} aria-label="Send">
        <SutaeruIcon name="arrow" className="h-5 w-5" />
      </Button>
    </form>
  );
}

export function ResultCard({
  kind,
  title,
  summary,
  figures,
  meta,
  comparison,
  documentPreview,
  isWide = false,
  status,
  errorMessage,
  onDownload,
  onOpenDocuments,
  onShare,
  onFollowUp,
  onBack,
  className,
}: ResultCardProps) {
  const [stamped, setStamped] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setStamped(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (status === "error") {
    return (
      <section className={cn("view view-enter", className)} id="view-done" style={{ maxWidth: 1240, margin: "0 auto", padding: "28px var(--gutter) 40px", minHeight: "calc(100% - var(--top-h))" }}>
        <div className="hero-card" style={{ padding: 36, textAlign: "center", background: "var(--hero)", color: "var(--hero-ink)", borderRadius: "var(--r-lg)" }}>
          <span className="tag alert" style={{ display: "inline-block", marginBottom: 16 }}>
            <span className="live-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--alert)", flex: "none", display: "inline-block", marginRight: 8 }} />
            Error
          </span>
          <h1 className="title" style={{ fontSize: 34, marginBottom: 16, fontFamily: "var(--disp)", fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1.02, textWrap: "balance" }}>
            Something went wrong
          </h1>
          <p style={{ color: "var(--hero-quiet)", fontSize: 16, lineHeight: 1.55, maxWidth: "32em", margin: "0 auto 24px" }}>{errorMessage || "The session encountered an error and could not complete."}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Button className="btn ink big" onClick={onOpenDocuments}>
              <SutaeruIcon name="plan" className="h-5 w-5" /> Try again
            </Button>
            <Button className="btn big" onClick={onBack}>
              <SutaeruIcon name="arrow" className="h-5 w-5" /> Back to session
            </Button>
          </div>
        </div>
        <FollowUpComposer onSend={onFollowUp || (() => {})} />
      </section>
    );
  }

  return (
    <section className={cn("view view-enter", className)} id="view-done" style={{ maxWidth: 1240, margin: "0 auto", padding: "28px var(--gutter) 40px", minHeight: "calc(100% - var(--top-h))" }}>
      <Button className="btn ghost backlink" variant="ghost" onClick={onBack || (() => {})} style={{ marginBottom: 12 }}>
        <SutaeruIcon name="arrow" className="h-5 w-5" /> {title}
      </Button>

      <div className="hero-card result" style={{ position: "relative", padding: isWide ? 36 : 26, display: "flex", flexDirection: "column", gap: 16, minHeight: isWide ? 380 : 320, borderRadius: "var(--r-lg)", background: "var(--hero)", color: "var(--hero-ink)", overflow: "hidden" }}>
        <SettledStamp pressing={!stamped} size={isWide ? 116 : 92} style={{ top: isWide ? 28 : 20, right: isWide ? 30 : 20 }} />
        <DitherEdge />
        {isWide && <DocumentPreview kind={kind} title={title}><SettledStamp className="doc-stamp" pressing={!stamped} size={104} style={{ position: "absolute", width: 104, height: 104, right: 46, bottom: 34, color: "var(--accent)", transform: "rotate(-11deg)", zIndex: 2, mixBlendMode: "normal", opacity: 0.92 }} /></DocumentPreview>}

        <span className="mono" style={{ position: "relative" }}>Result · {kind.charAt(0).toUpperCase() + kind.slice(1)}</span>
        <h1 className="title" style={{ fontSize: isWide ? 52 : 34, color: "var(--hero-ink)", maxWidth: isWide ? "9em" : "6.6em", position: "relative", fontFamily: "var(--disp)", fontWeight: 800, letterSpacing: "-.035em", lineHeight: 1.02, textWrap: "balance" }}>
          {title}
        </h1>
        <p style={{ margin: 0, color: "var(--hero-quiet)", fontSize: 16, lineHeight: 1.55, maxWidth: "32em", position: "relative" }}>{summary}</p>

        <div className="figs" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, auto))", justifyContent: "start", gap: "8px 28px", paddingTop: 18, borderTop: "1px solid var(--hero-hair)", position: "relative" }}>
          {figures.map((fig, i) => (
            <div key={i}>
              <span className="mono" style={{ display: "block", fontSize: 11, letterSpacing: "1.54px", textTransform: "uppercase", color: "var(--hero-quiet)" }}>{fig.label}</span>
              <b className="tnum" style={{ display: "block", font: "800 26px/1 var(--disp)", letterSpacing: "-.02em", marginTop: 6, color: "var(--hero-ink)" }}>
                {fig.value}
              </b>
            </div>
          ))}
        </div>

        <span className="mono" style={{ position: "relative" }}>{meta}</span>

        <div className="done-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <Button className="btn ink big" onClick={onDownload}>
            <SutaeruIcon name="download" className="h-5 w-5" /> Download
          </Button>
          <Button className="btn big" onClick={onOpenDocuments}>
            <SutaeruIcon name="edit" className="h-5 w-5" /> Documents
          </Button>
          <Button className="btn big" onClick={onShare}>
            <SutaeruIcon name="share" className="h-5 w-5" /> Share
          </Button>
        </div>

        <p className="sent-line" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--hero-quiet)", fontSize: 14, marginTop: 14 }}>
          <SutaeruIcon name="check" className="s" style={{ width: 16, height: 16, fill: "var(--accent)" }} /> Telegram notified · saved to Files
        </p>

        {comparison && <ComparisonTable head={comparison.head} rows={comparison.rows} />}

        <FollowUpComposer onSend={onFollowUp || (() => {})} />
      </div>
    </section>
  );
}

export default ResultCard;