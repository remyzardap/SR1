import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { LandingMark } from "@/components/LandingMark";
import { Button } from "@/components/ui/button";

export default function VerifyEmail() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [message, setMessage] = useState<string>("");

  const verifyMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => {
      setStatus("success");
    },
    onError: (err) => {
      setStatus("error");
      setMessage(err.message);
    },
  });

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token found. Please check your link.");
      return;
    }
    verifyMutation.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sutaeru-auth-page min-h-dvh flex justify-center items-center p-4 sm:p-8">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mb-10">
          <Link href="/" className="inline-flex items-center gap-2 justify-center">
             <LandingMark className="sutaeru-login-mark" />
            <span
              className="font-semibold text-lg tracking-tight"
              style={{ color: "var(--foreground)" }}
            >
              Sutaeru
            </span>
          </Link>
        </div>

        {status === "pending" && (
          <div className="space-y-4">
            <Loader2
              className="w-10 h-10 animate-spin mx-auto"
              style={{ color: "var(--accent-color)" }}
            />
            <p style={{ color: "var(--muted-foreground)" }}>
              Verifying your email address…
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-6">
            <CheckCircle
              className="w-12 h-12 mx-auto"
               style={{ color: "var(--state-success)" }}
            />
            <div>
              <h2
                className="text-2xl font-bold tracking-tight mb-2"
                style={{ color: "var(--foreground)" }}
              >
                Email verified!
              </h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                Your email address has been successfully verified.
              </p>
            </div>
             <Button asChild className="min-h-11"><Link href="/chat">Go to Dashboard</Link></Button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-6">
            <XCircle
              className="w-12 h-12 mx-auto"
               style={{ color: "var(--destructive)" }}
            />
            <div>
              <h2
                className="text-2xl font-bold tracking-tight mb-2"
                style={{ color: "var(--foreground)" }}
              >
                Verification failed
              </h2>
              <p style={{ color: "var(--muted-foreground)" }}>
                {message || "This link is invalid or has expired."}
              </p>
            </div>
             <Button asChild className="min-h-11"><Link href="/login">Back to Sign In</Link></Button>
          </div>
        )}
      </div>
    </div>
  );
}
