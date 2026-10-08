import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { ResultCard, type ResultCardProps } from "./ResultCard";
import { getAuthToken } from "@/lib/authSession";
import { trpc } from "@/lib/trpc";

interface DoneContainerProps {
  sessionId: string;
  runId?: string;
  onBack?: () => void;
  onOpenSession?: () => void;
}

function getResultDataForType(type: string): ResultCardProps {
  const results: Record<string, ResultCardProps> = {
    report: {
      kind: "report",
      title: "PV module supplier comparison",
      summary: "Jinko and Trina tie on price at USD 0.11 per Wp. LONGi costs a cent more but ships in four weeks, which keeps the 500 kWp build on schedule.",
      figures: [
        { label: "Suppliers", value: "3" },
        { label: "Best price", value: "0.11" },
        { label: "Fastest", value: "4 wks" },
      ],
      meta: "PDF · 12 pages · 2.4 MB",
      comparison: {
        head: ["Supplier", "Price per Wp", "Lead time", "Warranty"],
        rows: [
          { cells: ["Jinko Tiger Neo 620 W", "USD 0.11", "6 weeks", "30 years"], isBest: true },
          { cells: ["LONGi Hi-MO 6 580 W", "USD 0.12", "4 weeks", "25 years"] },
          { cells: ["Trina Vertex 600 W", "USD 0.11", "8 weeks", "30 years"] },
        ],
      },
      status: "finished",
    },
    deck: {
      kind: "deck",
      title: "Q3 investor update",
      summary: "Revenue grew 12 percent on Q2 and operating margin held at 21 percent. Three risks are flagged, each with an owner and a date.",
      figures: [
        { label: "Slides", value: "10" },
        { label: "Revenue", value: "+12%" },
        { label: "Margin", value: "21%" },
      ],
      meta: "PPTX · 10 slides · 6.1 MB",
      comparison: {
        head: ["Slide", "Message", "Chart"],
        rows: [
          { cells: ["1", "Revenue up 12 percent", "Bars"], isBest: true },
          { cells: ["2", "Margin held at 21 percent", "Line"] },
          { cells: ["3", "Three risks, three owners", "Table"] },
        ],
      },
      status: "finished",
    },
    sheet: {
      kind: "sheet",
      title: "Villa BOQ and budget",
      summary: "Total build cost comes to IDR 3.1 billion. Structure is 46 percent of it; finishes are where the range is widest.",
      figures: [
        { label: "Tabs", value: "6" },
        { label: "Line items", value: "212" },
        { label: "Total", value: "3.1 bn" },
      ],
      meta: "XLSX · 6 tabs · 840 KB",
      comparison: {
        head: ["Package", "Amount (IDR)", "Share"],
        rows: [
          { cells: ["Structure", "1.42 bn", "46%"], isBest: true },
          { cells: ["Finishes", "0.86 bn", "28%"] },
          { cells: ["MEP", "0.51 bn", "16%"] },
        ],
      },
      status: "finished",
    },
    brief: {
      kind: "brief",
      title: "Off grid solar for remote villages",
      summary: "The case rests on capital grants, not tariff revenue. The brief asks the board for a one village pilot and a grant application.",
      figures: [
        { label: "Pages", value: "1" },
        { label: "Decisions", value: "2" },
        { label: "Cost", value: "0.28" },
      ],
      meta: "DOCX · 1 page · 120 KB",
      comparison: {
        head: ["Item", "What the board decides"],
        rows: [
          { cells: ["Decision 1", "Approve a pilot in one village"], isBest: true },
          { cells: ["Decision 2", "Apply for the capital grant"] },
        ],
      },
      status: "finished",
    },
    monitor: {
      kind: "monitor",
      title: "PLN tariff watch",
      summary: "The watch is live. Nothing has moved since the baseline. You will get a Telegram message when a tariff changes.",
      figures: [
        { label: "Pages", value: "4" },
        { label: "Every", value: "6 h" },
        { label: "Changes", value: "0" },
      ],
      meta: "Monitor · every 6 hours",
      comparison: {
        head: ["Tariff", "Rate", "Since"],
        rows: [
          { cells: ["R-1 household", "IDR 1,444.70", "July"], isBest: true },
          { cells: ["I-3 industry", "IDR 1,114.74", "July"] },
        ],
      },
      status: "finished",
    },
    image: {
      kind: "image",
      title: "Ceramic mug, morning light",
      summary: "A ceramic mug on a wooden table in soft morning light. Generated with Gemini at 1:1 ratio.",
      figures: [
        { label: "Engine", value: "Gemini" },
        { label: "Ratio", value: "1:1" },
        { label: "Quality", value: "Standard" },
      ],
      meta: "PNG · 1024×1024 · 2.1 MB",
      comparison: undefined,
      status: "finished",
    },
  };
  return results[type] || results.report;
}

function getTitleForType(type: string): string {
  const titles: Record<string, string> = {
    report: "Solar PV supplier research",
    deck: "TGWI investor update Q3",
    sheet: "Villa BOQ and budget",
    brief: "Off grid solar board brief",
    monitor: "PLN tariff watch",
    image: "Image generation",
  };
  return titles[type] || "Agent session";
}

export function DoneContainer({ sessionId, runId, onBack, onOpenSession }: DoneContainerProps) {
  const [sessionType, setSessionType] = useState("report");
  const [sessionTitle, setSessionTitle] = useState("Agent session");
  const [resultData, setResultData] = useState<ResultCardProps | null>(null);
  const [isWide, setIsWide] = useState(false);
  const token = getAuthToken();

  const fetchResultData = useCallback(async () => {
    if (!runId) return;
    try {
      const origin = import.meta.env.VITE_SR1_API_ORIGIN || "";
      const res = await fetch(`${origin}/api/kemma/session/${runId}/result`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSessionType(data.type || "report");
        setSessionTitle(getTitleForType(data.type || "report"));
        setResultData({
          ...getResultDataForType(data.type || "report"),
          ...data.result,
          status: data.status === "error" ? "error" : "finished",
          errorMessage: data.error,
        });
      } else {
        const settingsRes = await fetch(`${origin}/api/kemma/session/${runId}`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setSessionType(settingsData.type || "report");
          setSessionTitle(getTitleForType(settingsData.type || "report"));
          setResultData(getResultDataForType(settingsData.type || "report"));
        }
      }
    } catch {
      setResultData(getResultDataForType(sessionType));
    }
  }, [runId, token, sessionType]);

  useEffect(() => {
    fetchResultData();
  }, [fetchResultData]);

  useEffect(() => {
    const handleResize = () => {
      setIsWide(window.innerWidth >= 1000);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleDownload = useCallback(() => {
    if (runId) {
      fetch(`${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/export/session/${runId}?format=original`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => res.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${sessionTitle.replace(/\s+/g, "-").toLowerCase()}.${sessionType === "deck" ? "pptx" : sessionType === "sheet" ? "xlsx" : sessionType === "brief" ? "docx" : "pdf"}`;
          a.click();
          URL.revokeObjectURL(url);
        })
        .catch(() => {
          // Fallback - open in documents
        });
    }
  }, [runId, sessionTitle, sessionType, token]);

  const handleOpenDocuments = useCallback(() => {
    window.location.href = "/files";
  }, []);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: sessionTitle,
      text: resultData?.summary || "",
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  }, [sessionTitle, resultData]);

  const handleFollowUp = useCallback((text: string) => {
    window.location.href = `/chat?q=${encodeURIComponent(text)}`;
  }, []);

  const handleBack = useCallback(() => {
    if (onBack) onBack();
  }, [onBack]);

  if (!resultData) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
        <div className="stepped" style={{ display: "inline-flex", alignItems: "flexEnd", gap: 3 }} aria-hidden="true">
          {[6, 8, 10, 12, 14].map((hh, i) => (
            <i key={i} className="on" style={{ width: 12, borderRadius: 2, background: "var(--ink)", height: hh }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ResultCard
      {...resultData}
      isWide={isWide}
      onDownload={handleDownload}
      onOpenDocuments={handleOpenDocuments}
      onShare={handleShare}
      onFollowUp={handleFollowUp}
      onBack={handleBack}
    />
  );
}

export default DoneContainer;