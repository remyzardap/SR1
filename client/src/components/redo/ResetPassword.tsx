import { SutaeruGlyph, SutaeruSeal } from "@/components/brand";
import { PaperGrain } from "@/components/art";
import { Link } from "wouter";
import { ArrowRight, Loader2, CheckCircle } from "lucide-react";

export interface ResetPasswordProps {
  token: string | null;
  success: boolean;
  error: string | null;
  isPending: boolean;
  formData: { password: string; confirmPassword: string };
  formErrors: { password?: string; confirmPassword?: string };
  onSubmit: (e: React.FormEvent) => void;
  onChange: (field: "password" | "confirmPassword", value: string) => void;
  className?: string;
}

export function ResetPassword({
  token,
  success,
  error,
  isPending,
  formData,
  formErrors,
  onSubmit,
  onChange,
  className,
}: ResetPasswordProps) {
  if (success) {
    return (
      <div className={`sk-reset-password ${className || ""}`}>
      <PaperGrain />
        <div className="sk-reset-card">
          <Link href="/" className="sk-reset-brand">
            <SutaeruGlyph detail="full" size={72} />
            <span>Sutaeru</span>
            <SutaeruSeal rough={false} className="sk-reset-seal" />
          </Link>
          <div className="sk-reset-state success">
            <CheckCircle className="sk-reset-icon" aria-hidden="true" />
            <p>Your password has been reset successfully.</p>
            <Link href="/login" className="btn ink big"><ArrowRight className="ico" aria-hidden="true" /> Back to Sign In</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className={`sk-reset-password ${className || ""}`}>
      <PaperGrain />
        <div className="sk-reset-card">
          <Link href="/" className="sk-reset-brand">
            <SutaeruGlyph detail="full" size={72} />
            <span>Sutaeru</span>
            <SutaeruSeal rough={false} className="sk-reset-seal" />
          </Link>
          <div className="sk-reset-state error">
            <p>No reset token found. Please check your link.</p>
            <Link href="/login" className="btn ink big"><ArrowRight className="ico" aria-hidden="true" /> Back to Sign In</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`sk-reset-password ${className || ""}`}>
      <PaperGrain />
      <div className="sk-reset-card">
        <Link href="/" className="sk-reset-brand">
          <SutaeruGlyph detail="full" size={72} />
          <span>Sutaeru</span>
          <SutaeruSeal rough={false} className="sk-reset-seal" />
        </Link>

        <div className="sk-reset-header">
          <h2>Reset your password</h2>
          <p>Enter a new password for your account.</p>
        </div>

        {error && <div className="sk-field-error sk-auth-error" role="alert">{error}</div>}

        <form onSubmit={onSubmit} className="sk-auth-form">
          <label className="sk-field">
            <span className="sk-label">New Password</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
              value={formData.password}
              onChange={(e) => onChange("password", e.target.value)}
            />
            {formErrors.password && <span className="sk-field-error">{formErrors.password}</span>}
          </label>
          <label className="sk-field">
            <span className="sk-label">Confirm New Password</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
              value={formData.confirmPassword}
              onChange={(e) => onChange("confirmPassword", e.target.value)}
            />
            {formErrors.confirmPassword && <span className="sk-field-error">{formErrors.confirmPassword}</span>}
          </label>

          <button type="submit" disabled={isPending} className="sk-auth-submit btn ink big">
            {isPending ? (
              <>
                <Loader2 className="sk-spinner" aria-hidden="true" />
                Resetting...
              </>
            ) : (
              <>
                Reset Password
                <ArrowRight className="ico" aria-hidden="true" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ResetPassword;