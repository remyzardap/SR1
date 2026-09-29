// ============================================
// NEW FILE: client/src/os/BlockWidgets.tsx
// Widget visuals: Debtrix stat cards, AKIRA glass, Sales dashboard charts
// ============================================

import { trpc } from '../lib/trpc';
import { MessageSquare, CheckSquare, FolderOpen, Compass, Terminal, Users, ArrowUpRight, TrendingUp, Zap } from "lucide-react";
import { Brain } from "@/components/brandIcons";

// ==============================
// CHAT — Main card, like MagicDraft "Welcome back" banner
// Full 12-col, mocha/amber tinted
// ==============================
export function ChatWidget() {
  const { data: sessions } = trpc.chat.listSessions.useQuery(undefined, { staleTime: 30_000 });
  const latest = sessions?.[0];

  return (
    <div className="relative z-10 p-5 h-full flex flex-col" style={{ minHeight: 120 }}>
      {/* Top row: icon + label */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="os-icon-ring os-icon-ring--amber">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--os-text)' }}>Kemma</p>
            <p className="os-caption">AI Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--os-green)' }} />
          <span className="os-caption">Online</span>
        </div>
      </div>

      {/* Last message preview */}
      <div className="mt-auto rounded-xl p-3" style={{
        background: 'var(--os-bg-card-alt)',
        border: '1px solid var(--os-border-subtle)',
      }}>
        {latest ? (
          <p className="text-xs font-medium" style={{ color: 'var(--os-text-sub)' }}>
            "{(latest.title || 'New conversation').slice(0, 80)}"
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--os-text-muted)' }}>
            Start a conversation with Kemma...
          </p>
        )}
      </div>

      {/* Session count */}
      <div className="flex items-center justify-between mt-3">
        <span className="os-stat-label">{sessions?.length || 0} sessions</span>
        <ArrowUpRight className="h-3.5 w-3.5" style={{ color: 'var(--os-text-muted)' }} />
      </div>
    </div>
  );
}

// ==============================
// TASKS — Debtrix-style stat card with big number + delta
// ==============================
export function TasksWidget() {
  const { data: allTasks = [] } = trpc.tasks.list.useQuery(undefined, { staleTime: 30_000 });
  const open = allTasks.filter((t) => t.status === 'open' || t.status === 'in_progress');
  const doneThisWeek = allTasks.filter((t) => {
    if (t.status !== 'done') return false;
    return new Date(t.updatedAt) > new Date(Date.now() - 7 * 86400000);
  });

  return (
    <div className="relative z-10 p-5 h-full flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div className="os-icon-ring os-icon-ring--amber">
          <CheckSquare className="h-4 w-4" />
        </div>
        <span className="os-stat-delta os-stat-delta--up">
          <TrendingUp className="h-3 w-3 inline mr-1" />
          +{doneThisWeek.length}
        </span>
      </div>

      <div className="mt-auto">
        <span className="os-big-stat">{open.length}</span>
        <div className="flex items-center gap-3 mt-1">
          <span className="os-stat-label">Open Tasks</span>
          <span className="os-caption">·</span>
          <span className="os-caption">{doneThisWeek.length} done this week</span>
        </div>
      </div>

      {/* Mini progress bar */}
      <div className="os-progress mt-3">
        <div
          className="os-progress-fill"
          style={{
            width: allTasks.length > 0
              ? `${(doneThisWeek.length / Math.max(allTasks.length, 1)) * 100}%`
              : '0%',
            background: 'var(--os-amber)',
          }}
        />
      </div>
    </div>
  );
}

// ==============================
// MEMORY — Stat card with fragment count + mini graph dots
// ==============================
export function MemoryWidget() {
  const { data: memories = [] } = trpc.memories.list.useQuery(
    undefined,
    { staleTime: 60_000 }
  );

  return (
    <div className="relative z-10 p-5 h-full flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div className="os-icon-ring os-icon-ring--indigo">
          <Brain className="h-4 w-4" />
        </div>
        <span className="os-badge" style={{ background: 'var(--os-indigo-dim)', color: 'var(--os-indigo)' }}>
          Active
        </span>
      </div>

      <div className="mt-auto">
        <span className="os-big-stat">{memories.length}</span>
        <span className="os-stat-label block mt-1">Memory Fragments</span>
      </div>

      {/* Mini activity dots (like fitness chart mini-bars) */}
      <div className="flex items-end gap-1 mt-3 h-4">
        {[3, 5, 2, 7, 4, 6, 8, 3, 5, 7, 4, 6].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${h * 12}%`,
              background: i >= 10 ? 'var(--os-indigo)' : 'var(--os-indigo-dim)',
              minHeight: 2,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ==============================
// FILES — Card with recent files list (MagicDraft Knowledge Base style)
// ==============================
export function FilesWidget() {
  const { data: files = [] } = trpc.files.list.useQuery(undefined, { staleTime: 30_000 });
  const recentFiles = files.slice(0, 4);

  return (
    <div className="relative z-10 p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="os-icon-ring os-icon-ring--green">
            <FolderOpen className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--os-text)' }}>Files</span>
        </div>
        <span className="os-badge" style={{ background: 'var(--os-green-dim)', color: 'var(--os-green)' }}>
          {files.length}
        </span>
      </div>

      <div className="space-y-2 mt-auto">
        {recentFiles.map((f, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded-lg"
            style={{ background: 'var(--os-bg-card-alt)' }}>
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs"
              style={{ background: 'var(--os-green-dim)', color: 'var(--os-green)' }}>
              {(f.format || 'md').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--os-text)' }}>{f.name}</p>
            </div>
            <span className="os-caption whitespace-nowrap">
              {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : ''}
            </span>
          </div>
        ))}
        {recentFiles.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--os-text-muted)' }}>No files yet</p>
        )}
      </div>
    </div>
  );
}

// ==============================
// CREW — Connection avatars (MagicDraft "Team & Members" style)
// ==============================
export function CrewWidget() {
  return (
    <div className="relative z-10 p-5 h-full flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div className="os-icon-ring os-icon-ring--blue">
          <Users className="h-4 w-4" />
        </div>
        <ArrowUpRight className="h-3.5 w-3.5" style={{ color: 'var(--os-text-muted)' }} />
      </div>

      <div className="mt-auto">
        {/* Avatar stack */}
        <div className="flex -space-x-2 mb-2">
          {[
            { letter: 'G', color: 'var(--os-blue)' },
            { letter: 'W', color: 'var(--os-green)' },
            { letter: 'D', color: 'var(--os-amber)' },
          ].map((c, i) => (
            <div key={i}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: `${c.color}20`,
                border: '2px solid var(--os-bg-card)',
                color: c.color,
              }}
            >
              {c.letter}
            </div>
          ))}
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              background: 'var(--os-bg-card-alt)',
              border: '2px solid var(--os-bg-card)',
              color: 'var(--os-text-muted)',
            }}
          >+</div>
        </div>
        <span className="os-stat-label">3 Connections Active</span>
      </div>
    </div>
  );
}

// ==============================
// RESEARCH — Stat card with discovery count
// ==============================
export function ResearchWidget() {
  return (
    <div className="relative z-10 p-5 h-full flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div className="os-icon-ring os-icon-ring--indigo">
          <Compass className="h-4 w-4" />
        </div>
        <span className="os-badge" style={{ background: 'var(--os-indigo-dim)', color: 'var(--os-indigo)' }}>
          <Zap className="h-3 w-3 inline mr-1" />
          Live
        </span>
      </div>

      <div className="mt-auto">
        <span className="os-big-stat">Discover</span>
        <span className="os-stat-label block mt-1">Web Research & Insights</span>
      </div>
    </div>
  );
}

// ==============================
// TERMINAL — Dark card with teal glow
// ==============================
export function TerminalWidget() {
  return (
    <div className="relative z-10 p-5 h-full flex flex-col" style={{ minHeight: 80 }}>
      <div className="flex items-center gap-3">
        <div className="os-icon-ring os-icon-ring--teal">
          <Terminal className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--os-teal)' }}>Terminal</p>
          <p className="os-caption">System shell access</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: '#EF4444' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#F59E0B' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#22C55E' }} />
        </div>
      </div>
      <div className="mt-3 rounded-lg p-3" style={{ background: 'rgba(20, 184, 166, 0.05)', border: '1px solid rgba(20, 184, 166, 0.10)' }}>
        <p className="font-mono text-xs" style={{ color: 'var(--os-teal)' }}>
          <span style={{ color: 'var(--os-text-muted)' }}>$</span> Ready...
        </p>
      </div>
    </div>
  );
}
