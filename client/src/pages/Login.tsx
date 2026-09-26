import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

const loginSchema = z.object({
  email: z.string().min(1, "Email or handle is required"),
  password: z.string().min(1, "Password is required"),
});
const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(128),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match", path: ["confirmPassword"],
});
const founderSchema = z.object({
  handle: z.string().min(1, "Handle is required"),
  password: z.string().min(1, "Password is required"),
});
type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;
type FounderForm = z.infer<typeof founderSchema>;

const SLogo = () => (
  <svg width="64" height="38" viewBox="0 0 96 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M48,28 C45,20 38,8 26,8 C12,8 4,17 4,28 C4,39 12,48 26,48 C38,48 45,36 48,28 C51,20 58,8 70,8 C84,8 92,17 92,28 C92,39 84,48 70,48 C58,48 51,36 48,28Z" stroke="currentColor" strokeWidth="5.5" strokeLinejoin="round" fill="none"/>
    <line x1="62" y1="19" x2="78" y2="19" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    <path d="M60,28 C60,24.5 63.5,22.5 66.5,24 C67,21.5 70,20.5 72.5,22 C74.5,20.5 79,21.5 79,25 C79,28 76,29.5 73,29 C72,30.5 67,30.5 65.5,29 C62.5,29 60,28.8 60,28Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <line x1="59" y1="34" x2="81" y2="34" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    <path d="M67.5,34 L70,38.5 L72.5,34" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

function FounderLoginForm({ inputStyle, labelStyle }: { inputStyle: React.CSSProperties; labelStyle: React.CSSProperties }) {
  const [, navigate] = useLocation();
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || !password.trim()) {
      setError('Please enter both handle and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/trpc/auth.founderLogin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ json: { handle: handle.trim(), password } }),
      });
      const data = await res.json();
      if (data?.result?.data?.json?.success) {
        window.location.href = '/chat';
      } else {
        const msg = data?.error?.json?.message || data?.error?.message || 'Invalid handle or password';
        setError(msg);
      }
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={labelStyle}>Handle</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>@</span>
          <input data-testid="input-founder-handle" type="text" placeholder="yourhandle" style={inputStyle} autoCapitalize="none" autoCorrect="off" autoComplete="username" value={handle} onChange={e => setHandle(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={labelStyle}>Password</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>⚿</span>
          <input data-testid="input-founder-password" type="password" placeholder="Your password" style={inputStyle} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
      </div>
      {error && <p data-testid="text-founder-error" style={{ fontSize: '12px', color: '#f87171', margin: 0, textAlign: 'center' as const }}>{error}</p>}
      <button data-testid="button-founder-login" type="submit" disabled={loading} style={{
        width: '100%', padding: '15px', borderRadius: 'var(--r-sm, 12px)', border: 'none',
        background: 'var(--btn-fill, #f2f2f2)', color: 'var(--btn-ink, #050505)',
        fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '13px', fontWeight: 800,
        letterSpacing: '.06em', textTransform: 'uppercase' as const,
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all .22s', marginTop: '2px', opacity: loading ? 0.6 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
      }}>
        {loading ? (
          <span style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid var(--btn-ink)', borderTopColor: 'transparent', animation: 'spin .6s linear infinite', display: 'inline-block' }} />
        ) : 'Enter →'}
      </button>
    </form>
  );
}

export default function Login() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<'in' | 'up' | 'founder'>('in');
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [founderError, setFounderError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const utils = trpc.useUtils();

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });
  const founderForm = useForm<FounderForm>({ resolver: zodResolver(founderSchema), defaultValues: { handle: '', password: '' } });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); navigate('/chat'); },
    onError: (e) => setLoginError(e.message || 'Invalid credentials'),
  });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); setRegisterSuccess(true); setTab('in'); },
    onError: (e) => setRegisterError(e.message || 'Registration failed'),
  });
  const founderMutation = trpc.auth.founderLogin.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); navigate('/chat'); },
    onError: (e) => setFounderError(e.message || 'Invalid handle or password'),
  });

  const onLogin = (d: LoginForm) => {
    setLoginError('');
    loginMutation.mutate({ email: d.email, password: d.password });
  };
  const onRegister = (d: RegisterForm) => {
    setRegisterError('');
    registerMutation.mutate({ name: d.name, email: d.email, password: d.password });
  };
  const onFounder = (d: FounderForm) => {
    setFounderError('');
    founderMutation.mutate({ handle: d.handle, password: d.password });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 14px 13px 41px',
    borderRadius: 'var(--r-sm, 12px)',
    background: 'var(--card, rgba(255,255,255,0.07))',
    border: '1px solid var(--glass-border, rgba(255,255,255,0.18))',
    color: 'var(--foreground, #f5f2ed)',
    fontFamily: 'var(--font-b, "DM Sans", sans-serif)',
    fontSize: '14px', outline: 'none',
    WebkitAppearance: 'none' as any,
    transition: 'border-color .2s, background .2s',
    boxSizing: 'border-box' as const,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '9px', fontWeight: 700,
    letterSpacing: '.14em', textTransform: 'uppercase' as const,
    color: 'var(--muted-foreground, rgba(245,242,237,0.40))', padding: '0 3px',
  };

  const tabs = [
    { key: 'in', label: 'Sign In' },
    { key: 'founder', label: 'Founder' },
  ] as const;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--background, #0d0a1a)',
      color: 'var(--foreground, #f5f2ed)',
      fontFamily: 'var(--font-b, "DM Sans", sans-serif)',
      padding: '24px',
    }}>
      {/* Radial glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(255,255,255,0.022) 0%, transparent 70%)',
      }} />

      <div style={{
        width: '100%', maxWidth: '340px', position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        
      }}>
        {/* Brand */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          marginBottom: '44px',
        }}>
          <SLogo />
          <span style={{
            fontFamily: 'var(--font-d, "Syne", sans-serif)', fontWeight: 800, fontSize: '12px',
            letterSpacing: '.2em', textTransform: 'uppercase' as const,
            color: 'var(--muted-foreground, rgba(245,242,237,0.55))',
          }}>Sutaeru</span>
          <span style={{ fontSize: '13px', color: 'var(--muted-foreground, rgba(245,242,237,0.40))', letterSpacing: '.01em' }}>
            One identity. Every model. For life.
          </span>
        </div>

        {/* Card */}
        <div style={{
          width: '100%',
          background: 'var(--glass-bg, rgba(255,255,255,0.10))',
          backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.18))',
          borderRadius: 'var(--r-lg, 24px)',
          padding: '5px',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.015) inset, 0 24px 64px rgba(0,0,0,0.35)',
        }}>
          {/* Tab row */}
          <div style={{
            display: 'flex', gap: '3px', padding: '3px',
            background: 'var(--glass-bg, rgba(255,255,255,0.10))',
            borderRadius: 'calc(var(--r-lg, 24px) - 5px)',
            marginBottom: '6px',
          }}>
            {tabs.map(t => (
              <button
                key={t.key}
                data-testid={`tab-${t.key}`}
                onClick={() => setTab(t.key)}
                style={{
                  flex: 1, padding: '11px',
                  borderRadius: 'calc(var(--r-lg, 24px) - 8px)',
                  fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '11px', fontWeight: 700,
                  letterSpacing: '.08em', textTransform: 'uppercase' as const, textAlign: 'center' as const,
                  color: tab === t.key ? 'var(--t1, #f2f2f2)' : 'var(--t3, rgba(242,242,242,0.22))',
                  cursor: 'pointer', transition: 'all .22s', border: 'none',
                  background: tab === t.key ? 'var(--bg-raise2, #141414)' : 'transparent',
                  boxShadow: tab === t.key ? '0 2px 8px rgba(0,0,0,.25)' : 'none',
                }}
              >{t.label}</button>
            ))}
          </div>

          {/* Form inner */}
          <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {registerSuccess && (
              <div style={{
                padding: '10px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                fontSize: '12px', color: 'var(--muted-foreground, rgba(245,242,237,0.55))', textAlign: 'center' as const,
              }}>Account created! Sign in below.</div>
            )}

            {tab === 'in' && (
              <form onSubmit={loginForm.handleSubmit(onLogin)} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Email or @handle</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>✉</span>
                    <input data-testid="input-email" {...loginForm.register('email')} type="text" placeholder="you@example.com or @handle" style={inputStyle} />
                  </div>
                  {loginForm.formState.errors.email && <p style={{ fontSize: '11px', color: '#f87171', margin: 0 }}>{loginForm.formState.errors.email.message}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>⚿</span>
                    <input data-testid="input-password" {...loginForm.register('password')} type="password" placeholder="Your password" style={inputStyle} />
                  </div>
                  {loginForm.formState.errors.password && <p style={{ fontSize: '11px', color: '#f87171', margin: 0 }}>{loginForm.formState.errors.password.message}</p>}
                </div>
                <div style={{ textAlign: 'right' as const, fontSize: '12px', color: 'var(--t3)', cursor: 'pointer', padding: '0 3px', marginTop: '-4px' }}
                  onClick={() => navigate('/reset-password')}>Forgot password?</div>
                {loginError && <p style={{ fontSize: '12px', color: '#f87171', margin: 0, textAlign: 'center' as const }}>{loginError}</p>}
                <button data-testid="button-signin" type="submit" disabled={loginMutation.isPending} style={{
                  width: '100%', padding: '15px', borderRadius: 'var(--r-sm, 12px)', border: 'none',
                  background: 'var(--btn-fill, #f2f2f2)', color: 'var(--btn-ink, #050505)',
                  fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '13px', fontWeight: 800,
                  letterSpacing: '.06em', textTransform: 'uppercase' as const,
                  cursor: loginMutation.isPending ? 'not-allowed' : 'pointer',
                  transition: 'all .22s', marginTop: '2px', opacity: loginMutation.isPending ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                }}>
                  {loginMutation.isPending ? (
                    <span style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid var(--btn-ink)', borderTopColor: 'transparent', animation: 'spin .6s linear infinite', display: 'inline-block' }} />
                  ) : 'Sign In →'}
                </button>
              </form>
            )}

            {tab === 'up' && (
              <form onSubmit={registerForm.handleSubmit(onRegister)} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>✦</span>
                    <input data-testid="input-name" {...registerForm.register('name')} type="text" placeholder="Your name" style={inputStyle} />
                  </div>
                  {registerForm.formState.errors.name && <p style={{ fontSize: '11px', color: '#f87171', margin: 0 }}>{registerForm.formState.errors.name.message}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Email</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>✉</span>
                    <input data-testid="input-register-email" {...registerForm.register('email')} type="email" placeholder="you@example.com" style={inputStyle} />
                  </div>
                  {registerForm.formState.errors.email && <p style={{ fontSize: '11px', color: '#f87171', margin: 0 }}>{registerForm.formState.errors.email.message}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>⚿</span>
                    <input data-testid="input-register-password" {...registerForm.register('password')} type="password" placeholder="Min 8 characters" style={inputStyle} />
                  </div>
                  {registerForm.formState.errors.password && <p style={{ fontSize: '11px', color: '#f87171', margin: 0 }}>{registerForm.formState.errors.password.message}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>⚿</span>
                    <input data-testid="input-confirm-password" {...registerForm.register('confirmPassword')} type="password" placeholder="Repeat password" style={inputStyle} />
                  </div>
                  {registerForm.formState.errors.confirmPassword && <p style={{ fontSize: '11px', color: '#f87171', margin: 0 }}>{registerForm.formState.errors.confirmPassword.message}</p>}
                </div>
                {registerError && <p style={{ fontSize: '12px', color: '#f87171', margin: 0, textAlign: 'center' as const }}>{registerError}</p>}
                <button data-testid="button-register" type="submit" disabled={registerMutation.isPending} style={{
                  width: '100%', padding: '15px', borderRadius: 'var(--r-sm, 12px)', border: 'none',
                  background: 'var(--btn-fill, #f2f2f2)', color: 'var(--btn-ink, #050505)',
                  fontFamily: 'var(--font-d, "Syne", sans-serif)', fontSize: '13px', fontWeight: 800,
                  letterSpacing: '.06em', textTransform: 'uppercase' as const,
                  cursor: registerMutation.isPending ? 'not-allowed' : 'pointer',
                  transition: 'all .22s', marginTop: '2px', opacity: registerMutation.isPending ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                }}>
                  {registerMutation.isPending ? (
                    <span style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid var(--btn-ink)', borderTopColor: 'transparent', animation: 'spin .6s linear infinite', display: 'inline-block' }} />
                  ) : 'Create Account →'}
                </button>
              </form>
            )}

            {tab === 'founder' && (
              <FounderLoginForm inputStyle={inputStyle} labelStyle={labelStyle} />
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes rise { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { to { transform:rotate(360deg) } }
      `}</style>
    </div>
  );
}
