import { useState, useEffect } from "react";
import {
  ArrowRight, Zap, Shield, BarChart3, Sparkles,
  Users, Globe, Star, ChevronRight, Play, Check,
} from "lucide-react";
import { useLocation } from "wouter";

const F = "'Inter', system-ui, -apple-system, sans-serif";
const FD = "'DM Serif Display', 'Georgia', 'Times New Roman', serif";
const FP = "'Playfair Display', 'Georgia', serif";
const FM = "'SF Mono', 'Menlo', 'Consolas', monospace";

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
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes floatY {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes orbitRing {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes typewriter {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
`;

const FEATURES = [
  { icon: Zap, title: "Lightning Fast", desc: "Sub-second response times powered by edge computing and intelligent caching.", accent: "#e8913a" },
  { icon: Shield, title: "Enterprise Security", desc: "End-to-end encryption, SOC 2 compliant, with zero-knowledge architecture.", accent: "#7a9a7a" },
  { icon: BarChart3, title: "Deep Analytics", desc: "Real-time dashboards with custom metrics, anomaly detection, and forecasting.", accent: "#8a9cc7" },
  { icon: Sparkles, title: "AI-Native", desc: "Built-in machine learning pipelines that adapt and improve continuously.", accent: "#d4917a" },
  { icon: Users, title: "Team Collaboration", desc: "Multiplayer workspaces with role-based access and live presence indicators.", accent: "#A47764" },
  { icon: Globe, title: "Global Scale", desc: "Deployed across 40+ regions with automatic failover and load balancing.", accent: "#b8866f" },
];

const TESTIMONIALS = [
  { name: "Elena Vasquez", role: "CTO, Meridian Labs", quote: "Sutaeru transformed how we think about infrastructure. It's not just a tool — it's a philosophy.", initials: "EV", color: "#d4917a" },
  { name: "James Okafor", role: "VP Engineering, Helix", quote: "We reduced our deployment time by 94%. The team hasn't looked back since.", initials: "JO", color: "#7a9a7a" },
  { name: "Mika Tanaka", role: "Founder, Noctis AI", quote: "The attention to detail is extraordinary. Every interaction feels intentional and considered.", initials: "MT", color: "#8a9cc7" },
];

const STATS = [
  { value: "99.99%", label: "Uptime SLA" },
  { value: "2.4M", label: "API Calls / Day" },
  { value: "<80ms", label: "Avg Latency" },
  { value: "147", label: "Countries" },
];

const PLANS = [
  { name: "Starter", price: "0", desc: "For individuals exploring the platform", features: ["5 Projects", "1GB Storage", "Community Support", "Basic Analytics"], cta: "Get Started", popular: false },
  { name: "Pro", price: "29", desc: "For teams building at scale", features: ["Unlimited Projects", "50GB Storage", "Priority Support", "Advanced Analytics", "Custom Domains", "Team Collaboration"], cta: "Start Free Trial", popular: true },
  { name: "Enterprise", price: "Custom", desc: "For organizations with unique needs", features: ["Everything in Pro", "Unlimited Storage", "Dedicated Support", "Custom Integrations", "SLA Guarantee", "On-premise Option"], cta: "Contact Sales", popular: false },
];

export function LandingPage() {
  const [navHover, setNavHover] = useState<string | null>(null);
  const [, navigate] = useLocation();

  // Fix for iOS Safari viewport height issue
  useEffect(() => {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVH();
    window.addEventListener('resize', setVH);
    return () => window.removeEventListener('resize', setVH);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      minHeight: "calc(var(--vh, 1vh) * 100)",
      background: "linear-gradient(165deg, #f5efe7, #ecdfc9, #e2d4c0, #d9cbb8, #e4d8c6, #f0e8dc)",
      backgroundSize: "300% 300%",
      animation: "bgShift 20s ease-in-out infinite",
      fontFamily: F,
      position: "relative",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch",
    }}>
      <style>{CSS_ANIM}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet" />

      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 0,
        opacity: 0.02,
        backgroundColor: "#f5efe7",
      }} />

      <nav style={{
        position: "relative", zIndex: 50,
        padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(245,239,231,0.9)",
        borderBottom: "1px solid rgba(0,0,0,0.04)",
        animation: "fadeIn 0.8s ease-out both",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "linear-gradient(135deg, #A47764, #926a56)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(164,119,100,0.3)",
          }}>
            <span style={{ color: "#fff", fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>S</span>
          </div>
          <span style={{ fontFamily: FD, fontSize: 22, color: "#1e150d", fontWeight: 400, letterSpacing: "-0.01em" }}>Sutaeru</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {["Product", "Features", "Pricing", "Company"].map(item => (
            <span
              key={item}
              style={{
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                color: navHover === item ? "#1e150d" : "#a39080",
                transition: "color 0.2s",
                position: "relative",
              }}
              onMouseEnter={() => setNavHover(item)}
              onMouseLeave={() => setNavHover(null)}
            >
              {item}
              {navHover === item && <div style={{
                position: "absolute", bottom: -4, left: 0, right: 0, height: 2,
                background: "#A47764", borderRadius: 1,
              }} />}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button 
            onClick={() => navigate('/login')}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600, color: "#A47764", padding: "8px 16px",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#8f6654"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#A47764"}
          >Sign in</button>
          <button 
            onClick={() => navigate('/login')}
            style={{
              background: "linear-gradient(135deg, #A47764, #926a56)",
              color: "#fff", border: "none", borderRadius: 12, padding: "10px 24px",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(164,119,100,0.3)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(164,119,100,0.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(164,119,100,0.3)"; }}
          >Get Started</button>
        </div>
      </nav>

      <section style={{
        textAlign: "center", padding: "60px 20px 40px",
        maxWidth: 900, width: "100%", margin: "0 auto",
        position: "relative", zIndex: 1,
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(232,145,58,0.1)", border: "1px solid rgba(232,145,58,0.2)",
          borderRadius: 100, padding: "6px 18px 6px 10px",
          marginBottom: 32,
          animation: "fadeSlideIn 0.6s ease-out both",
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "linear-gradient(135deg, #e8913a, #d4802e)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Sparkles style={{ width: 12, height: 12, color: "#fff" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#c97a2e", letterSpacing: "0.02em" }}>Introducing Sutaeru v3.0</span>
        </div>

        <h1 style={{
          fontFamily: FP,
          fontSize: "clamp(42px, 10vw, 82px)",
          fontWeight: 700,
          color: "#1e150d",
          lineHeight: 1.02,
          letterSpacing: "-0.035em",
          margin: "0 0 8px",
          animation: "fadeSlideIn 0.8s ease-out 0.15s both",
        }}>
          Build <em style={{ fontStyle: "italic", fontWeight: 500, color: "#A47764" }}>beautiful</em>
          <br />
          things, effortlessly
        </h1>

        <p style={{
          fontFamily: FP,
          fontSize: 18,
          fontWeight: 400,
          fontStyle: "italic",
          color: "#b0a090",
          letterSpacing: "0.02em",
          margin: "0 0 24px",
          animation: "fadeSlideIn 0.8s ease-out 0.3s both",
        }}>
          — where craft meets intelligence —
        </p>

        <p style={{
          fontSize: 18,
          lineHeight: 1.7,
          color: "#8a7a6a",
          fontWeight: 450,
          maxWidth: 560,
          margin: "0 auto 44px",
          animation: "fadeSlideIn 0.8s ease-out 0.4s both",
        }}>
          The platform that understands your intent. Sutaeru combines
          AI-native architecture with exquisite design to create software
          that feels alive.
        </p>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
          animation: "fadeSlideIn 0.8s ease-out 0.55s both",
        }}>
          <button 
            onClick={() => navigate('/login')}
            style={{
              background: "linear-gradient(135deg, #1e1812, #2a2018)",
              color: "#fff", border: "none", borderRadius: 14, padding: "16px 36px",
              fontSize: 16, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 4px 20px rgba(30,24,18,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
              display: "flex", alignItems: "center", gap: 10,
              transition: "transform 0.2s, box-shadow 0.2s",
              position: "relative", overflow: "hidden",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.04)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(30,24,18,0.4), inset 0 1px 0 rgba(255,255,255,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(30,24,18,0.3), inset 0 1px 0 rgba(255,255,255,0.1)"; }}
          >
            Start Building <ArrowRight style={{ width: 18, height: 18 }} />
          </button>
          <button style={{
            background: "rgba(255,255,255,0.6)",
            backdropFilter: "blur(12px)",
            color: "#1e150d", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: "16px 32px",
            fontSize: 16, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            transition: "transform 0.2s, background 0.2s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.background = "rgba(255,255,255,0.85)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.background = "rgba(255,255,255,0.6)"; }}
          >
            <Play style={{ width: 16, height: 16, fill: "#A47764", color: "#A47764" }} /> Watch Demo
          </button>
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginTop: 28,
          animation: "fadeSlideIn 0.8s ease-out 0.7s both",
        }}>
          <div style={{ display: "flex" }}>
            {["#d4917a", "#7a9a7a", "#8a9cc7", "#A47764"].map((c, i) => (
              <div key={i} style={{
                width: 30, height: 30, borderRadius: "50%",
                background: `linear-gradient(135deg, ${c}, ${c}cc)`,
                border: "2px solid #f5efe7",
                marginLeft: i > 0 ? -8 : 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 4 - i,
              }}>
                <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>
                  {["E", "J", "M", "A"][i]}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {[1,2,3,4,5].map(i => (
              <Star key={i} style={{ width: 14, height: 14, fill: "#e8913a", color: "#e8913a" }} />
            ))}
          </div>
          <span style={{ color: "#a39080", fontSize: 13, fontWeight: 600 }}>
            Loved by <span style={{ color: "#1e150d", fontWeight: 700 }}>12,000+</span> teams
          </span>
        </div>
      </section>

      <section style={{
        padding: "0 20px 40px",
        maxWidth: 1100, width: "100%", margin: "0 auto",
        position: "relative", zIndex: 1,
      }}>
        <HoverCard delay={100} style={{
          ...card,
          background: "linear-gradient(160deg, #1e1812 0%, #2a2018 50%, #1a1410 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 28,
          padding: "32px 24px",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(30,24,18,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}>
          <div style={shineStrong} />
          <div style={innerGlowStrong} />
          <div style={edgeHighlight} />
          <div style={{
            position: "absolute", top: -60, right: -60, width: 350, height: 350,
            background: "radial-gradient(circle, rgba(232,145,58,0.12) 0%, transparent 65%)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: -40, left: -40, width: 280, height: 200,
            background: "radial-gradient(circle, rgba(164,119,100,0.08) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <div style={{ display: "flex", alignItems: "center", gap: 48, position: "relative" }}>
            <div style={{ flex: 1 }}>
              <span style={{
                fontFamily: FM, fontSize: 11, fontWeight: 700,
                color: "#e8913a", letterSpacing: "0.15em", textTransform: "uppercase",
                marginBottom: 16, display: "block",
              }}>Terminal Preview</span>
              <h2 style={{
                fontFamily: FP, fontSize: 38, fontWeight: 600,
                color: "#fff", lineHeight: 1.15, letterSpacing: "-0.025em",
                margin: "0 0 16px",
              }}>
                One command to<br />
                <em style={{ fontStyle: "italic", fontWeight: 400, color: "#f0a050" }}>deploy anywhere</em>
              </h2>
              <p style={{
                color: "rgba(255,255,255,0.5)", fontSize: 15, lineHeight: 1.7,
                fontWeight: 450, maxWidth: 380, margin: 0,
              }}>
                From local development to global production in seconds.
                Our CLI handles the rest — routing, scaling, and monitoring.
              </p>
            </div>

            <div style={{
              width: 420, borderRadius: 18,
              background: "rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden", flexShrink: 0,
            }}>
              <div style={{
                padding: "10px 16px",
                display: "flex", alignItems: "center", gap: 8,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                {["#ff5f57", "#ffbd2e", "#28ca41"].map((c, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: c, opacity: 0.8 }} />
                ))}
                <span style={{ fontFamily: FM, color: "rgba(255,255,255,0.3)", fontSize: 12, marginLeft: 8 }}>terminal</span>
              </div>
              <div style={{ padding: "20px 20px 24px", fontFamily: FM, fontSize: 13, lineHeight: 2.2 }}>
                <div><span style={{ color: "#7abe8e" }}>$</span> <span style={{ color: "rgba(255,255,255,0.7)" }}>sutaeru init my-project</span></div>
                <div style={{ color: "rgba(255,255,255,0.35)" }}>✓ Project scaffolded</div>
                <div><span style={{ color: "#7abe8e" }}>$</span> <span style={{ color: "rgba(255,255,255,0.7)" }}>sutaeru deploy --prod</span></div>
                <div style={{ color: "#f0a050" }}>⚡ Deploying to 42 regions...</div>
                <div style={{ color: "#7abe8e" }}>✓ Live at sutaeru.app/my-project</div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{ color: "#7abe8e" }}>$</span>
                  <span style={{
                    display: "inline-block", width: 8, height: 18,
                    background: "#e8913a", marginLeft: 8,
                    animation: "typewriter 1s steps(1) infinite",
                  }} />
                </div>
              </div>
            </div>
          </div>
        </HoverCard>
      </section>

      <section style={{
        padding: "40px 20px 60px",
        maxWidth: 1100, margin: "0 auto",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span style={{
            fontFamily: FM, fontSize: 12, fontWeight: 700,
            color: "#A47764", letterSpacing: "0.15em", textTransform: "uppercase",
            display: "block", marginBottom: 16,
            animation: "fadeSlideIn 0.6s ease-out both",
          }}>Capabilities</span>
          <h2 style={{
            fontFamily: FP, fontSize: 52, fontWeight: 700,
            color: "#1e150d", lineHeight: 1.1, letterSpacing: "-0.03em",
            margin: "0 0 12px",
            animation: "fadeSlideIn 0.6s ease-out 0.1s both",
          }}>
            Everything you need,<br />
            <em style={{ fontStyle: "italic", fontWeight: 500, color: "#A47764" }}>nothing you don't</em>
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <HoverCard key={i} delay={150 + i * 80} style={{
                ...card, padding: "36px 32px",
                position: "relative", overflow: "hidden",
              }}>
                <div style={shineLight} />
                <div style={innerGlowLight} />
                <div style={edgeHighlight} />
                <div style={{
                  width: 52, height: 52, borderRadius: 16,
                  background: `${f.accent}18`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 22, position: "relative",
                }}>
                  <Icon style={{ width: 24, height: 24, color: f.accent }} />
                </div>
                <h3 style={{
                  fontFamily: FD, fontSize: 22, fontWeight: 400,
                  color: "#1e150d", margin: "0 0 10px", position: "relative",
                  letterSpacing: "-0.01em",
                }}>{f.title}</h3>
                <p style={{
                  color: "#a39080", fontSize: 14, lineHeight: 1.65,
                  fontWeight: 450, margin: 0, position: "relative",
                }}>{f.desc}</p>
              </HoverCard>
            );
          })}
        </div>
      </section>

      <section style={{
        padding: "40px 20px",
        maxWidth: 1100, margin: "0 auto",
        position: "relative", zIndex: 1,
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16,
          marginBottom: 60,
        }}>
          {STATS.map((s, i) => (
            <HoverCard key={i} delay={100 + i * 70} style={{
              ...card,
              background: i === 2
                ? "linear-gradient(160deg, #b8866f 0%, #A47764 40%, #926a56 100%)"
                : "#fff",
              border: i === 2 ? "1px solid rgba(255,255,255,0.15)" : card.border,
              boxShadow: i === 2
                ? "0 4px 20px rgba(164,119,100,0.35), inset 0 1px 0 rgba(255,255,255,0.15)"
                : card.boxShadow,
              padding: "36px 32px",
              textAlign: "center",
              position: "relative", overflow: "hidden",
            }}>
              {i === 2 ? <><div style={shineStrong} /><div style={innerGlowStrong} /></> : <><div style={shineLight} /><div style={innerGlowLight} /></>}
              <div style={edgeHighlight} />
              <p style={{
                fontFamily: FD, fontSize: 44, fontWeight: 400,
                color: i === 2 ? "#fff" : "#1e150d",
                letterSpacing: "-0.03em", lineHeight: 1, margin: "0 0 8px",
                position: "relative",
              }}>{s.value}</p>
              <p style={{
                color: i === 2 ? "rgba(255,255,255,0.7)" : "#a39080",
                fontSize: 13, fontWeight: 600,
                letterSpacing: "0.04em", textTransform: "uppercase",
                margin: 0, position: "relative",
              }}>{s.label}</p>
            </HoverCard>
          ))}
        </div>

        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span style={{
            fontFamily: FM, fontSize: 12, fontWeight: 700,
            color: "#A47764", letterSpacing: "0.15em", textTransform: "uppercase",
            display: "block", marginBottom: 16,
          }}>Testimonials</span>
          <h2 style={{
            fontFamily: FP, fontSize: 48, fontWeight: 700,
            color: "#1e150d", lineHeight: 1.1, letterSpacing: "-0.03em",
            margin: 0,
          }}>
            Trusted by the <em style={{ fontStyle: "italic", fontWeight: 500, color: "#A47764" }}>best</em>
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {TESTIMONIALS.map((t, i) => (
            <HoverCard key={i} delay={200 + i * 100} style={{
              ...card, padding: "36px 32px",
              position: "relative", overflow: "hidden",
            }}>
              <div style={shineLight} />
              <div style={innerGlowLight} />
              <div style={edgeHighlight} />
              <div style={{ display: "flex", gap: 4, marginBottom: 22, position: "relative" }}>
                {[1,2,3,4,5].map(s => (
                  <Star key={s} style={{ width: 14, height: 14, fill: "#e8913a", color: "#e8913a" }} />
                ))}
              </div>
              <p style={{
                fontFamily: FP, fontSize: 17, fontWeight: 400,
                fontStyle: "italic", color: "#3a2e22",
                lineHeight: 1.65, margin: "0 0 28px",
                position: "relative",
              }}>"{t.quote}"</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${t.color}, ${t.color}cc)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 2px 8px ${t.color}44`,
                }}>
                  <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{t.initials}</span>
                </div>
                <div>
                  <p style={{ color: "#1e150d", fontWeight: 700, fontSize: 14, margin: 0 }}>{t.name}</p>
                  <p style={{ color: "#b0a090", fontSize: 12, fontWeight: 500, margin: 0 }}>{t.role}</p>
                </div>
              </div>
            </HoverCard>
          ))}
        </div>
      </section>

      <section style={{
        padding: "40px 20px 60px",
        maxWidth: 1100, margin: "0 auto",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span style={{
            fontFamily: FM, fontSize: 12, fontWeight: 700,
            color: "#A47764", letterSpacing: "0.15em", textTransform: "uppercase",
            display: "block", marginBottom: 16,
          }}>Pricing</span>
          <h2 style={{
            fontFamily: FP, fontSize: 48, fontWeight: 700,
            color: "#1e150d", lineHeight: 1.1, letterSpacing: "-0.03em",
            margin: "0 0 12px",
          }}>
            Simple, <em style={{ fontStyle: "italic", fontWeight: 500, color: "#A47764" }}>transparent</em> pricing
          </h2>
          <p style={{ color: "#a39080", fontSize: 16, fontWeight: 450, margin: 0 }}>
            No hidden fees. No surprises. Cancel anytime.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, alignItems: "start" }}>
          {PLANS.map((plan, i) => (
            <HoverCard key={i} delay={200 + i * 100} style={{
              ...card,
              background: plan.popular
                ? "linear-gradient(160deg, #1e1812 0%, #2a2018 50%, #1a1410 100%)"
                : "#fff",
              border: plan.popular ? "1px solid rgba(255,255,255,0.1)" : card.border,
              boxShadow: plan.popular
                ? "0 8px 40px rgba(30,24,18,0.35), inset 0 1px 0 rgba(255,255,255,0.1)"
                : card.boxShadow,
              padding: plan.popular ? "44px 36px" : "36px 32px",
              position: "relative", overflow: "hidden",
              transform: plan.popular ? "scale(1.04)" : undefined,
            }}>
              {plan.popular ? <><div style={shineStrong} /><div style={innerGlowStrong} /></> : <><div style={shineLight} /><div style={innerGlowLight} /></>}
              <div style={edgeHighlight} />

              {plan.popular && (
                <div style={{
                  position: "absolute", top: 20, right: 20,
                  background: "linear-gradient(135deg, #e8913a, #d4802e)",
                  borderRadius: 8, padding: "4px 12px",
                  fontSize: 11, fontWeight: 700, color: "#fff",
                  letterSpacing: "0.04em",
                }}>Popular</div>
              )}

              <h3 style={{
                fontFamily: FD, fontSize: 26, fontWeight: 400,
                color: plan.popular ? "#fff" : "#1e150d",
                margin: "0 0 8px", position: "relative",
              }}>{plan.name}</h3>

              <p style={{
                color: plan.popular ? "rgba(255,255,255,0.5)" : "#a39080",
                fontSize: 13, fontWeight: 500, margin: "0 0 24px",
                position: "relative",
              }}>{plan.desc}</p>

              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 28, position: "relative" }}>
                {plan.price !== "Custom" && <span style={{
                  color: plan.popular ? "rgba(255,255,255,0.5)" : "#a39080",
                  fontSize: 20, fontWeight: 600,
                }}>$</span>}
                <span style={{
                  fontFamily: FD, fontSize: plan.price === "Custom" ? 36 : 52,
                  fontWeight: 400, color: plan.popular ? "#fff" : "#1e150d",
                  lineHeight: 1, letterSpacing: "-0.03em",
                }}>{plan.price}</span>
                {plan.price !== "Custom" && <span style={{
                  color: plan.popular ? "rgba(255,255,255,0.4)" : "#b0a090",
                  fontSize: 14, fontWeight: 500, marginLeft: 4,
                }}>/month</span>}
              </div>

              <div style={{ marginBottom: 32, position: "relative" }}>
                {plan.features.map((feat, fi) => (
                  <div key={fi} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 0",
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: plan.popular ? "rgba(232,145,58,0.2)" : `rgba(164,119,100,0.12)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <Check style={{
                        width: 12, height: 12,
                        color: plan.popular ? "#f0a050" : "#A47764",
                        strokeWidth: 2.5,
                      }} />
                    </div>
                    <span style={{
                      color: plan.popular ? "rgba(255,255,255,0.75)" : "#6a5a4a",
                      fontSize: 14, fontWeight: 500,
                    }}>{feat}</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => navigate('/login')}
                style={{
                  width: "100%", padding: "14px 24px", borderRadius: 14,
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  border: plan.popular ? "none" : "1px solid rgba(0,0,0,0.08)",
                  background: plan.popular
                    ? "linear-gradient(135deg, #e8913a, #d4802e)"
                    : "rgba(255,255,255,0.8)",
                  color: plan.popular ? "#fff" : "#1e150d",
                  boxShadow: plan.popular
                    ? "0 4px 16px rgba(232,145,58,0.35)"
                    : "0 1px 4px rgba(0,0,0,0.04)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  position: "relative",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.03)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                {plan.cta} <ChevronRight style={{ width: 16, height: 16 }} />
              </button>
            </HoverCard>
          ))}
        </div>
      </section>

      <section style={{
        padding: "0 20px 60px",
        maxWidth: 1100, margin: "0 auto",
        position: "relative", zIndex: 1,
      }}>
        <HoverCard delay={200} style={{
          borderRadius: 28, padding: "48px 24px",
          background: "linear-gradient(160deg, #b8866f 0%, #A47764 40%, #926a56 100%)",
          boxShadow: "0 8px 40px rgba(164,119,100,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
          textAlign: "center",
          position: "relative", overflow: "hidden",
          transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.3s ease",
        }}>
          <div style={shineStrong} />
          <div style={innerGlowStrong} />
          <div style={edgeHighlight} />
          <div style={{
            position: "absolute", top: -80, right: -80, width: 400, height: 400,
            background: "radial-gradient(circle, rgba(232,145,58,0.2) 0%, transparent 65%)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: -60, left: -60, width: 300, height: 250,
            background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <h2 style={{
            fontFamily: FP, fontSize: 50, fontWeight: 700,
            color: "#fff", lineHeight: 1.1, letterSpacing: "-0.03em",
            margin: "0 0 16px", position: "relative",
          }}>
            Ready to build<br />
            <em style={{ fontStyle: "italic", fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>something extraordinary?</em>
          </h2>
          <p style={{
            color: "rgba(255,255,255,0.65)", fontSize: 17, fontWeight: 450,
            maxWidth: 480, margin: "0 auto 36px", lineHeight: 1.65,
            position: "relative",
          }}>
            Join thousands of teams who've already made the switch.
            Start free, scale infinitely.
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, position: "relative" }}>
            <button 
              onClick={() => navigate('/login')}
              style={{
                background: "#fff", color: "#926a56", border: "none",
                borderRadius: 14, padding: "16px 40px",
                fontSize: 16, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                display: "flex", alignItems: "center", gap: 8,
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(0,0,0,0.2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)"; }}
            >
              Get Started Free <ArrowRight style={{ width: 18, height: 18 }} />
            </button>
            <button style={{
              background: "rgba(255,255,255,0.15)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.25)", borderRadius: 14, padding: "16px 32px",
              fontSize: 16, fontWeight: 600, cursor: "pointer",
              backdropFilter: "blur(8px)",
              transition: "background 0.2s, transform 0.2s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.25)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.transform = ""; }}
            >
              Talk to Sales
            </button>
          </div>
        </HoverCard>
      </section>

      <footer style={{
        padding: "32px 20px 24px",
        maxWidth: 1100, margin: "0 auto",
        position: "relative", zIndex: 1,
        borderTop: "1px solid rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 40 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, #A47764, #926a56)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>S</span>
              </div>
              <span style={{ fontFamily: FD, fontSize: 18, color: "#1e150d" }}>Sutaeru</span>
            </div>
            <p style={{ color: "#b0a090", fontSize: 13, fontWeight: 450, maxWidth: 240, lineHeight: 1.6, margin: 0 }}>
              Crafting intelligent software with care and precision since 2024.
            </p>
          </div>

          {[
            { title: "Product", links: ["Features", "Pricing", "Changelog", "Roadmap"] },
            { title: "Company", links: ["About", "Blog", "Careers", "Press"] },
            { title: "Resources", links: ["Documentation", "API Reference", "Community", "Status"] },
          ].map(col => (
            <div key={col.title}>
              <h4 style={{
                fontFamily: FD, fontSize: 15, fontWeight: 400,
                color: "#1e150d", margin: "0 0 14px",
              }}>{col.title}</h4>
              {col.links.map(link => (
                <p key={link} style={{
                  margin: "0 0 10px", fontSize: 13, fontWeight: 500,
                  color: "#a39080", cursor: "pointer",
                  transition: "color 0.2s",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.color = "#6a5a4a"}
                  onMouseLeave={(e) => e.currentTarget.style.color = "#a39080"}
                >{link}</p>
              ))}
            </div>
          ))}
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 24, borderTop: "1px solid rgba(0,0,0,0.04)",
        }}>
          <p style={{ color: "#c4b5a4", fontSize: 12, fontWeight: 500, margin: 0 }}>
            © 2026 Sutaeru. All rights reserved.
          </p>
          <div style={{ display: "flex", gap: 20 }}>
            {["Privacy", "Terms", "Cookies"].map(l => (
              <span key={l} style={{
                color: "#b0a090", fontSize: 12, fontWeight: 500, cursor: "pointer",
                transition: "color 0.2s",
              }}
                onMouseEnter={(e) => e.currentTarget.style.color = "#6a5a4a"}
                onMouseLeave={(e) => e.currentTarget.style.color = "#b0a090"}
              >{l}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
