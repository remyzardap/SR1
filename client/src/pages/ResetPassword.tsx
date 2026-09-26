
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";
import { Loader2, ArrowRight } from "lucide-react";
import { LandingMark } from "@/components/LandingMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="sutaeru-auth-page min-h-dvh bg-sutaeru flex justify-center items-center p-4 sm:p-8">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <LandingMark className="sutaeru-login-mark" />
            <span className="text-foreground font-semibold text-lg">
              Sutaeru
            </span>
          </Link>
        </div>

        <div className="mb-8">
           <h2 className="text-2xl font-bold text-foreground mb-2">
            Reset your password
          </h2>
           <p className="text-muted-foreground text-sm">
            Enter a new password for your account.
          </p>
        </div>

        {success ? (
          <div className="text-center">
             <p className="text-[var(--state-success)] mb-6">Your password has been reset successfully.</p>
             <Button asChild className="w-full min-h-11"><Link href="/login">
                Back to Sign In
                <ArrowRight className="w-4 h-4" />
               </Link></Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {error && (
               <div className="border border-destructive/30 bg-destructive/5 rounded-md px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
               <label htmlFor="new-password" className="block text-xs text-muted-foreground uppercase font-medium">
                New Password
              </label>
               <Input
                 id="new-password"
                type="password"
                placeholder="••••••••"
                 className="w-full min-h-11"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                 <p className="text-xs text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
               <label htmlFor="confirm-password" className="block text-xs text-muted-foreground uppercase font-medium">
                Confirm New Password
              </label>
               <Input
                 id="confirm-password"
                type="password"
                placeholder="••••••••"
                 className="w-full min-h-11"
                {...form.register("confirmPassword")}
              />
              {form.formState.errors.confirmPassword && (
                 <p className="text-xs text-destructive">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

             <Button
              type="submit"
              disabled={resetPasswordMutation.isPending}
               className="w-full min-h-11 mt-2"
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
             </Button>
          </form>
        )}
      </div>
    </div>
  );
}
