import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";
import { ResetPassword } from "@/components/redo/ResetPassword";

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

export default function ResetPasswordPage() {
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

  const formData = {
    password: form.watch("password"),
    confirmPassword: form.watch("confirmPassword"),
  };
  const formErrors = {
    password: form.formState.errors.password?.message,
    confirmPassword: form.formState.errors.confirmPassword?.message,
  };

  return (
    <ResetPassword
      token={token}
      success={success}
      error={error}
      isPending={resetPasswordMutation.isPending}
      formData={formData}
      formErrors={formErrors}
      onSubmit={(e) => form.handleSubmit(onSubmit)(e as React.FormEvent<HTMLFormElement>)}
      onChange={(field, value) => form.setValue(field as "password" | "confirmPassword", value, { shouldValidate: true })}
    />
  );
}