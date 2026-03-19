import { useState, useEffect, useRef } from "react";
import {
  ArrowRight, MessageSquare, FileText, Zap,
  TrendingUp, Search, Calendar, Settings,
  Bell, Check, BookOpen,
} from "lucide-react";

const F = "'Inter', system-ui, -apple-system, sans-serif";
const FD = "'DM Serif Display', 'Georgia', 'Times New Roman', serif";
const FM = "'SF Mono', 'Menlo', 'Consolas', monospace";

const LayoutDashboard = ({ style }: { style?: React.CSSProperties }) => (
  <svg style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>
  </svg>
);

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: MessageSquare, label: "Chat" },
  { icon: BookOpen, label: "Memories" },
  { icon: Zap, label: "Skills" },
  { icon: FileText, label: "Files" },
  { icon: Settings, label: "Settings" },
];

const CHART_POINTS = [18, 22, 15, 30, 28, 42, 38, 52, 45, 55, 62, 58, 70, 65, 60, 72, 68, 78, 82, 75, 88, 85, 92, 88, 95];
const CHART_PATH = CHART_POINTS.map((v, i) => {
  const x = (i / (CHART_POINTS.length - 1)) * 400;
  const y = 120 - (v / 100) * 110;
  return `${i === 0 ? "M" : "L"}${x},${y}`;
}).join(" ");
const CHART_PATH2 = CHART_POINTS.map((v, i) => {
  const x = (i / (CHART_POINTS.length - 1)) * 400;
  const y = 120 - ((v * 0.6 + 10) / 100) * 110;
  return `${i === 0 ? "M" : "L"}${x},${y}`;
}).join(" ");

const TASKS = [
  { text: "Review component designs", priority: "High" as const, done: false },
  { text: "Update identity card avatar", priority: "High" as const, done: false },
  { text: "Send procurement report", priority: "Med" as const, done: true },
  { text: "Prepare Q1 budget draft", priority: "Low" as const, done: false },
];

const TEAM = [
  { name: "Alice Chen", role: "Design Lead", initials: "AC", color: "#d4917a" },
  { name: "Marcus Webb", role: "Engineering", initials: "MW", color: "#7a9a7a" },
  { name: "Sarah Park", role: "Product", initials: "SP", color: "#A47764" },
  { name: "Dev Patel", role: "Research", initials: "DP", color: "#8a9cc7" },
];

const PRI: Record<string, { bg: string; text: string }> = {
  High: { bg: "#fce8e4", text: "#c0513f" },
  Med: { bg: "#fef3e2", text: "#c4820e" },
  Low: { bg: "#e6f2ea", text: "#4a8a5a" },
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.05)",
  border: "1px solid rgba(0,0,0,0.04)",
  transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.3s ease",
};

const cardHover: React.CSSProperties = {
  transform: "translateY(-4px)",
  boxShadow: "0 2px 4px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.08)",
};

const glassCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.65)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: 22,
  boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 8px 32px rgba(0,0,0,0.06)",
  border: "1px solid rgba(255,255,255,0.6)",
  transition: "transform 0.3s ease, box-shadow 0.3s ease",
};

const shineLight: React.CSSProperties = {
  position: "absolute",
  top: 0, left: 0, right: 0, bottom: 0,
  borderRadius: "inherit",
  pointerEvents: "none",
  background: "linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.15) 25%, transparent 50%, rgba(255,255,255,0.05) 80%, rgba(255,255,255,0.3) 100%)",
};

const shineStrong: React.CSSProperties = {
  position: "absolute",
  top: 0, left: 0, right: 0, bottom: 0,
  borderRadius: "inherit",
  pointerEvents: "none",
  background: "linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 25%, transparent 45%, rgba(255,255,255,0.04) 75%, rgba(255,255,255,0.18) 100%)",
};

const innerGlowLight: React.CSSProperties = {
  position: "absolute",
  top: 0, left: 0, right: 0, height: "45%",
  borderRadius: "inherit",
  pointerEvents: "none",
  background: "linear-gradient(180deg, rgba(255,255,255,0.5) 0%, transparent 100%)",
};

const innerGlowStrong: React.CSSProperties = {
  position: "absolute",
  top: 0, left: 0, right: 0, height: "50%",
  borderRadius: "inherit",
  pointerEvents: "none",
  background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)",
};

const edgeHighlight: React.CSSProperties = {
  position: "absolute",
  top: 0, left: 0, right: 0, height: 1,
  borderRadius: "inherit",
  pointerEvents: "none",
  background: "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.8) 50%, transparent 90%)",
};

function HoverCard({ children, style, delay = 0 }: { children: React.ReactNode; style: React.CSSProperties; delay?: number }) {
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      setTimeout(() => setVisible(true), delay);
    });
    return () => cancelAnimationFrame(t);
  }, [delay]);

  return (
    <div
      style={{
        ...style,
        ...(hovered ? cardHover : {}),
        opacity: visible ? 1 : 0,
        transform: visible ? (hovered ? "translateY(-4px)" : "translateY(0)") : "translateY(16px)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </div>
  );
}

const CSS_ANIM = `
@keyframes bgShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes logoPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(232,145,58,0); }
  50% { box-shadow: 0 0 16px 4px rgba(232,145,58,0.35); }
}
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

export default function Dashboard() {
  const [period, setPeriod] = useState<string>("6Mo");
  const [chartHover, setChartHover] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);

  const handleChartMouse = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = chartRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(x * (CHART_POINTS.length - 1));
    if (idx >= 0 && idx < CHART_POINTS.length) setChartHover(idx);
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      background: "linear-gradient(165deg, #f5efe7, #ecdfc9, #e2d4c0, #d9cbb8, #e4d8c6, #f0e8dc)",
      backgroundSize: "300% 300%",
      animation: "bgShift 20s ease-in-out infinite",
      fontFamily: F,
      position: "relative",
    }}>
      <style>{CSS_ANIM}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        opacity: 0.035,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat",
        backgroundSize: "256px 256px",
      }} />

      <div style={{
        width: 72, flexShrink: 0, display: "flex", flexDirection: "column",
        alignItems: "center", padding: "24px 0", gap: 4,
        background: "linear-gradient(180deg, #A47764 0%, #8f6654 100%)",
        position: "relative", overflow: "hidden", zIndex: 1,
      }}>
        <div style={innerGlowStrong} />
        <div style={{
          width: 44, height: 44, borderRadius: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.18)", marginBottom: 24,
          position: "relative",
          animation: "logoPulse 3s ease-in-out infinite",
        }}>
          <span style={{ color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>S</span>
        </div>
        {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
          <div key={label} style={{
            width: 44, height: 44, borderRadius: 13,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            background: active ? "rgba(255,255,255,0.2)" : "transparent",
            transition: "all 0.25s ease",
            position: "relative",
          }} title={label}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
          >
            <Icon style={{ color: active ? "#fff" : "rgba(255,255,255,0.45)", width: 20, height: 20, transition: "color 0.2s" }} />
          </div>
        ))}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, position: "relative" }}>
          <div style={{ position: "relative", width: 44, height: 44, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <Bell style={{ color: "rgba(255,255,255,0.45)", width: 20, height: 20 }} />
            <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "#e8913a", border: "2px solid #A47764" }} />
          </div>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.1))",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "transform 0.2s",
          }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.08)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
          >
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>Y</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "32px 36px", overflowY: "auto", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, animation: "fadeSlideIn 0.6s ease-out both" }}>
            <div>
              <h1 style={{
                fontFamily: FD,
                color: "#1e150d", fontWeight: 400, fontSize: 64,
                letterSpacing: "-0.02em", lineHeight: 1, margin: 0,
              }}>Dashboard</h1>
              <p style={{
                color: "#a39080", fontWeight: 500, fontSize: 15, marginTop: 10,
                letterSpacing: "0.01em",
              }}>Good afternoon — March 17, 2026</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <div style={{
                ...glassCard,
                borderRadius: 14, padding: "10px 16px",
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
              >
                <Search style={{ color: "#b8a898", width: 16, height: 16 }} />
                <span style={{ color: "#b8a898", fontSize: 14, fontWeight: 500 }}>Search…</span>
                <kbd style={{
                  fontFamily: FM, color: "#c5b8aa", fontSize: 11, fontWeight: 600,
                  background: "rgba(0,0,0,0.04)", padding: "2px 7px", borderRadius: 5, marginLeft: 12,
                }}>⌘K</kbd>
              </div>
              <div style={{
                ...glassCard,
                borderRadius: 14, width: 44, height: 44,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
              >
                <Calendar style={{ color: "#a39080", width: 18, height: 18 }} />
              </div>
            </div>
          </div>

          <div style={{
            display: "flex", gap: 48, padding: "20px 0 28px",
            borderBottom: "1px solid rgba(0,0,0,0.05)", marginBottom: 28,
            animation: "fadeSlideIn 0.6s ease-out 0.1s both",
          }}>
            {[
              { label: "Skills", value: "24", sub: "+3 this week" },
              { label: "Memories", value: "147", sub: "+12 new" },
              { label: "Files", value: "38", sub: "2.4 GB" },
              { label: "Connections", value: "6", sub: "3 active" },
            ].map(({ label, value, sub }) => (
              <div key={label}>
                <p style={{ color: "#a39080", fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", margin: "0 0 6px" }}>{label}</p>
                <p style={{ color: "#1e150d", fontWeight: 800, fontSize: 42, lineHeight: 1, letterSpacing: "-0.04em", margin: 0 }}>{value}</p>
                <p style={{ color: "#c4b5a4", fontSize: 12, fontWeight: 500, margin: "6px 0 0" }}>{sub}</p>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 340px", gap: 20, marginBottom: 20 }}>

            <HoverCard delay={150} style={{
              ...card,
              background: "linear-gradient(160deg, #1e1812 0%, #2a2018 50%, #1a1410 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "28px 28px 20px",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={shineStrong} />
              <div style={edgeHighlight} />
              <div style={{
                position: "absolute", top: 0, right: 0, width: 220, height: 220,
                background: "radial-gradient(circle at 80% 15%, rgba(232,145,58,0.15) 0%, transparent 65%)",
                pointerEvents: "none",
              }} />
              <div style={{
                position: "absolute", bottom: 0, left: 0, width: 180, height: 120,
                background: "radial-gradient(circle at 20% 90%, rgba(164,119,100,0.1) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />
              <p style={{
                color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: 700, marginBottom: 20,
                position: "relative",
              }}>Growth Analytics</p>
              <div style={{ position: "relative", height: 130, marginBottom: 8 }}>
                <svg
                  ref={chartRef}
                  width="100%" height="100%" viewBox="0 0 400 130" preserveAspectRatio="none"
                  onMouseMove={handleChartMouse}
                  onMouseLeave={() => setChartHover(null)}
                  style={{ cursor: "crosshair" }}
                >
                  {[0, 1, 2, 3].map(i => (
                    <line key={i} x1="0" y1={10 + i * 35} x2="400" y2={10 + i * 35} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  ))}
                  <defs>
                    <linearGradient id="darkChartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e8913a" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#e8913a" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#c4820e" />
                      <stop offset="50%" stopColor="#e8913a" />
                      <stop offset="100%" stopColor="#f0a050" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  <path d={`${CHART_PATH} L400,130 L0,130 Z`} fill="url(#darkChartGrad)" />
                  <path d={CHART_PATH2} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" strokeDasharray="4 3" />
                  <path d={CHART_PATH} fill="none" stroke="url(#lineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
                  {chartHover !== null && (() => {
                    const hx = (chartHover / (CHART_POINTS.length - 1)) * 400;
                    const hy = 120 - (CHART_POINTS[chartHover] / 100) * 110;
                    return <>
                      <line x1={hx} y1="0" x2={hx} y2="130" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3 3" />
                      <circle cx={hx} cy={hy} r="6" fill="#e8913a" stroke="#fff" strokeWidth="2" />
                      <circle cx={hx} cy={hy} r="12" fill="none" stroke="rgba(232,145,58,0.3)" strokeWidth="1" />
                    </>;
                  })()}
                  <circle cx={`${(20 / 24) * 400}`} cy={`${120 - (88 / 100) * 110}`} r="5" fill="#e8913a" stroke="#1e1812" strokeWidth="3" />
                  <circle cx={`${(20 / 24) * 400}`} cy={`${120 - (88 / 100) * 110}`} r="10" fill="none" stroke="rgba(232,145,58,0.3)" strokeWidth="1" />
                </svg>
                {chartHover !== null && (() => {
                  const hx = (chartHover / (CHART_POINTS.length - 1)) * 100;
                  const hy = ((120 - (CHART_POINTS[chartHover] / 100) * 110) / 130) * 100;
                  return (
                    <div style={{
                      position: "absolute",
                      left: `${Math.min(Math.max(hx, 10), 85)}%`,
                      top: `${Math.max(hy - 28, 0)}%`,
                      background: "rgba(30,24,18,0.9)",
                      border: "1px solid rgba(232,145,58,0.5)",
                      backdropFilter: "blur(12px)",
                      borderRadius: 10, padding: "6px 12px",
                      color: "#f0a050", fontSize: 12, fontWeight: 700,
                      whiteSpace: "nowrap",
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                    }}>
                      {CHART_POINTS[chartHover]}%
                    </div>
                  );
                })()}
                {chartHover === null && (
                  <div style={{
                    position: "absolute",
                    left: `${(10 / 24) * 100}%`,
                    top: `${((120 - (62 / 100) * 110) / 130) * 100 - 18}%`,
                    background: "rgba(232,145,58,0.2)",
                    border: "1px solid rgba(232,145,58,0.4)",
                    backdropFilter: "blur(8px)",
                    borderRadius: 8, padding: "4px 10px",
                    color: "#f0a050", fontSize: 11, fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}>
                    ↑ 12 cm/day
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map(m => (
                  <span key={m} style={{ color: m === "Mar" ? "#f0a050" : "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 600 }}>{m}</span>
                ))}
              </div>
            </HoverCard>

            <HoverCard delay={250} style={{ ...card, padding: "28px", position: "relative", overflow: "hidden" }}>
              <div style={shineLight} />
              <div style={innerGlowLight} />
              <div style={edgeHighlight} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, position: "relative" }}>
                <h2 style={{ color: "#1e150d", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", margin: 0 }}>Critical Alerts</h2>
              </div>
              {[
                { label: "Memory System", sub: "Optimal sync", status: "ok", iconBg: "linear-gradient(135deg, #e8f0e8, #d4e8d4)", iconColor: "#5a8a5a" },
                { label: "Storage #3", sub: "Low capacity", status: "warn", iconBg: "linear-gradient(135deg, #fef3e2, #fce8d0)", iconColor: "#d4820e" },
                { label: "Connection #7", sub: "Latency normal", status: "ok", iconBg: "linear-gradient(135deg, #eceef7, #dde0f2)", iconColor: "#7a8ac7" },
              ].map((alert, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 0",
                  borderBottom: i < 2 ? "1px solid rgba(0,0,0,0.04)" : "none",
                  transition: "background 0.2s",
                  borderRadius: 12,
                  cursor: "pointer",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.015)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{
                    width: 46, height: 46, borderRadius: 14,
                    background: alert.iconBg,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: `${alert.iconColor}22`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: alert.iconColor }} />
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: "#1e150d", fontWeight: 700, fontSize: 15, margin: 0 }}>{alert.label}</p>
                    <p style={{ color: "#b0a090", fontSize: 13, fontWeight: 500, margin: "2px 0 0" }}>{alert.sub}</p>
                  </div>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: alert.status === "ok" ? "#e6f2ea" : "#fef3e2",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {alert.status === "ok" ? (
                      <Check style={{ width: 15, height: 15, color: "#5a8a5a", strokeWidth: 2.5 }} />
                    ) : (
                      <span style={{ color: "#d4820e", fontSize: 16, fontWeight: 700, lineHeight: 1 }}>!</span>
                    )}
                  </div>
                </div>
              ))}
            </HoverCard>

            <HoverCard delay={350} style={{ ...card, padding: "28px", position: "relative", overflow: "hidden" }}>
              <div style={shineLight} />
              <div style={innerGlowLight} />
              <div style={edgeHighlight} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, position: "relative" }}>
                <h2 style={{ color: "#1e150d", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", margin: 0 }}>Activity</h2>
                <span style={{ color: "#b0a090", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Details</span>
              </div>
              <div style={{
                display: "flex", gap: 2, marginBottom: 20,
                background: "rgba(0,0,0,0.03)", borderRadius: 12, padding: 3,
              }}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <div key={d} style={{
                    flex: 1, textAlign: "center" as const, padding: "8px 0", borderRadius: 10,
                    background: d === "Fri" ? "#A47764" : "transparent",
                    color: d === "Fri" ? "#fff" : "#b0a090",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                    onMouseEnter={(e) => { if (d !== "Fri") { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; e.currentTarget.style.color = "#8a7a6a"; }}}
                    onMouseLeave={(e) => { if (d !== "Fri") { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#b0a090"; }}}
                  >{d}</div>
                ))}
              </div>
              <div style={{ position: "relative", height: 80, marginBottom: 20 }}>
                <svg width="100%" height="100%" viewBox="0 0 300 80" preserveAspectRatio="none">
                  <path d="M0,70 Q30,65 60,55 T120,40 T180,25 T220,30 T260,20 T300,35" fill="none" stroke="#1e150d" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="220" cy="30" r="4" fill="#1e150d" />
                </svg>
                <div style={{
                  position: "absolute", left: "72%", top: "-4px",
                  background: "#fff", borderRadius: 8, padding: "4px 10px",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.1)", border: "1px solid rgba(0,0,0,0.06)",
                  fontSize: 11, fontWeight: 700, color: "#1e150d", whiteSpace: "nowrap",
                }}>
                  Watering
                </div>
              </div>
              {[
                { text: "Memory sync complete", time: "10:30–11:00", status: "Scheduled", statusColor: "#A47764", statusBg: "#f0e8e0" },
                { text: "Skills refresh", time: "11:30–12:00", status: "Done", statusColor: "#5a8a5a", statusBg: "#e6f2ea" },
                { text: "File indexing", time: "18:00–18:30", status: "In Progress", statusColor: "#e8913a", statusBg: "#fef3e2" },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 0",
                  borderBottom: i < 2 ? "1px solid rgba(0,0,0,0.04)" : "none",
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: item.statusColor, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ color: "#1e150d", fontWeight: 600, fontSize: 14, margin: 0 }}>{item.text}</p>
                    <p style={{ color: "#c4b5a4", fontSize: 12, fontWeight: 500, margin: 0 }}>{item.time}</p>
                  </div>
                  <span style={{
                    padding: "3px 10px", borderRadius: 8,
                    background: item.statusBg, color: item.statusColor,
                    fontSize: 11, fontWeight: 700,
                  }}>{item.status}</span>
                </div>
              ))}
            </HoverCard>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "340px 1fr 1fr", gap: 20, marginBottom: 20 }}>

            <HoverCard delay={300} style={{
              ...card,
              background: "linear-gradient(160deg, #b8866f 0%, #A47764 40%, #926a56 100%)",
              border: "1px solid rgba(255,255,255,0.15)",
              boxShadow: "0 4px 20px rgba(164,119,100,0.35), 0 1px 3px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.15)",
              padding: "28px",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={shineStrong} />
              <div style={innerGlowStrong} />
              <div style={edgeHighlight} />
              <div style={{
                position: "absolute", top: -30, right: -30, width: 180, height: 180,
                background: "radial-gradient(circle, rgba(232,145,58,0.25) 0%, transparent 65%)",
                pointerEvents: "none",
              }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, position: "relative" }}>
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 700, fontFamily: FM, letterSpacing: "0.1em", textTransform: "uppercase" }}>Performance</span>
                <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600 }}>This month</span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 24, position: "relative", gap: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700 }}>0%</span>
                <div style={{ position: "relative", width: 175, height: 175 }}>
                  <svg width="175" height="175" viewBox="0 0 175 175" style={{ filter: "drop-shadow(0 0 12px rgba(232,145,58,0.25))" }}>
                    <defs>
                      <linearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#f0a050" />
                        <stop offset="40%" stopColor="#e8913a" />
                        <stop offset="100%" stopColor="#d47828" />
                      </linearGradient>
                      <filter id="ringGlow2">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                      <linearGradient id="trackGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
                      </linearGradient>
                    </defs>
                    {Array.from({ length: 36 }).map((_, i) => {
                      const angle = (i / 36) * 2 * Math.PI - Math.PI / 2;
                      const cx = 87.5 + Math.cos(angle) * 80;
                      const cy = 87.5 + Math.sin(angle) * 80;
                      const isActive = i / 36 < 0.94;
                      return <circle key={i} cx={cx} cy={cy} r={1.5} fill={isActive ? "rgba(232,145,58,0.4)" : "rgba(255,255,255,0.08)"} />;
                    })}
                    <circle cx="87.5" cy="87.5" r="68" fill="none" stroke="url(#trackGrad)" strokeWidth="11" />
                    <circle cx="87.5" cy="87.5" r="68" fill="none" stroke="url(#ringGradient)" strokeWidth="11"
                      strokeDasharray={`${2 * Math.PI * 68 * 0.94} ${2 * Math.PI * 68}`}
                      strokeLinecap="round" transform="rotate(-90 87.5 87.5)" filter="url(#ringGlow2)" />
                    <circle cx="87.5" cy="87.5" r="56" fill="rgba(0,0,0,0.08)" />
                    <circle cx="87.5" cy="87.5" r="55" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                    {(() => {
                      const endAngle = -Math.PI / 2 + 2 * Math.PI * 0.94;
                      const ex = 87.5 + Math.cos(endAngle) * 68;
                      const ey = 87.5 + Math.sin(endAngle) * 68;
                      return <>
                        <circle cx={ex} cy={ey} r="7" fill="#e8913a" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                        <circle cx={ex} cy={ey} r="12" fill="none" stroke="rgba(232,145,58,0.2)" strokeWidth="1" />
                      </>;
                    })()}
                  </svg>
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 52, fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: "-0.04em", textShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>94</span>
                    <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 600, marginTop: 4 }}>Accuracy %</span>
                  </div>
                </div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700 }}>100%</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, position: "relative" }}>
                {[
                  { label: "Response", value: "1.2s", dot: "#e8913a" },
                  { label: "Sessions", value: "12", dot: "#7abe8e" },
                  { label: "Resolved", value: "89%", dot: "#8a9cc7" },
                  { label: "Active", value: "8", dot: "#d4917a" },
                ].map(({ label, value, dot }) => (
                  <div key={label} style={{
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: 14, padding: "14px 16px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    transition: "background 0.2s, border-color 0.2s",
                    cursor: "default",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.16)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  >
                    <p style={{ fontSize: 24, fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: "-0.02em", margin: 0 }}>{value}</p>
                    <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 600, margin: "6px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, display: "inline-block", boxShadow: `0 0 4px ${dot}88` }} />
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </HoverCard>

            <HoverCard delay={350} style={{ ...card, padding: "28px", position: "relative", overflow: "hidden" }}>
              <div style={shineLight} />
              <div style={innerGlowLight} />
              <div style={edgeHighlight} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, position: "relative" }}>
                <h2 style={{ color: "#1e150d", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", margin: 0 }}>Tasks</h2>
                <span style={{ color: "#b0a090", fontSize: 13, fontWeight: 500 }}>Today</span>
              </div>
              {TASKS.map((task, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "13px 4px",
                  borderBottom: i < TASKS.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
                  borderRadius: 10,
                  transition: "background 0.2s",
                  cursor: "pointer",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.015)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 7,
                    border: `2px solid ${task.done ? "#7a9a7a" : "#d8d0c4"}`,
                    background: task.done ? "#7a9a7a" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", flexShrink: 0,
                    transition: "all 0.2s",
                  }}>
                    {task.done && <Check style={{ width: 12, height: 12, color: "#fff", strokeWidth: 3 }} />}
                  </div>
                  <span style={{
                    flex: 1, color: task.done ? "#c4b5a4" : "#3a2e22",
                    textDecoration: task.done ? "line-through" : "none",
                    fontSize: 14, fontWeight: 550,
                  }}>{task.text}</span>
                  <span style={{
                    padding: "3px 10px", borderRadius: 8,
                    background: PRI[task.priority].bg, color: PRI[task.priority].text,
                    fontSize: 11, fontWeight: 700,
                  }}>{task.priority}</span>
                </div>
              ))}
              <button style={{
                display: "flex", alignItems: "center", gap: 6, marginTop: 16,
                color: "#A47764", fontSize: 13, fontWeight: 700,
                background: "none", border: "none", cursor: "pointer", padding: 0,
                transition: "gap 0.2s, color 0.2s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.gap = "10px"; e.currentTarget.style.color = "#8f6654"; }}
                onMouseLeave={(e) => { e.currentTarget.style.gap = "6px"; e.currentTarget.style.color = "#A47764"; }}
              >
                View all tasks <ArrowRight style={{ width: 14, height: 14 }} />
              </button>
            </HoverCard>

            <HoverCard delay={400} style={{ ...card, padding: "28px", position: "relative", overflow: "hidden" }}>
              <div style={shineLight} />
              <div style={innerGlowLight} />
              <div style={edgeHighlight} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, position: "relative" }}>
                <h2 style={{ color: "#1e150d", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", margin: 0 }}>Team</h2>
              </div>
              {TEAM.map((t, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 4px",
                  borderBottom: i < TEAM.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
                  borderRadius: 12, cursor: "pointer",
                  transition: "background 0.2s",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.015)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{
                    width: 42, height: 42, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${t.color}, ${t.color}cc)`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    boxShadow: `0 2px 8px ${t.color}44`,
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}>
                    <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{t.initials}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: "#1e150d", fontSize: 14, fontWeight: 700, margin: 0 }}>{t.name}</p>
                    <p style={{ color: "#b0a090", fontSize: 12, fontWeight: 500, margin: 0 }}>{t.role}</p>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7abe8e", boxShadow: "0 0 6px rgba(122,190,142,0.5)" }} />
                </div>
              ))}
            </HoverCard>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <HoverCard delay={450} style={{
              ...glassCard,
              padding: "24px 28px",
              display: "flex", alignItems: "center", gap: 24,
            }}>
              {[
                { label: "Active Skills", value: "8", color: "#7a9a7a", bg: "linear-gradient(135deg, #e8f0e8, #d8ead8)" },
                { label: "Avg Response", value: "1.2s", color: "#e8913a", bg: "linear-gradient(135deg, #fef3e2, #fce8d0)" },
                { label: "Memory Score", value: "94%", color: "#8a9cc7", bg: "linear-gradient(135deg, #eceef7, #dde0f2)" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 14,
                    background: bg,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                  </div>
                  <div>
                    <p style={{ color: "#1e150d", fontWeight: 800, fontSize: 24, lineHeight: 1, letterSpacing: "-0.03em", margin: 0 }}>{value}</p>
                    <p style={{ color: "#b0a090", fontSize: 11, fontWeight: 600, margin: "2px 0 0" }}>{label}</p>
                  </div>
                </div>
              ))}
            </HoverCard>

            <HoverCard delay={500} style={{
              borderRadius: 22, padding: "22px 28px",
              background: "linear-gradient(135deg, #e8913a 0%, #d4802e 100%)",
              boxShadow: "0 4px 20px rgba(232,145,58,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", gap: 20,
              position: "relative", overflow: "hidden",
              transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.3s ease",
            }}>
              <div style={shineStrong} />
              <div style={innerGlowStrong} />
              <div style={edgeHighlight} />
              <div style={{
                width: 48, height: 48, borderRadius: 16,
                background: "rgba(255,255,255,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                position: "relative",
              }}>
                <Zap style={{ color: "#fff", width: 22, height: 22 }} />
              </div>
              <div style={{ flex: 1, position: "relative" }}>
                <p style={{ color: "#fff", fontWeight: 800, fontSize: 17, margin: 0 }}>Upgrade to Pro</p>
                <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 500, margin: 0 }}>Unlock unlimited S1 access</p>
              </div>
              <button style={{
                background: "#fff", color: "#c97a2e", fontSize: 14, fontWeight: 800,
                border: "none", borderRadius: 12, padding: "10px 24px", cursor: "pointer",
                boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                position: "relative",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)"; }}
              >
                Get Started
              </button>
            </HoverCard>
          </div>

          <HoverCard delay={550} style={{ ...card, padding: "24px 28px", position: "relative", overflow: "hidden" }}>
            <div style={shineLight} />
            <div style={innerGlowLight} />
            <div style={edgeHighlight} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, position: "relative" }}>
              <h2 style={{ color: "#1e150d", fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em", margin: 0 }}>Active Status</h2>
              <span style={{ color: "#A47764", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "color 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.color = "#8f6654"}
                onMouseLeave={(e) => e.currentTarget.style.color = "#A47764"}
              >Explore all</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["N°", "Health", "Memory (%)", "Response", "Accuracy (%)", ""].map((h, i) => (
                    <th key={i} style={{
                      color: "#b0a090", fontSize: 11, fontWeight: 700,
                      letterSpacing: "0.05em", textTransform: "uppercase" as const,
                      padding: "0 0 14px", textAlign: "left" as const,
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      width: i === 0 ? 60 : i === 5 ? 90 : undefined,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { id: "N°1", health: 96, hc: "#5a8a5a", mem: "82%", resp: "1.1s", acc: "97%" },
                  { id: "N°2", health: 78, hc: "#d4820e", mem: "68%", resp: "1.4s", acc: "89%" },
                ].map((row, ri) => (
                  <tr key={ri} style={{ transition: "background 0.2s", cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.015)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "16px 0", borderBottom: ri === 0 ? "1px solid rgba(0,0,0,0.04)" : "none", color: "#1e150d", fontWeight: 700, fontSize: 14 }}>{row.id}</td>
                    <td style={{ padding: "16px 0", borderBottom: ri === 0 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <svg width="40" height="40" viewBox="0 0 40 40" style={{ filter: `drop-shadow(0 0 4px ${row.hc}44)` }}>
                          <defs>
                            <linearGradient id={`hg${ri}`} x1="0" y1="0" x2="1" y2="1">
                              <stop offset="0%" stopColor={row.hc} stopOpacity="1" />
                              <stop offset="100%" stopColor={row.hc} stopOpacity="0.6" />
                            </linearGradient>
                          </defs>
                          {Array.from({ length: 20 }).map((_, di) => {
                            const a = (di / 20) * 2 * Math.PI - Math.PI / 2;
                            const dx = 20 + Math.cos(a) * 18;
                            const dy = 20 + Math.sin(a) * 18;
                            return <circle key={di} cx={dx} cy={dy} r={0.8} fill={di / 20 < row.health / 100 ? `${row.hc}66` : "rgba(0,0,0,0.05)"} />;
                          })}
                          <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="3.5" />
                          <circle cx="20" cy="20" r="14" fill="none" stroke={`url(#hg${ri})`} strokeWidth="3.5"
                            strokeDasharray={`${2 * Math.PI * 14 * (row.health / 100)} ${2 * Math.PI * 14}`}
                            strokeLinecap="round" transform="rotate(-90 20 20)" />
                          {(() => {
                            const ea = -Math.PI / 2 + 2 * Math.PI * (row.health / 100);
                            return <circle cx={20 + Math.cos(ea) * 14} cy={20 + Math.sin(ea) * 14} r="3" fill={row.hc} stroke="#fff" strokeWidth="1.5" />;
                          })()}
                        </svg>
                        <span style={{ color: "#1e150d", fontWeight: 700, fontSize: 14 }}>{row.health}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "16px 0", borderBottom: ri === 0 ? "1px solid rgba(0,0,0,0.04)" : "none", color: "#1e150d", fontWeight: 600, fontSize: 14 }}>{row.mem}</td>
                    <td style={{ padding: "16px 0", borderBottom: ri === 0 ? "1px solid rgba(0,0,0,0.04)" : "none", color: "#1e150d", fontWeight: 600, fontSize: 14 }}>{row.resp}</td>
                    <td style={{ padding: "16px 0", borderBottom: ri === 0 ? "1px solid rgba(0,0,0,0.04)" : "none", color: "#1e150d", fontWeight: 600, fontSize: 14 }}>{row.acc}</td>
                    <td style={{ padding: "16px 0", borderBottom: ri === 0 ? "1px solid rgba(0,0,0,0.04)" : "none", textAlign: "right" as const }}>
                      <button style={{
                        padding: "7px 18px", borderRadius: 10,
                        background: "linear-gradient(135deg, #A47764, #926a56)",
                        color: "#fff", fontSize: 12, fontWeight: 700,
                        border: "none", cursor: "pointer",
                        boxShadow: "0 2px 6px rgba(164,119,100,0.3)",
                        transition: "transform 0.2s, box-shadow 0.2s",
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(164,119,100,0.4)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 6px rgba(164,119,100,0.3)"; }}
                      >Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </HoverCard>

        </div>
      </div>
    </div>
  );
}
