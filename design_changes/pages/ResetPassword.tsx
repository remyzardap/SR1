
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";
import { Loader2, ArrowRight } from "lucide-react";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const onSubmit = (data: ResetPasswordForm) => {
    if (!token) {
      setError("No reset token found. Please check your link.");
      return;
    }
    setError(null);
    resetPasswordMutation.mutate({ token, password: data.password });
  };

  return (
    <div className="min-h-screen bg-sutaeru flex justify-center items-center p-8">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-7 h-7 bg-white rounded-xl flex items-center justify-center">
              <span className="text-black font-bold text-sm">S</span>
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">
              Sutaeru
            </span>
          </Link>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
            Reset your password
          </h2>
          <p className="text-[#7a7670]/70 text-sm">
            Enter a new password for your account.
          </p>
        </div>

        {success ? (
          <div className="text-center">
            <p className="text-green-400 mb-6">Your password has been reset successfully.</p>
            <Link href="/login">
              <a className="w-full btn-primary-teal font-medium text-sm py-3 rounded-xl hover:bg-[#e5e5e5] active:bg-[#cccccc] transition-colors flex items-center justify-center gap-2">
                Back to Sign In
                <ArrowRight className="w-4 h-4" />
              </a>
            </Link>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {error && (
              <div className="border border-[rgba(255,255,255,0.05)] glass rounded-xl px-4 py-3 text-sm text-[#c8c4be]">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs text-[#7a7670]/70 uppercase tracking-widest font-medium">
                New Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full glass border border-[rgba(255,255,255,0.05)] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[rgba(122,118,112,0.6)] focus:outline-none focus:border-[rgba(232,68,42,0.5)] transition-colors"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-[#666666]">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-[#7a7670]/70 uppercase tracking-widest font-medium">
                Confirm New Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full glass border border-[rgba(255,255,255,0.05)] rounded-xl px-4 py-3 text-sm text-[#f5f5f5] placeholder-[rgba(122,118,112,0.6)] focus:outline-none focus:border-[rgba(232,68,42,0.5)] transition-colors"
                {...form.register("confirmPassword")}
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-xs text-[#666666]">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={resetPasswordMutation.isPending}
              className="w-full btn-primary-teal font-medium text-sm py-3 rounded-xl hover:bg-[#e5e5e5] active:bg-[#cccccc] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {resetPasswordMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  Reset Password
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
