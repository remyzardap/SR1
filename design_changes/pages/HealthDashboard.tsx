import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface HealthMetrics {
  steps: number;
  stepsGoal: number;
  calories: number;
  caloriesGoal: number;
  exerciseMinutes: number;
  exerciseGoal: number;
  standHours: number;
  standGoal: number;
  heartRate: { current: number; resting: number; max: number; min: number };
  sleep: { totalMinutes: number; deepMinutes: number; remMinutes: number; lightMinutes: number; awakeMinutes: number; score: number };
  hydration: number;
  hydrationGoal: number;
}

const MOCK_HEALTH: HealthMetrics = {
  steps: 7234, stepsGoal: 10000,
  calories: 520, caloriesGoal: 600,
  exerciseMinutes: 30, exerciseGoal: 30,
  standHours: 8, standGoal: 12,
  heartRate: { current: 72, resting: 58, max: 145, min: 52 },
  sleep: { totalMinutes: 390, deepMinutes: 84, remMinutes: 130, lightMinutes: 150, awakeMinutes: 26, score: 72 },
  hydration: 1200, hydrationGoal: 2500,
};

export default function HealthDashboard() {
  const { theme } = useTheme();
  const [metrics, setMetrics] = useState<HealthMetrics>(MOCK_HEALTH);
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'trends'>('today');

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const addWater = () => {
    setMetrics(prev => ({ ...prev, hydration: Math.min(prev.hydration + 250, prev.hydrationGoal + 500) }));
  };

  const stepsPct = Math.min((metrics.steps / metrics.stepsGoal) * 100, 100);
  const exercisePct = Math.min((metrics.exerciseMinutes / metrics.exerciseGoal) * 100, 100);
  const standPct = Math.min((metrics.standHours / metrics.standGoal) * 100, 100);
  const hydrationPct = Math.min((metrics.hydration / metrics.hydrationGoal) * 100, 100);

  const RingProgress: React.FC<{ pct: number; icon: string; label: string; value: string; sub: string; color: string }> =
    ({ pct, icon, label, value, sub, color }) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ position: 'relative', width: 80, height: 80 }}>
          <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="40" cy="40" r="36" fill="none" stroke="var(--glass-border)" strokeWidth="8" />
            <circle cx="40" cy="40" r="36" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={226} strokeDashoffset={226 - (pct / 100) * 226} style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>
            {icon}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)' }}>{label}</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--foreground)' }}>{value}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>{sub}</div>
        </div>
      </div>
    );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted-foreground)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: 'var(--foreground)' }}>Health</div>
        </div>

        <div style={{ display: 'flex', gap: '8px', padding: '4px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', marginBottom: '16px' }}>
          {(['today', 'week', 'trends'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
              background: activeTab === tab ? 'var(--accent-dim)' : 'transparent',
              color: activeTab === tab ? 'var(--accent-color)' : 'var(--muted-foreground)',
              fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer',
            }}>{tab}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Activity Rings */}
        <div style={{ padding: '20px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted-foreground)', marginBottom: '16px' }}>Activity</div>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            <RingProgress pct={stepsPct} icon="👟" label="Move" value={metrics.steps.toLocaleString()} sub={`/${metrics.stepsGoal.toLocaleString()}`} color={theme.accentColor} />
            <RingProgress pct={exercisePct} icon="🏃" label="Exercise" value={formatDuration(metrics.exerciseMinutes)} sub={`/${formatDuration(metrics.exerciseGoal)}`} color={theme.secondaryColor} />
            <RingProgress pct={standPct} icon="🧍" label="Stand" value={`${metrics.standHours}/${metrics.standGoal}`} sub="hrs" color={theme.accentLight} />
          </div>
        </div>

        {/* Heart Rate */}
        <div style={{ padding: '16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>Heart Rate</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Live</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '48px', fontWeight: 800, color: 'var(--foreground)' }}>{metrics.heartRate.current}</span>
            <span style={{ fontSize: '14px', color: 'var(--muted-foreground)' }}>BPM</span>
          </div>
          <div style={{ display: 'flex', gap: '24px', fontSize: '12px' }}>
            <div>
              <div style={{ color: 'var(--muted-foreground)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Resting</div>
              <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{metrics.heartRate.resting}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted-foreground)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Max</div>
              <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{metrics.heartRate.max}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted-foreground)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Min</div>
              <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{metrics.heartRate.min}</div>
            </div>
          </div>
        </div>

        {/* Sleep */}
        <div style={{ padding: '16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>Last Night</span>
            <div style={{
              padding: '4px 10px',
              background: metrics.sleep.score >= 80 ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
              border: `1px solid ${metrics.sleep.score >= 80 ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}`,
              borderRadius: '20px', fontSize: '12px', fontWeight: 700,
              color: metrics.sleep.score >= 80 ? '#22c55e' : '#eab308',
            }}>
              Score: {metrics.sleep.score}
            </div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '16px', color: 'var(--foreground)' }}>{formatDuration(metrics.sleep.totalMinutes)}</div>

          {[
            { label: 'Deep', val: metrics.sleep.deepMinutes, color: theme.accentColor },
            { label: 'REM', val: metrics.sleep.remMinutes, color: theme.secondaryColor },
            { label: 'Light', val: metrics.sleep.lightMinutes, color: theme.accentLight },
            { label: 'Awake', val: metrics.sleep.awakeMinutes, color: 'var(--muted-foreground)' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ width: '50px', fontSize: '11px', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{item.label}</div>
              <div style={{ flex: 1, height: '8px', background: 'var(--glass-border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max((item.val / metrics.sleep.totalMinutes) * 100, 4)}%`, height: '100%', background: item.color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ width: '50px', fontSize: '11px', textAlign: 'right', fontWeight: 500, color: 'var(--foreground)' }}>{formatDuration(item.val)}</div>
            </div>
          ))}
        </div>

        {/* Hydration */}
        <div style={{ padding: '16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>Hydration</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--foreground)' }}>{metrics.hydration} / {metrics.hydrationGoal} ml</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, height: '10px', background: 'var(--glass-border)', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${hydrationPct}%`, height: '100%', background: `linear-gradient(90deg, ${theme.accentColor}, ${theme.secondaryColor})`, borderRadius: '5px', transition: 'width 0.3s ease' }} />
            </div>
            <button onClick={addWater} style={{
              padding: '8px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
              borderRadius: '10px', color: 'var(--accent-color)', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>
              +250ml 💧
            </button>
          </div>
        </div>

        {/* S1 Insight */}
        <div style={{ padding: '14px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-color)' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-color)' }}>S1 Insight</span>
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--foreground)' }}>
            You slept 6h 30m — 20% less than your 7-day average. Consider a 20-min power nap this afternoon before your 3 PM meeting.
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
    </div>
  );
}
