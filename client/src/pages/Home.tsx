import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";

// Light Mocha Cream Palette
const COLORS = {
  bg: "#f5efe7",           // Cream background
  bgGradient: "#ede6db",   // Slightly darker cream
  rose: "#A47764",         // Bronze accent
  roseDark: "#8b6352",     // Darker bronze
  chocolate: "#5c4033",    // Dark chocolate text
  chocolateLight: "#7a5a4a", // Lighter chocolate
  text: "#3d2b24",         // Dark text
  textMuted: "#8a7268",    // Muted text
  cream: "#faf8f5",        // Pure cream
  glass: "rgba(164, 119, 100, 0.12)",
  glassBorder: "rgba(164, 119, 100, 0.25)",
};

const SLogo = () => (
  <svg width="40" height="40" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="96" height="96" rx="20" fill={COLORS.rose}/>
    <path d="M48,48 C45,40 38,28 26,28 C12,28 4,37 4,48 C4,59 12,68 26,68 C38,68 45,56 48,48 C51,40 58,28 70,28 C84,28 92,37 92,48 C92,59 84,68 70,68 C58,68 51,56 48,48Z" stroke={COLORS.cream} strokeWidth="5.5" strokeLinejoin="round" fill="none"/>
    <line x1="62" y1="39" x2="78" y2="39" stroke={COLORS.cream} strokeWidth="3" strokeLinecap="round"/>
    <path d="M60,48 C60,44.5 63.5,42.5 66.5,44 C67,41.5 70,40.5 72.5,42 C74.5,40.5 79,41.5 79,45 C79,48 76,49.5 73,49 C72,50.5 67,50.5 65.5,49 C62.5,49 60,48.8 60,48Z" stroke={COLORS.cream} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <line x1="59" y1="54" x2="81" y2="54" stroke={COLORS.cream} strokeWidth="3" strokeLinecap="round"/>
    <path d="M67.5,54 L70,58.5 L72.5,54" stroke={COLORS.cream} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

function ModeSwitch() {
  const [mode, setMode] = useState<'dark' | 'light'>('light');
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
      padding: '4px', borderRadius: '100px',
      border: `1px solid ${COLORS.glassBorder}`,
      background: COLORS.glass,
      backdropFilter: 'blur(12px)',
    }}>
      {(['light', 'dark'] as const).map(m => (
        <button key={m} onClick={() => toggle(m)} style={{
          padding: '6px 14px', borderRadius: '100px', border: 'none',
          background: mode === m ? COLORS.rose : 'transparent',
          color: mode === m ? COLORS.cream : COLORS.textMuted,
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Default to light mode
    document.documentElement.setAttribute('data-mode', 'light');
    document.documentElement.classList.remove('dark');
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10,
      display: 'flex', flexDirection: 'column',
      background: `linear-gradient(165deg, ${COLORS.bg} 0%, ${COLORS.bgGradient} 50%, ${COLORS.bg} 100%)`,
      color: COLORS.text,
      fontFamily: 'var(--font-b, "DM Sans", sans-serif)',
      overflow: 'hidden',
      justifyContent: 'space-between',
    }}>
      {/* Subtle noise texture */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        opacity: 0.025,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />

      {/* Warm bronze glow accents */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `
          radial-gradient(ellipse 80% 60% at 15% 20%, rgba(164, 119, 100, 0.15) 0%, transparent 60%),
          radial-gradient(ellipse 60% 50% at 85% 80%, rgba(164, 119, 100, 0.08) 0%, transparent 50%)
        `,
      }} />

      {/* Nav */}
      <nav style={{
        position: 'relative', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '24px 28px 0',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'all 0.6s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SLogo />
          <span style={{
            fontFamily: 'var(--font-d, "Syne", sans-serif)',
            fontWeight: 800, fontSize: '16px',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: COLORS.text,
          }}>Sutaeru</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => navigate('/login')} style={{
            padding: '10px 20px', borderRadius: '100px',
            border: `1px solid ${COLORS.glassBorder}`, background: 'transparent',
            fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.07em', textTransform: 'uppercase' as const,
            color: COLORS.textMuted, cursor: 'pointer', transition: 'all .2s',
          }}>Sign in</button>
          <button onClick={() => navigate('/login')} style={{
            padding: '10px 22px', borderRadius: '100px', border: 'none',
            background: COLORS.rose, color: COLORS.cream,
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
        alignItems: 'flex-start', justifyContent: 'center',
        padding: '0 28px',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.8s ease 0.1s',
      }}>
        {/* Eyebrow */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '6px 16px', borderRadius: '100px',
          border: `1px solid ${COLORS.glassBorder}`,
          background: COLORS.glass,
          backdropFilter: 'blur(12px)',
          fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '10px', fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const,
          color: COLORS.chocolateLight,
          marginBottom: '32px',
        }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: COLORS.rose,
            animation: 'breathe 2.5s ease infinite',
          }} />
          Now live
        </div>

        {/* H1 */}
        <h1 style={{
          fontFamily: 'var(--font-d, "Syne", sans-serif)', fontWeight: 800,
          fontSize: 'clamp(42px, 8vw, 64px)',
          lineHeight: 1.05, letterSpacing: '-0.03em',
          color: COLORS.text, marginBottom: '20px', margin: '0 0 20px 0',
        }}>
          One memory.
          <br />
          <span style={{ 
            background: `linear-gradient(135deg, ${COLORS.rose} 0%, ${COLORS.roseDark} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Every model.</span>
        </h1>

        {/* Body */}
        <p style={{
          fontSize: '16px', lineHeight: 1.7,
          color: COLORS.textMuted,
          maxWidth: '320px', marginBottom: '40px', margin: '0 0 40px 0',
        }}>
          Your AI identity layer. One persistent memory that follows you across every model, every conversation, every platform.
        </p>

        {/* CTAs */}
        <div style={{
          display: 'flex', gap: '12px', flexWrap: 'wrap' as const,
        }}>
          <button onClick={() => navigate('/login')} style={{
            padding: '14px 28px', borderRadius: '100px', border: 'none',
            background: COLORS.rose, color: COLORS.cream,
            fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '12px', fontWeight: 800,
            letterSpacing: '0.07em', textTransform: 'uppercase' as const,
            cursor: 'pointer', transition: 'all .22s',
            boxShadow: `0 4px 20px rgba(164, 119, 100, 0.25)`,
          }}>Get started →</button>
          <button onClick={() => navigate('/login')} style={{
            padding: '14px 28px', borderRadius: '100px',
            border: `1px solid ${COLORS.glassBorder}`, background: 'transparent',
            fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '12px', fontWeight: 700,
            letterSpacing: '0.07em', textTransform: 'uppercase' as const,
            color: COLORS.textMuted, cursor: 'pointer', transition: 'all .22s',
          }}>Sign in</button>
        </div>

        {/* Feature pills */}
        <div style={{
          display: 'flex', gap: '12px', marginTop: '48px',
          flexWrap: 'wrap' as const,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(10px)',
          transition: 'all 0.8s ease 0.3s',
        }}>
          {['Persistent Memory', 'Multi-Model', 'Privacy First'].map((feature, i) => (
            <span key={i} style={{
              padding: '8px 16px', borderRadius: '100px',
              border: `1px solid ${COLORS.glassBorder}`,
              background: COLORS.glass,
              fontSize: '11px', fontWeight: 500,
              color: COLORS.chocolateLight,
              letterSpacing: '0.02em',
            }}>{feature}</span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 28px 28px',
        opacity: mounted ? 1 : 0,
        transition: 'all 0.8s ease 0.4s',
      }}>
        <span style={{
          fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '10px', fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const,
          color: COLORS.textMuted,
        }}>© 2026 Sutaeru</span>
        <ModeSwitch />
      </div>

      <style>{`
        @keyframes breathe { 
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(164, 119, 100, 0.4); } 
          50% { opacity: 0.6; transform: scale(0.8); box-shadow: 0 0 10px 4px rgba(164, 119, 100, 0.2); } 
        }
      `}</style>
    </div>
  );
}
