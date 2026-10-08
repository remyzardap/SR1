import { SutaeruGlyph, SutaeruSeal } from "@/components/brand";
import { PaperGrain } from "@/components/art";
import { Link } from "wouter";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export type VerifyEmailStatus = "pending" | "success" | "error";

export interface VerifyEmailProps {
  status: VerifyEmailStatus;
  message: string;
  className?: string;
}

export function VerifyEmail({ status, message, className }: VerifyEmailProps) {
  return (
    <div className={`sk-verify-email ${className || ""}`}>
      <PaperGrain />
      <div className="sk-verify-card">
        <Link href="/" className="sk-verify-brand">
          <SutaeruGlyph detail="full" size={72} />
          <span>Sutaeru</span>
          <SutaeruSeal rough={false} className="sk-verify-seal" />
        </Link>

        {status === "pending" && (
          <div className="sk-verify-state">
            <Loader2 className="sk-verify-spinner" aria-hidden="true" />
            <p>Verifying your email address&hellip;</p>
          </div>
        )}

        {status === "success" && (
          <div className="sk-verify-state">
            <CheckCircle className="sk-verify-icon success" aria-hidden="true" />
            <div>
              <h2>Email verified!</h2>
              <p>Your email address has been successfully verified.</p>
            </div>
            <Link href="/chat" className="btn ink big">Go to Dashboard</Link>
          </div>
        )}

        {status === "error" && (
          <div className="sk-verify-state">
            <XCircle className="sk-verify-icon error" aria-hidden="true" />
            <div>
              <h2>Verification failed</h2>
              <p>{message || "This link is invalid or has expired."}</p>
            </div>
            <Link href="/login" className="btn ink big">Back to Sign In</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default VerifyEmail;