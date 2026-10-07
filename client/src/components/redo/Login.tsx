import { SutaeruGlyph, SutaeruSeal } from "@/components/brand";
import type { LoginForm, RegisterForm } from "@/pages/Login";

export type LoginTab = "in" | "up";
export type LoginStep = "credentials" | "code";

export interface LoginProps {
  tab: LoginTab;
  step: LoginStep;
  code: string;
  codeError: string;
  loginError: string;
  registerError: string;
  registerSuccess: boolean;
  pending: boolean;
  codePending: boolean;
  onTabChange: (tab: LoginTab) => void;
  onLogin: (data: LoginForm) => void;
  onRegister: (data: RegisterForm) => void;
  onCodeSubmit: (code: string) => void;
  onCodeChange: (code: string) => void;
  onBackToCredentials: () => void;
  onForgotPassword: () => void;
  className?: string;
}

export function Login({
  tab,
  step,
  code,
  codeError,
  loginError,
  registerError,
  registerSuccess,
  pending,
  codePending,
  onTabChange,
  onLogin,
  onRegister,
  onCodeSubmit,
  onCodeChange,
  onBackToCredentials,
  onForgotPassword,
  className,
}: LoginProps) {
  const isIn = tab === "in";
  const showCode = isIn && step === "code";

  return (
    <div className={`sk-auth ${className || ""}`}>
      <span className="sk-plus sk-plus-tl" aria-hidden="true" />
      <span className="sk-plus sk-plus-tr" aria-hidden="true" />
      <span className="sk-plus sk-plus-bl" aria-hidden="true" />
      <span className="sk-plus sk-plus-br" aria-hidden="true" />

      <div className="sk-auth-card">
        <SutaeruGlyph detail="full" size={96} className="sk-auth-mark" />
        <h1 className="sk-auth-title">
          {showCode ? "Second step" : isIn ? "Welcome back" : "Create your account"}
        </h1>
        <p className="sk-auth-sub">
          {showCode
            ? "Enter the 6 digit code from your authenticator app."
            : isIn
            ? "Sign in to pick up where Sutaeru left off."
            : "Start with a private workspace that remembers how you work."}
        </p>

        {registerSuccess && (
          <div className="sk-auth-note" role="status">Account created. Sign in below.</div>
        )}

        {showCode ? (
          <form className="sk-auth-form" onSubmit={(e) => { e.preventDefault(); onCodeSubmit(code); }}>
            <label className="sk-field">
              <span className="sk-label">Authentication code</span>
              <input
                data-testid="input-2fa-code"
                autoFocus
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
              />
            </label>
            {codeError && <p className="sk-field-error sk-auth-error" role="alert">{codeError}</p>}
            <button data-testid="button-verify-2fa" type="submit" disabled={codePending || code.length !== 6} className="sk-auth-submit btn ink big">
              {codePending ? <span className="sk-spinner" aria-hidden="true" /> : "Verify"}
            </button>
            <button type="button" className="sk-auth-link sk-auth-switch" onClick={onBackToCredentials}>Back</button>
          </form>
        ) : isIn ? (
          <form className="sk-auth-form" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); onLogin({ email: fd.get("email") as string, password: fd.get("password") as string }); }}>
            <label className="sk-field">
              <span className="sk-label">Email or @handle</span>
              <input name="email" data-testid="input-email" type="text" autoComplete="username" placeholder="you@company.com" />
            </label>
            <label className="sk-field">
              <span className="sk-label">Password</span>
              <input name="password" data-testid="input-password" type="password" autoComplete="current-password" placeholder="Your password" />
            </label>
            <button type="button" className="sk-auth-link sk-auth-forgot" onClick={onForgotPassword}>Forgot password?</button>
            {loginError && <p className="sk-field-error sk-auth-error" role="alert">{loginError}</p>}
            <button data-testid="button-signin" type="submit" disabled={pending} className="sk-auth-submit btn ink big">
              {pending ? <span className="sk-spinner" aria-hidden="true" /> : "Sign in"}
            </button>
          </form>
        ) : (
          <form className="sk-auth-form" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); onRegister({ name: fd.get("name") as string, email: fd.get("email") as string, password: fd.get("password") as string, confirmPassword: fd.get("confirmPassword") as string }); }}>
            <label className="sk-field">
              <span className="sk-label">Full name</span>
              <input name="name" data-testid="input-name" type="text" autoComplete="name" placeholder="Your name" />
            </label>
            <label className="sk-field">
              <span className="sk-label">Email</span>
              <input name="email" data-testid="input-register-email" type="email" autoComplete="email" placeholder="you@company.com" />
            </label>
            <label className="sk-field">
              <span className="sk-label">Password</span>
              <input name="password" data-testid="input-register-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" />
            </label>
            <label className="sk-field">
              <span className="sk-label">Confirm password</span>
              <input name="confirmPassword" data-testid="input-confirm-password" type="password" autoComplete="new-password" placeholder="Repeat password" />
            </label>
            {registerError && <p className="sk-field-error sk-auth-error" role="alert">{registerError}</p>}
            <button data-testid="button-register" type="submit" disabled={pending} className="sk-auth-submit btn ink big">
              {pending ? <span className="sk-spinner" aria-hidden="true" /> : "Create account"}
            </button>
          </form>
        )}

        {!showCode && (
          <button type="button" className="sk-auth-link sk-auth-switch" onClick={() => onTabChange(isIn ? "up" : "in")}>
            {isIn ? "New to Sutaeru? Create an account" : "Already have an account? Sign in"}
          </button>
        )}
      </div>

      <p className="sk-auth-foot">Search <i>&middot;</i> Research <i>&middot;</i> Do</p>
    </div>
  );
}

export default Login;