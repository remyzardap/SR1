import * as React from "react";
import { cn } from "@/lib/utils";
import { DotMatrixValue } from "@/components/session/DotMatrixValue";

export const STUDIO_COVER_BY_KIND: Record<ResultCardProps["kind"], string> = {
  report: "/studio/c/cov-solar.webp",
  deck: "/studio/c/cov-jakarta-bw.webp",
  sheet: "/studio/c/cov-villa.webp",
  brief: "/studio/c/cov-village.webp",
  monitor: "/studio/c/cov-pylons.webp",
  image: "/studio/c/cov-clay.webp",
};

export interface ResultCardProps {
  kind: "report" | "deck" | "sheet" | "brief" | "monitor" | "image";
  title: string;
  subtitle?: string;
  summary: string;
  figures: Array<{ label: string; value: string }>;
  meta: string;
  coverImage?: string;
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

const DONE_STAMP_PATH =
  "M705 348Q807 382 959 396L958 408Q928 416 908.5 441.5Q889 467 881 506Q724 468 630 400Q534 455 408 491Q482 508 509.5 518Q537 528 537 535Q537 538 530 543L514 553L514 599L731 599Q731 531 724 488Q804 505 835 515.5Q866 526 866 533Q866 537 859 542L843 554L843 698Q845 822 851 933Q845 944 813.5 956Q782 968 752 968Q725 968 725 948Q729 902 731 833L731 765L494 765Q444 909 277 970L270 960Q349 900 376.5 817Q404 734 404 633L404 563Q404 521 400 493Q335 510 290 518L285 505Q460 449 574 353Q513 288 477 203Q467 225 431 290Q433 293 433 299Q433 309 426 314L377 242Q415 219 451 191L412 191Q379 192 344 205L318 154Q373 160 451 162L568 162Q568 78 560 29Q640 46 671 56.5Q702 67 702 74Q702 78 695 83L678 94L678 162L791 162L818 121Q822 115 830 103Q838 91 843 85.5Q848 80 852 80Q858 80 883 101Q908 122 930.5 145Q953 168 953 175Q950 191 927 191L841 191Q791 280 705 348M204 202Q193 165 165.5 124.5Q138 84 108 55L115 48Q179 50 220 66Q261 82 279.5 105.5Q298 129 298 154Q298 178 281.5 195.5Q265 213 241 213Q222 213 204 202M620 310Q671 257 702 191L489 191Q534 263 620 310M235 619Q220 674 220 712Q221 727 224.5 740Q228 753 236 772Q247 803 252.5 825Q258 847 258 878Q258 920 236 945.5Q214 971 176 971Q159 971 145 958Q131 945 126 919Q136 858 136 800Q136 763 131 739Q126 715 116 708Q99 695 66 692L66 673L110 673Q122 673 126.5 670Q131 667 140 653Q156 625 195.5 541.5Q235 458 336 239L351 242L333 300Q249 566 235 619M166 437Q145 437 125 423Q118 387 94.5 348Q71 309 43 283L51 276Q137 282 178.5 312.5Q220 343 220 380Q220 404 204.5 420.5Q189 437 166 437M514 627L514 634Q512 698 502 737L731 737L731 627";

function QuietDoneStamp() {
  return (
    <div className="q-done-stamp">
      <svg
        role="img"
        aria-label="Done"
        width="92"
        height="92"
        viewBox="0 0 100 100"
        style={{ display: "block", color: "#F4511E" }}
      >
        <g fill="currentColor" stroke="currentColor">
          <circle cx="50" cy="50" r="45" fill="none" strokeWidth="4.5" />
          <circle cx="50" cy="50" r="38.5" fill="none" strokeWidth="1.6" />
          <path
            d={DONE_STAMP_PATH}
            transform="translate(23.5 22) scale(0.053)"
            stroke="none"
          />
        </g>
      </svg>
    </div>
  );
}

function ComparisonTable({
  head,
  rows,
}: {
  head: string[];
  rows: Array<{ cells: string[]; isBest?: boolean }>;
}) {
  return (
    <div className="qcard cmp" style={{ marginTop: 12 }}>
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={row.isBest ? "best" : ""}>
              {row.cells.map((cell, j) => (
                <td key={j}>
                  {cell}
                  {j === 0 && row.isBest && (
                    <span
                      className="qmono"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        marginLeft: 8,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "var(--card)",
                        color: "var(--ink)",
                        fontSize: 9.5,
                      }}
                    >
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

function FollowUpBar({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="qbar"
      style={{
        marginTop: 12,
        padding: "6px 6px 6px 18px",
        borderRadius: 28,
        background: "var(--card)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <input
        type="text"
        aria-label="Ask a follow up"
        placeholder="Ask a follow up"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 0,
          background: "transparent",
          fontSize: 15,
          color: "var(--ink)",
          fontFamily: "var(--body)",
        }}
      />
      <button
        type="submit"
        className="qtap"
        aria-label="Send"
        style={{
          flex: "none",
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: 0,
          background: "var(--ink)",
          color: "var(--bg)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}

export function ResultCard({
  kind,
  title,
  subtitle,
  summary,
  figures,
  meta,
  coverImage,
  comparison,
  documentPreview,
  status,
  errorMessage,
  onDownload,
  onOpenDocuments,
  onShare,
  onFollowUp,
  onBack,
  className,
}: ResultCardProps) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const resolvedCover =
    coverImage || STUDIO_COVER_BY_KIND[kind] || STUDIO_COVER_BY_KIND.report;

  if (status === "error") {
    return (
      <div id="view-done" className={cn("result q-done-root", className)}>
        <div className="q-done-stage">
          <header
            style={{
              position: "relative",
              zIndex: 5,
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 60,
              padding: "0 8px",
              flex: "none",
            }}
          >
            <button
              type="button"
              className="qtap"
              aria-label="Back"
              onClick={onBack}
              style={{
                flex: "none",
                display: "grid",
                placeItems: "center",
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: 0,
                background: "none",
                color: "var(--ink)",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <span style={{ flex: 1 }} />
          </header>

          <h1
            style={{
              margin: 0,
              padding: "4px 22px 0",
              fontFamily: "var(--disp)",
              fontWeight: 800,
              fontSize: 30,
              lineHeight: 1,
              letterSpacing: "-.045em",
            }}
          >
            <span style={{ display: "block", color: "var(--ink)" }}>
              {title || "Something went wrong"}
            </span>
            <span style={{ display: "block", color: "var(--quiet)" }}>
              {subtitle || "not completed"}
            </span>
          </h1>

          <section
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              display: "grid",
              placeItems: "center",
              padding: "24px 22px",
            }}
          >
            <div
              role="alert"
              className="qcard"
              style={{
                width: "100%",
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <span className="qmono" style={{ color: "#F4511E" }}>
                Error
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: "var(--ink)",
                }}
              >
                {errorMessage ||
                  summary ||
                  "The session encountered an error and could not complete."}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="qtap"
                  onClick={onOpenDocuments}
                  style={{
                    minHeight: 48,
                    padding: "0 22px",
                    borderRadius: 24,
                    border: 0,
                    background: "var(--ink)",
                    color: "var(--bg)",
                    fontFamily: "var(--disp)",
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  Try again
                </button>
                <button
                  type="button"
                  className="qtap"
                  onClick={onBack}
                  style={{
                    minHeight: 48,
                    padding: "0 22px",
                    borderRadius: 24,
                    border: "1px solid var(--stroke)",
                    background: "var(--card)",
                    color: "var(--ink)",
                    fontFamily: "var(--disp)",
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  Back to session
                </button>
              </div>
            </div>
          </section>

          {onFollowUp && (
            <div style={{ padding: "0 22px 34px" }}>
              <FollowUpBar onSend={onFollowUp} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="view-done" className={cn("result q-done-root", className)}>
      <div className="q-done-stage">
        <header
          style={{
            position: "relative",
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 60,
            padding: "0 8px",
            flex: "none",
          }}
        >
          <button
            type="button"
            className="qtap"
            aria-label="Back"
            onClick={onBack}
            style={{
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: 0,
              background: "none",
              color: "var(--ink)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="qtap"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((prev) => !prev)}
            style={{
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: 0,
              background: "none",
              color: "var(--ink)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="5" cy="12" r="1.4" fill="currentColor" />
              <circle cx="12" cy="12" r="1.4" fill="currentColor" />
              <circle cx="19" cy="12" r="1.4" fill="currentColor" />
            </svg>
          </button>
        </header>

        <h1
          style={{
            margin: 0,
            padding: "4px 22px 0",
            fontFamily: "var(--disp)",
            fontWeight: 800,
            fontSize: 30,
            lineHeight: 1,
            letterSpacing: "-.045em",
            animation: "qRise .8s cubic-bezier(.2,.8,.2,1) 0s both",
          }}
        >
          <span style={{ display: "block", color: "var(--ink)" }}>{title}</span>
          <span style={{ display: "block", color: "var(--quiet)" }}>
            {subtitle || "ready"}
          </span>
        </h1>

        <section
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            display: "grid",
            placeItems: "center",
            padding: "20px 0",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: "46%",
              width: 520,
              height: 420,
              transform: "translate(-50%,-50%)",
              borderRadius: "50%",
              background:
                "radial-gradient(closest-side,rgba(244,81,30,.14),rgba(244,81,30,0))",
              pointerEvents: "none",
            }}
          />

          <div className="q-done-card-float">
            <div
              className="qcard"
              style={{
                width: 300,
                height: 199,
                borderRadius: 24,
                boxShadow:
                  "0 0 0 1px var(--stroke),0 40px 80px -30px rgba(0,0,0,.7)",
                transform: "rotate(-3deg)",
              }}
            >
              {documentPreview ? (
                documentPreview
              ) : (
                <img
                  src={resolvedCover}
                  alt={title}
                  width={300}
                  height={199}
                  style={{
                    display: "block",
                    width: 300,
                    height: 199,
                    objectFit: "cover",
                  }}
                />
              )}
            </div>
            <QuietDoneStamp />
          </div>
        </section>

        <div
          style={{
            flex: "none",
            display: "flex",
            justifyContent: "center",
            gap: 40,
            color: "var(--ink)",
            animation: "qRise .8s cubic-bezier(.2,.8,.2,1) 0.6s both",
            flexWrap: "wrap",
            padding: "0 22px",
          }}
        >
          {figures.map((fig, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <DotMatrixValue value={fig.value} ariaLabel={fig.value} />
              <span className="qmono" style={{ color: "var(--quiet)" }}>
                {fig.label}
              </span>
            </div>
          ))}
        </div>

        {/* Expandable More drawer for summary, meta, comparison table, and follow-up */}
        {moreOpen && (
          <div
            role="region"
            aria-label="Result details"
            style={{ margin: "16px 22px 0" }}
          >
            <div className="qcard" style={{ padding: "16px 18px" }}>
              {meta && (
                <span
                  className="qmono"
                  style={{ display: "block", color: "var(--quiet)", marginBottom: 6 }}
                >
                  {meta}
                </span>
              )}
              {summary && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "var(--ink)",
                  }}
                >
                  {summary}
                </p>
              )}
            </div>
            {comparison && (
              <ComparisonTable head={comparison.head} rows={comparison.rows} />
            )}
            {onFollowUp && <FollowUpBar onSend={onFollowUp} />}
          </div>
        )}

        {/* Bottom 3-button action bar matching Result.dc.html */}
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 28px 34px",
          }}
        >
          <button
            type="button"
            className="qtap"
            aria-label="Share"
            onClick={onShare}
            style={{
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: 0,
              background: "var(--panel)",
              color: "var(--ink)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 15V4M7 8l5-5 5 5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
            </svg>
          </button>

          <button
            type="button"
            className="qtap"
            onClick={onOpenDocuments || onDownload}
            style={{
              flex: "none",
              height: 64,
              padding: "0 34px",
              borderRadius: 32,
              border: 0,
              background: "var(--ink)",
              color: "var(--bg)",
              fontFamily: "var(--disp)",
              fontWeight: 700,
              fontSize: 17,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
            Open
          </button>

          <button
            type="button"
            className="qtap"
            aria-label="Save"
            onClick={onDownload}
            style={{
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: 0,
              background: "var(--panel)",
              color: "var(--ink)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 4h12v17l-6-4-6 4z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResultCard;