import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { VerifyEmail, type VerifyEmailStatus } from "@/components/redo/VerifyEmail";

export default function VerifyEmailPage() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [status, setStatus] = useState<VerifyEmailStatus>("pending");
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

  return <VerifyEmail status={status} message={message} />;
}