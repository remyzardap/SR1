import { useSeoMeta } from "@/hooks/useSeoMeta";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, BookOpen, HardDrive, Plug, ArrowRight, Sparkles,
  MessageSquare, FileText, Plus, Zap, ChevronRight,
} from "lucide-react";

// ─── Fade-up animation preset ────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" },
});

// ─── Quick action pill ────────────────────────────────────────────────────────
function QuickAction({
  icon: Icon,
  label,
  path,
  color,
}: {
  icon: React.ElementType;
  label: string;
  path: string;
  color: string;
}) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(path)}
      className="flex items-center gap-2 px-4 py-2.5 rounded-full transition-all duration-200"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.09)",
        color: "rgba(242,242,242,0.65)",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: "13px",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.16)";
        (e.currentTarget as HTMLButtonElement).style.color = "#f2f2f2";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.09)";
        (e.currentTarget as HTMLButtonElement).style.color = "rgba(242,242,242,0.65)";
      }}
    >
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}30` }}
      >
        <Icon className="w-2.5 h-2.5" style={{ color }} />
      </div>
      {label}
    </button>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
const STAT_CONFIG: Record<string, { icon: React.ElementType; color: string; glow: string; border: string; path: string }> = {
  Skills:      { icon: Brain,     color: "#f2f2f2",  glow: "rgba(242,242,242,0.08)", border: "rgba(242,242,242,0.12)", path: "/skills"      },
  Memories:    { icon: BookOpen,  color: "#a78bfa",  glow: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.18)", path: "/memories"    },
  Files:       { icon: HardDrive, color: "#f59e0b",  glow: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.18)",  path: "/files"       },
  Connections: { icon: Plug,      color: "#2dd4bf",  glow: "rgba(45,212,191,0.10)",  border: "rgba(45,212,191,0.18)",  path: "/connections" },
};

function StatCard({ label, value, loading }: { label: string; value?: number; loading?: boolean }) {
  const [, navigate] = useLocation();
  const cfg = STAT_CONFIG[label] ?? { icon: Sparkles, color: "#f2f2f2", glow: "rgba(242,242,242,0.06)", border: "rgba(242,242,242,0.12)", path: "/" };
  const Icon = cfg.icon;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      onClick={() => navigate(cfg.path)}
      className="cursor-pointer p-5 rounded-2xl group transition-all duration-200"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = cfg.glow;
        (e.currentTarget as HTMLDivElement).style.borderColor = cfg.border;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)";
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: cfg.glow, border: `1px solid ${cfg.border}` }}>
          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
        </div>
        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: cfg.color }} />
      </div>
      {loading ? (
        <Skeleton className="h-8 w-10 mb-1" style={{ background: "rgba(255,255,255,0.06)" }} />
      ) : (
        <p className="text-3xl font-light mb-1" style={{ color: cfg.color, fontFamily: "'Syne', sans-serif" }}>
          {value ?? 0}
        </p>
      )}
      <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: "rgba(242,242,242,0.3)" }}>
        {label}
      </p>
    </motion.div>
  );
}

// ─── Identity hero card ───────────────────────────────────────────────────────
function IdentityCard() {
  const { data: identity, isLoading } = trpc.identity.get.useQuery();
  const [, navigate] = useLocation();

  return (
    <div
      className="rounded-2xl p-6 relative overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Ambient glow */}
      <div
        className="absolute top-0 left-0 w-48 h-48 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(242,242,242,0.04) 0%, transparent 70%)",
          transform: "translate(-20%, -20%)",
        }}
      />

      <div className="flex items-center justify-between mb-5 relative">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(242,242,242,0.35)", fontFamily: "'Syne', sans-serif" }}>
          Identity
        </h2>
        <button
          onClick={() => navigate("/identity")}
          className="text-[11px] flex items-center gap-1 transition-colors"
          style={{ color: "rgba(242,242,242,0.3)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#f2f2f2")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(242,242,242,0.3)")}
        >
          Edit <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-32" style={{ background: "rgba(255,255,255,0.06)" }} />
            <Skeleton className="h-3 w-20" style={{ background: "rgba(255,255,255,0.04)" }} />
          </div>
        </div>
      ) : !identity ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Sparkles className="w-5 h-5" style={{ color: "rgba(242,242,242,0.2)" }} />
          <p className="text-sm" style={{ color: "rgba(242,242,242,0.35)" }}>Identity not configured yet.</p>
          <button onClick={() => navigate("/identity")} className="btn-liquid px-4 py-1.5 text-xs mt-1">Set up identity</button>
        </div>
      ) : (
        <div className="flex items-center gap-5">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0"
            style={{
              background: "rgba(242,242,242,0.06)",
              border: "1px solid rgba(242,242,242,0.12)",
              color: "#f2f2f2",
              boxShadow: "0 0 24px rgba(242,242,242,0.06)",
              fontFamily: "'Syne', sans-serif",
            }}
          >
            {(identity.displayName ?? identity.handle ?? "?")[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-1">
              <p className="font-semibold text-lg truncate" style={{ color: "#f2f2f2", fontFamily: "'Syne', sans-serif" }}>
                {identity.displayName ?? "—"}
              </p>
              {identity.handle && (
                <span className="text-sm shrink-0" style={{ color: "rgba(242,242,242,0.3)" }}>
                  @{identity.handle}
                </span>
              )}
            </div>
            {identity.bio && (
              <p className="text-sm leading-relaxed line-clamp-2" style={{ color: "rgba(242,242,242,0.45)" }}>
                {identity.bio}
              </p>
            )}
            {identity.personalityTraits && identity.personalityTraits.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {identity.personalityTraits.map((trait: string) => (
                  <span
                    key={trait}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                    style={{
                      background: "rgba(242,242,242,0.06)",
                      border: "1px solid rgba(242,242,242,0.10)",
                      color: "rgba(242,242,242,0.5)",
                    }}
                  >
                    {trait}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compact list panel ───────────────────────────────────────────────────────
function ListPanel({
  title,
  items,
  loading,
  emptyText,
  ctaLabel,
  ctaHref,
  accentColor,
  renderItem,
}: {
  title: string;
  items: any[];
  loading: boolean;
  emptyText: string;
  ctaLabel: string;
  ctaHref: string;
  accentColor: string;
  renderItem: (item: any) => React.ReactNode;
}) {
  const [, navigate] = useLocation();
  return (
    <div className="rounded-2xl p-5 h-full" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(242,242,242,0.35)", fontFamily: "'Syne', sans-serif" }}>
          {title}
        </h2>
        <button
          onClick={() => navigate(ctaHref)}
          className="text-[11px] flex items-center gap-1 transition-colors"
          style={{ color: "rgba(242,242,242,0.3)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = accentColor)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(242,242,242,0.3)")}
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-full rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
          ))}
        </div>
      ) : !items.length ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm" style={{ color: "rgba(242,242,242,0.25)" }}>{emptyText}</p>
          <button
            onClick={() => navigate(ctaHref)}
            className="text-[11px] px-3 py-1.5 rounded-full transition-colors mt-1"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(242,242,242,0.5)" }}
          >
            {ctaLabel}
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 5).map((item: any, i: number) => (
            <div
              key={item.id ?? i}
              className="flex items-center gap-3 p-2.5 rounded-xl transition-all duration-150"
              style={{ background: "transparent", border: "1px solid transparent" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
                (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
              }}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  useSeoMeta({ title: "Dashboard", path: "/dashboard" });
  const [, navigate] = useLocation();

  const { data: skills,      isLoading: skillsLoading }      = trpc.skills.list.useQuery();
  const { data: memories,    isLoading: memoriesLoading }    = trpc.memories.list.useQuery();
  const { data: files,       isLoading: filesLoading }       = trpc.files.list.useQuery();
  const { data: connections, isLoading: connectionsLoading } = trpc.connections.list.useQuery();

  const stats = [
    { label: "Skills",      value: skills?.length,      loading: skillsLoading      },
    { label: "Memories",    value: memories?.length,    loading: memoriesLoading    },
    { label: "Files",       value: files?.length,       loading: filesLoading       },
    { label: "Connections", value: connections?.length, loading: connectionsLoading },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-5 p-4 sm:p-6 max-w-5xl mx-auto w-full"
    >
      {/* ── Header ── */}
      <motion.div {...fadeUp(0)} className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#f2f2f2", fontFamily: "'Syne', sans-serif" }}>
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(242,242,242,0.35)" }}>
            Your agent command center
          </p>
        </div>
      </motion.div>

      {/* ── Quick actions ── */}
      <motion.div {...fadeUp(0.05)} className="flex flex-wrap gap-2">
        <QuickAction icon={MessageSquare} label="New Chat"        path="/chat"     color="#f2f2f2" />
        <QuickAction icon={FileText}      label="Generate Doc"    path="/generate" color="#f59e0b" />
        <QuickAction icon={BookOpen}      label="Add Memory"      path="/memories" color="#a78bfa" />
        <QuickAction icon={Zap}           label="Browse Skills"   path="/discover" color="#2dd4bf" />
      </motion.div>

      {/* ── Stat cards ── */}
      <motion.div {...fadeUp(0.1)} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} loading={s.loading} />
        ))}
      </motion.div>

      {/* ── Identity card ── */}
      <motion.div {...fadeUp(0.15)}>
        <IdentityCard />
      </motion.div>

      {/* ── Skills + Memories panels ── */}
      <motion.div {...fadeUp(0.2)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ListPanel
          title="Skills"
          items={skills ?? []}
          loading={skillsLoading}
          emptyText="No skills yet."
          ctaLabel="Add a skill"
          ctaHref="/skills"
          accentColor="#f2f2f2"
          renderItem={(skill: any) => (
            <>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(242,242,242,0.05)", border: "1px solid rgba(242,242,242,0.09)" }}>
                <Brain className="w-3 h-3" style={{ color: "rgba(242,242,242,0.5)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate" style={{ color: "rgba(242,242,242,0.8)" }}>{skill.name}</p>
                {skill.description && (
                  <p className="text-[11px] truncate" style={{ color: "rgba(242,242,242,0.3)" }}>{skill.description}</p>
                )}
              </div>
            </>
          )}
        />
        <ListPanel
          title="Memories"
          items={memories ?? []}
          loading={memoriesLoading}
          emptyText="No memories yet."
          ctaLabel="Add a memory"
          ctaHref="/memories"
          accentColor="#a78bfa"
          renderItem={(memory: any) => (
            <>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.14)" }}>
                <BookOpen className="w-3 h-3" style={{ color: "#a78bfa" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate" style={{ color: "rgba(242,242,242,0.8)" }}>{memory.title}</p>
                {memory.content && (
                  <p className="text-[11px] line-clamp-1" style={{ color: "rgba(242,242,242,0.3)" }}>{memory.content}</p>
                )}
              </div>
            </>
          )}
        />
      </motion.div>
    </motion.div>
  );
}
