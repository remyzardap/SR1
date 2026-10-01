import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { LandingMark } from "@/components/LandingMark";
import { setAuthToken } from "@/lib/authSession";

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
  const [tab, setTab] = useState<'in' | 'up'>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'up' : 'in'));
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

  const isIn = tab === 'in';
  const pending = isIn ? loginMutation.isPending : registerMutation.isPending;

  return (
    <div className="sk-auth">
      <span className="sk-plus sk-plus-tl" aria-hidden="true" />
      <span className="sk-plus sk-plus-tr" aria-hidden="true" />
      <span className="sk-plus sk-plus-bl" aria-hidden="true" />
      <span className="sk-plus sk-plus-br" aria-hidden="true" />

      <div className="sk-auth-card">
        <LandingMark className="sk-auth-mark" />
        <h1 className="sk-auth-title">{isIn ? 'Welcome back' : 'Create your account'}</h1>
        <p className="sk-auth-sub">{isIn ? 'Sign in to pick up where Sutaeru left off.' : 'Start with a private workspace that remembers how you work.'}</p>

        {registerSuccess && <div className="sk-auth-note" role="status">Account created. Sign in below.</div>}

        {isIn ? (
          <form className="sk-auth-form" onSubmit={loginForm.handleSubmit(onLogin)}>
            <label className="sk-field">
              <span className="sk-label">Email or @handle</span>
              <input data-testid="input-email" {...loginForm.register('email')} type="text" autoComplete="username" placeholder="you@company.com" />
              {loginForm.formState.errors.email && <span className="sk-field-error">{loginForm.formState.errors.email.message}</span>}
            </label>
            <label className="sk-field">
              <span className="sk-label">Password</span>
              <input data-testid="input-password" {...loginForm.register('password')} type="password" autoComplete="current-password" placeholder="Your password" />
              {loginForm.formState.errors.password && <span className="sk-field-error">{loginForm.formState.errors.password.message}</span>}
            </label>
            <button type="button" className="sk-auth-link sk-auth-forgot" onClick={() => navigate('/reset-password')}>Forgot password?</button>
            {loginError && <p className="sk-field-error sk-auth-error" role="alert">{loginError}</p>}
            <button data-testid="button-signin" type="submit" disabled={pending} className="sk-auth-submit">
              {pending ? <span className="sk-spinner" /> : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className="sk-auth-form" onSubmit={registerForm.handleSubmit(onRegister)}>
            <label className="sk-field">
              <span className="sk-label">Full name</span>
              <input data-testid="input-name" {...registerForm.register('name')} type="text" autoComplete="name" placeholder="Your name" />
              {registerForm.formState.errors.name && <span className="sk-field-error">{registerForm.formState.errors.name.message}</span>}
            </label>
            <label className="sk-field">
              <span className="sk-label">Email</span>
              <input data-testid="input-register-email" {...registerForm.register('email')} type="email" autoComplete="email" placeholder="you@company.com" />
              {registerForm.formState.errors.email && <span className="sk-field-error">{registerForm.formState.errors.email.message}</span>}
            </label>
            <label className="sk-field">
              <span className="sk-label">Password</span>
              <input data-testid="input-register-password" {...registerForm.register('password')} type="password" autoComplete="new-password" placeholder="At least 8 characters" />
              {registerForm.formState.errors.password && <span className="sk-field-error">{registerForm.formState.errors.password.message}</span>}
            </label>
            <label className="sk-field">
              <span className="sk-label">Confirm password</span>
              <input data-testid="input-confirm-password" {...registerForm.register('confirmPassword')} type="password" autoComplete="new-password" placeholder="Repeat password" />
              {registerForm.formState.errors.confirmPassword && <span className="sk-field-error">{registerForm.formState.errors.confirmPassword.message}</span>}
            </label>
            {registerError && <p className="sk-field-error sk-auth-error" role="alert">{registerError}</p>}
            <button data-testid="button-register" type="submit" disabled={pending} className="sk-auth-submit">
              {pending ? <span className="sk-spinner" /> : 'Create account'}
            </button>
          </form>
        )}

        <button type="button" className="sk-auth-link sk-auth-switch" onClick={() => { setLoginError(''); setRegisterError(''); setTab(isIn ? 'up' : 'in'); }}>
          {isIn ? 'New to Sutaeru? Create an account' : 'Already have an account? Sign in'}
        </button>
      </div>

      <p className="sk-auth-foot">Search <i>&middot;</i> Research <i>&middot;</i> Do</p>
    </div>
  );
}
