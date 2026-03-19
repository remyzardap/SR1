import React, { useState } from "react";
import { useLocation } from "wouter";

const SLogo = () => (
  <svg width="48" height="28" viewBox="0 0 96 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M48,28 C45,20 38,8 26,8 C12,8 4,17 4,28 C4,39 12,48 26,48 C38,48 45,36 48,28 C51,20 58,8 70,8 C84,8 92,17 92,28 C92,39 84,48 70,48 C58,48 51,36 48,28Z" stroke="currentColor" strokeWidth="5.5" strokeLinejoin="round" fill="none"/>
    <line x1="62" y1="19" x2="78" y2="19" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    <path d="M60,28 C60,24.5 63.5,22.5 66.5,24 C67,21.5 70,20.5 72.5,22 C74.5,20.5 79,21.5 79,25 C79,28 76,29.5 73,29 C72,30.5 67,30.5 65.5,29 C62.5,29 60,28.8 60,28Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <line x1="59" y1="34" x2="81" y2="34" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    <path d="M67.5,34 L70,38.5 L72.5,34" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

function ModeSwitch() {
  const [mode, setMode] = useState<'dark' | 'light'>('dark');
  const toggle = (m: 'dark' | 'light') => {
    setMode(m);
    if (m === 'light') {
      document.documentElement.setAttribute('data-mode', 'light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.removeAttribute('data-mode');
      document.documentElement.classList.add('dark');
    }
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '3px',
      padding: '3px', borderRadius: '100px',
      border: '1px solid var(--line-1, rgba(255,255,255,0.055))',
      background: 'var(--glass-bg, rgba(255,255,255,0.10))',
      backdropFilter: 'blur(12px)',
    }}>
      {(['dark', 'light'] as const).map(m => (
        <button key={m} onClick={() => toggle(m)} style={{
          padding: '6px 14px', borderRadius: '100px', border: 'none',
          background: mode === m ? 'var(--btn-fill, #f2f2f2)' : 'transparent',
          color: mode === m ? 'var(--btn-ink, #050505)' : 'var(--t3, rgba(242,242,242,0.22))',
          fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '10px', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          cursor: 'pointer', transition: 'all .25s',
        }}>{m}</button>
      ))}
    </div>
  );
}

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10,
      display: 'flex', flexDirection: 'column',
      background: 'var(--background, #0d0a1a)',
      color: 'var(--foreground, #f5f2ed)',
      fontFamily: 'var(--font-b, "DM Sans", sans-serif)',
      overflow: 'hidden',
      justifyContent: 'space-between',
    }}>
      {/* Radial light bleed */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `
          radial-gradient(ellipse 60% 50% at 20% 10%, rgba(255,255,255,0.028) 0%, transparent 70%),
          radial-gradient(ellipse 40% 40% at 85% 85%, rgba(255,255,255,0.018) 0%, transparent 70%)
        `,
      }} />

      {/* Nav */}
      <nav style={{
        position: 'relative', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '22px 24px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <SLogo />
          <span style={{
            fontFamily: 'var(--font-d, "Syne", sans-serif)',
            fontWeight: 800, fontSize: '14px',
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--foreground, #f5f2ed)',
          }}>Sutaeru</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => navigate('/login')} style={{
            padding: '9px 18px', borderRadius: '100px',
            border: '1px solid var(--line-2, rgba(255,255,255,0.10))', background: 'transparent',
            fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.07em', textTransform: 'uppercase' as const,
            color: 'var(--muted-foreground, rgba(245,242,237,0.55))', cursor: 'pointer', transition: 'all .2s',
          }}>Sign in</button>
          <button onClick={() => navigate('/login')} style={{
            padding: '9px 20px', borderRadius: '100px', border: 'none',
            background: 'var(--btn-fill, #f2f2f2)', color: 'var(--btn-ink, #050505)',
            fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '11px', fontWeight: 800,
            letterSpacing: '0.07em', textTransform: 'uppercase' as const,
            cursor: 'pointer', transition: 'all .22s',
          }}>Get started</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{
        position: 'relative', zIndex: 2, flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', justifyContent: 'flex-end',
        padding: '0 28px 44px',
      }}>
        {/* Eyebrow */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '5px 14px', borderRadius: '100px',
          border: '1px solid var(--line-1, rgba(255,255,255,0.055))',
          background: 'var(--glass-bg, rgba(255,255,255,0.10))',
          backdropFilter: 'blur(12px)',
          fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '10px', fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const,
          color: 'var(--muted-foreground, rgba(245,242,237,0.40))',
          marginBottom: '24px',
        }}>
          <div style={{
            width: '4px', height: '4px', borderRadius: '50%',
            background: 'var(--t1, #f2f2f2)',
            animation: 'breathe 2.2s ease infinite',
          }} />
          Now live
        </div>

        {/* H1 */}
        <h1 style={{
          fontFamily: 'var(--font-d, "Syne", sans-serif)', fontWeight: 800,
          fontSize: 'clamp(38px, 10vw, 52px)',
          lineHeight: 1.1, letterSpacing: '-0.03em',
          color: 'var(--foreground, #f5f2ed)', marginBottom: '14px', margin: '0 0 14px 0',
        }}>
          One memory.<br />
          <span style={{ color: 'var(--muted-foreground, rgba(245,242,237,0.40))', fontWeight: 400 }}>Every model.</span>
        </h1>

        {/* Body */}
        <p style={{
          fontSize: '14px', lineHeight: 1.7,
          color: 'var(--muted-foreground, rgba(245,242,237,0.40))',
          maxWidth: '260px', marginBottom: '36px', margin: '0 0 36px 0',
        }}>
          Your AI identity layer. One persistent memory that follows you across every model, every conversation, every platform.
        </p>

        {/* CTAs */}
        <div style={{
          display: 'flex', gap: '10px', flexWrap: 'wrap' as const,
        }}>
          <button onClick={() => navigate('/login')} style={{
            padding: '13px 24px', borderRadius: '100px', border: 'none',
            background: 'var(--btn-fill, #f2f2f2)', color: 'var(--btn-ink, #050505)',
            fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '12px', fontWeight: 800,
            letterSpacing: '0.07em', textTransform: 'uppercase' as const,
            cursor: 'pointer', transition: 'all .22s',
          }}>Get started →</button>
          <button onClick={() => navigate('/login')} style={{
            padding: '13px 24px', borderRadius: '100px',
            border: '1px solid var(--line-1, rgba(255,255,255,0.055))', background: 'transparent',
            fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '12px', fontWeight: 700,
            letterSpacing: '0.07em', textTransform: 'uppercase' as const,
            color: 'var(--muted-foreground, rgba(245,242,237,0.40))', cursor: 'pointer', transition: 'all .22s',
          }}>Sign in</button>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px 24px',
      }}>
        <span style={{
          fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '10px', fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const,
          color: 'var(--muted-foreground, rgba(245,242,237,0.40))',
        }}>© 2025 Sutaeru</span>
        <ModeSwitch />
      </div>

      <style>{`
        @keyframes rise { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        @keyframes breathe { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.55)} }
      `}</style>
    </div>
  );
}