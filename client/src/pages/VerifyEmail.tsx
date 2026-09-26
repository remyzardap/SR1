import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

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
    <div className="min-h-screen flex justify-center items-center p-8">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mb-10">
          <Link href="/" className="inline-flex items-center gap-2 justify-center">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: "var(--accent-color)" }}
            >
              <span className="text-white font-bold text-sm">S</span>
            </div>
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
              style={{ color: "#22c55e" }}
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
            <Link href="/chat">
              <span
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm cursor-pointer"
                style={{
                  background: "var(--accent-color)",
                  color: "#fff",
                }}
              >
                Go to Dashboard
              </span>
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-6">
            <XCircle
              className="w-12 h-12 mx-auto"
              style={{ color: "#ef4444" }}
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
            <Link href="/login">
              <span
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm cursor-pointer"
                style={{
                  background: "var(--accent-color)",
                  color: "#fff",
                }}
              >
                Back to Sign In
              </span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
