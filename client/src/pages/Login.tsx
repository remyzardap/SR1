import React, { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { setAuthToken } from "@/lib/authSession";
import { runRedeemAfterSignIn } from "@/lib/inviteRedeem";
import { Login, type LoginTab, type LoginStep } from "@/components/redo/Login";

export const loginSchema = z.object({
  email: z.string().min(1, "Email or handle is required"),
  password: z.string().min(1, "Password is required"),
});
export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(128),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match", path: ["confirmPassword"],
});
export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;

function isTwoFactorRequiredError(e: unknown): boolean {
  const err = e as { message?: string; data?: { code?: string } | null };
  const code = err?.data?.code;
  return (code === undefined || code === "FORBIDDEN") && /2FA is enabled|two-factor/i.test(err?.message ?? "");
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<LoginTab>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'up' : 'in'));
  const [step, setStep] = useState<LoginStep>('credentials');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [pendingCreds, setPendingCreds] = useState<{ email: string; password: string } | null>(null);
  const sentCode = useRef('');
  const utils = trpc.useUtils();

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const finishSignIn = async (data: unknown, showError: (msg: string) => void) => {
    const result = data as { token?: unknown } | null;
    if (!setAuthToken(result?.token)) {
      showError('Sign-in succeeded, but no session was returned. Please try again.');
      return;
    }
    await utils.auth.me.invalidate();
    navigate('/chat');
    const invite = await runRedeemAfterSignIn();
    if (invite.status === 'redeemed') toast.success(invite.message);
    else if (invite.status === 'failed') toast.error(invite.message);
    else if (invite.status === 'unavailable') toast.info(invite.message);
  };

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data: unknown) => void finishSignIn(data, setLoginError),
    onError: (e) => {
      if (isTwoFactorRequiredError(e)) {
        setLoginError('');
        setCodeError('');
        sentCode.current = '';
        setStep('code');
        return;
      }
      setLoginError(e.message || 'Invalid credentials');
    },
  });
  const login2faMutation = trpc.auth.login2fa.useMutation({
    onSuccess: (data: unknown) => void finishSignIn(data, setCodeError),
    onError: (e) => {
      sentCode.current = '';
      setCodeError(e.message || 'That code did not work. Please try again.');
    },
  });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); setRegisterSuccess(true); setTab('in'); },
    onError: (e) => setRegisterError(e.message || 'Registration failed'),
  });

  const onLogin = (d: LoginForm) => {
    setLoginError('');
    setPendingCreds({ email: d.email, password: d.password });
    loginMutation.mutate(d);
  };
  const submitCode = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 6 || !pendingCreds || sentCode.current === digits || login2faMutation.isPending) return;
    sentCode.current = digits;
    setCodeError('');
    login2faMutation.mutate({ email: pendingCreds.email, password: pendingCreds.password, token: digits });
  };
  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setCodeError('');
    if (digits.length === 6) submitCode(digits);
  };
  const backToCredentials = () => {
    setStep('credentials');
    setCode('');
    setCodeError('');
    setLoginError('');
    sentCode.current = '';
  };
  const onRegister = (d: RegisterForm) => {
    setRegisterError('');
    registerMutation.mutate({ name: d.name, email: d.email, password: d.password });
  };

  const isIn = tab === 'in';
  const showCode = isIn && step === 'code';
  const pending = isIn ? loginMutation.isPending : registerMutation.isPending;
  const codePending = login2faMutation.isPending;

  return (
    <Login
      tab={tab}
      step={step}
      code={code}
      codeError={codeError}
      loginError={loginError}
      registerError={registerError}
      registerSuccess={registerSuccess}
      pending={pending}
      codePending={codePending}
      onTabChange={setTab}
      onLogin={onLogin}
      onRegister={onRegister}
      onCodeSubmit={submitCode}
      onCodeChange={onCodeChange}
      onBackToCredentials={backToCredentials}
      onForgotPassword={() => navigate('/reset-password')}
    />
  );
}