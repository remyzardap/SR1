import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { LandingMark } from "@/components/LandingMark";
import { setAuthToken } from "@/lib/authSession";
import { OrbitalSystem } from "../../landing/FigureEffects";

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
type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function Login() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<'in' | 'up'>('in');
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const utils = trpc.useUtils();

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data: unknown) => {
      const result = data as { token?: unknown } | null;
      if (!setAuthToken(result?.token)) {
        setLoginError('Sign-in succeeded, but no session was returned. Please try again.');
        return;
      }
      await utils.auth.me.invalidate();
      navigate('/chat');
    },
    onError: (e) => setLoginError(e.message || 'Invalid credentials'),
  });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); setRegisterSuccess(true); setTab('in'); },
    onError: (e) => setRegisterError(e.message || 'Registration failed'),
  });

  const onLogin = (d: LoginForm) => {
    setLoginError('');
    loginMutation.mutate({ email: d.email, password: d.password });
  };
  const onRegister = (d: RegisterForm) => {
    setRegisterError('');
    registerMutation.mutate({ name: d.name, email: d.email, password: d.password });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 14px 13px 41px',
    borderRadius: 'var(--r-sm, 12px)',
    background: 'var(--card, rgba(255,255,255,0.07))',
    border: '1px solid var(--glass-border, rgba(255,255,255,0.18))',
    color: 'var(--foreground)',
    fontFamily: 'var(--font-b, "Manrope", sans-serif)',
    fontSize: '16px', outline: 'none',
    WebkitAppearance: 'none' as any,
    transition: 'border-color .2s, background .2s',
    boxSizing: 'border-box' as const,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-d)', fontSize: '9px', fontWeight: 700,
    letterSpacing: '.14em', textTransform: 'uppercase' as const,
    color: 'var(--muted-foreground, rgba(245,242,237,0.40))', padding: '0 3px',
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--background, #0d0a1a)',
      color: 'var(--foreground)',
      fontFamily: 'var(--font-b, "Manrope", sans-serif)',
      padding: '24px',
    }}>
      <div className="sutaeru-desktop-art" aria-hidden="true"><OrbitalSystem visible={true} /></div>
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
          <LandingMark className="sutaeru-login-mark" />
          <span style={{
            fontFamily: 'var(--font-d)', fontWeight: 800, fontSize: '12px',
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
           boxShadow: '0 12px 32px rgba(36,35,32,.08)',
        }}>
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
                   {loginForm.formState.errors.email && <p style={{ fontSize: '11px', color: 'var(--destructive)', margin: 0 }}>{loginForm.formState.errors.email.message}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>⚿</span>
                    <input data-testid="input-password" {...loginForm.register('password')} type="password" placeholder="Your password" style={inputStyle} />
                  </div>
                   {loginForm.formState.errors.password && <p style={{ fontSize: '11px', color: 'var(--destructive)', margin: 0 }}>{loginForm.formState.errors.password.message}</p>}
                </div>
                 <button type="button" style={{ textAlign: 'right' as const, fontSize: '12px', color: 'var(--muted-foreground)', padding: '8px 3px', marginTop: '-4px' }}
                   onClick={() => navigate('/reset-password')}>Forgot password?</button>
                 {loginError && <p style={{ fontSize: '12px', color: 'var(--destructive)', margin: 0, textAlign: 'center' as const }}>{loginError}</p>}
                <button data-testid="button-signin" type="submit" disabled={loginMutation.isPending} style={{
                  width: '100%', padding: '15px', borderRadius: '100px', border: 'none',
                  background: 'var(--btn-fill, #f2f2f2)', color: 'var(--btn-ink, #050505)',
                  fontFamily: 'var(--font-d)', fontSize: '13px', fontWeight: 800,
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
                  {registerForm.formState.errors.name && <p style={{ fontSize: '11px', color: 'var(--destructive)', margin: 0 }}>{registerForm.formState.errors.name.message}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Email</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>✉</span>
                    <input data-testid="input-register-email" {...registerForm.register('email')} type="email" placeholder="you@example.com" style={inputStyle} />
                  </div>
                  {registerForm.formState.errors.email && <p style={{ fontSize: '11px', color: 'var(--destructive)', margin: 0 }}>{registerForm.formState.errors.email.message}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>⚿</span>
                    <input data-testid="input-register-password" {...registerForm.register('password')} type="password" placeholder="Min 8 characters" style={inputStyle} />
                  </div>
                  {registerForm.formState.errors.password && <p style={{ fontSize: '11px', color: 'var(--destructive)', margin: 0 }}>{registerForm.formState.errors.password.message}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={labelStyle}>Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--t3)', pointerEvents: 'none', lineHeight: 1 }}>⚿</span>
                    <input data-testid="input-confirm-password" {...registerForm.register('confirmPassword')} type="password" placeholder="Repeat password" style={inputStyle} />
                  </div>
                  {registerForm.formState.errors.confirmPassword && <p style={{ fontSize: '11px', color: 'var(--destructive)', margin: 0 }}>{registerForm.formState.errors.confirmPassword.message}</p>}
                </div>
                {registerError && <p style={{ fontSize: '12px', color: 'var(--destructive)', margin: 0, textAlign: 'center' as const }}>{registerError}</p>}
                <button data-testid="button-register" type="submit" disabled={registerMutation.isPending} style={{
                  width: '100%', padding: '15px', borderRadius: '100px', border: 'none',
                  background: 'var(--btn-fill, #f2f2f2)', color: 'var(--btn-ink, #050505)',
                  fontFamily: 'var(--font-d)', fontSize: '13px', fontWeight: 800,
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
