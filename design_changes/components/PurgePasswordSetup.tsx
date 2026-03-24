import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function PurgePasswordSetup({ onComplete, isModal = false }: { onComplete?: () => void; isModal?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [step, setStep] = useState<"set" | "done">("set");
  const { data: status } = trpc.kemma.hasPurgePassword.useQuery();
  const setMutation = trpc.kemma.setPurgePassword.useMutation({
    onSuccess: () => { setStep("done"); toast.success("Delete password saved"); onComplete?.(); },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!password.trim()) { toast.error("Password cannot be empty"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    if (password.length < 4) { toast.error("Password must be at least 4 characters"); return; }
    setMutation.mutate({ password });
  };

  if (step === "done") return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
      <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--t1, #f2f2f2)", marginBottom: 8 }}>Delete password set</h3>
      <p style={{ fontSize: 14, color: "var(--t2, rgba(255,255,255,0.6))", lineHeight: 1.6 }}>Kemma will ask for this password before permanently deleting any files.</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--t1, #f2f2f2)", marginBottom: 8 }}>🛡️ Set your delete password</h3>
        <p style={{ fontSize: 14, color: "var(--t2, rgba(255,255,255,0.6))", lineHeight: 1.65 }}>Kemma never permanently deletes files without this password. Say it out loud or type it.</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ position: "relative" }}>
          <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="something you will remember"
            style={{ width: "100%", background: "var(--bg-3, rgba(255,255,255,0.06))", border: "1px solid var(--line-1, rgba(255,255,255,0.055))", borderRadius: 12, padding: "12px 44px 12px 16px", fontSize: 15, color: "var(--t1, #f2f2f2)", outline: "none", fontFamily: "inherit" }} />
          <button type="button" onClick={() => setShowPass((s) => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--t3, rgba(255,255,255,0.35))", cursor: "pointer", fontSize: 14 }}>
            {showPass ? "🙈" : "👁️"}
          </button>
        </div>
        <input type={showPass ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="type it again"
          style={{ width: "100%", background: "var(--bg-3, rgba(255,255,255,0.06))", border: `1px solid ${confirm && confirm !== password ? "rgba(220,80,60,.5)" : "var(--line-1, rgba(255,255,255,0.055))"}`, borderRadius: 12, padding: "12px 16px", fontSize: 15, color: "var(--t1, #f2f2f2)", outline: "none", fontFamily: "inherit" }} />
        <button onClick={handleSubmit} disabled={!password || password !== confirm || setMutation.isPending}
          style={{ background: !password || password !== confirm ? "rgba(255,255,255,.06)" : "var(--t1, #f2f2f2)", color: !password || password !== confirm ? "var(--t3, rgba(255,255,255,0.35))" : "#050505", border: "none", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 600, cursor: !password || password !== confirm ? "not-allowed" : "pointer", width: "100%" }}>
          {setMutation.isPending ? "Saving..." : "Save delete password"}
        </button>
      </div>
    </div>
  );
}
