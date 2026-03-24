import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "sonner";
import {
  Building2, Plus, Pencil, Trash2, Check, Loader2,
  ChevronRight, Briefcase, Globe, X,
} from "lucide-react";

// ─── Currency options ─────────────────────────────────────────────────────────
const CURRENCIES = [
  { value: "IDR", label: "IDR — Indonesian Rupiah" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "SGD", label: "SGD — Singapore Dollar" },
  { value: "MYR", label: "MYR — Malaysian Ringgit" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "JPY", label: "JPY — Japanese Yen" },
] as const;

// ─── Create / Edit modal ──────────────────────────────────────────────────────
interface BusinessFormProps {
  initial?: { id: number; name: string; currency: string };
  onClose: () => void;
  onSaved: () => void;
}

function BusinessForm({ initial, onClose, onSaved }: BusinessFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "IDR");
  const utils = trpc.useUtils();

  const createMutation = trpc.businesses.create.useMutation({
    onSuccess: () => {
      utils.businesses.list.invalidate();
      toast.success("Business created");
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.businesses.update.useMutation({
    onSuccess: () => {
      utils.businesses.list.invalidate();
      toast.success("Business updated");
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (initial) {
      updateMutation.mutate({ id: initial.id, name: name.trim(), currency: currency as any });
    } else {
      createMutation.mutate({ name: name.trim(), currency: currency as any });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 relative"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(32px)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "var(--accent-dim)", boxShadow: "0 0 16px var(--accent-glow)" }}
            >
              <Building2 className="w-4 h-4" style={{ color: "var(--accent-color)" }} />
            </div>
            <h2 className="text-base font-semibold text-white/90">
              {initial ? "Edit Business" : "New Business"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Business name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-white/50 uppercase tracking-widest">
              Business Name
            </label>
            <input
              className="input-glass"
              placeholder="e.g. Acme Corp, My Startup"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              required
              autoFocus
            />
          </div>

          {/* Currency */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-white/50 uppercase tracking-widest">
              Default Currency
            </label>
            <select
              className="input-glass"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ cursor: "pointer" }}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value} style={{ background: "#1a1030" }}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/50 transition-colors"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{
                background: "var(--accent-color)",
                boxShadow: "0 0 20px var(--accent-glow)",
                opacity: isLoading || !name.trim() ? 0.6 : 1,
              }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {initial ? "Save Changes" : "Create Business"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete confirmation modal ────────────────────────────────────────────────
function DeleteConfirm({
  business,
  onClose,
  onDeleted,
}: {
  business: { id: number; name: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const utils = trpc.useUtils();
  const deleteMutation = trpc.businesses.delete.useMutation({
    onSuccess: () => {
      utils.businesses.list.invalidate();
      toast.success(`"${business.name}" deleted`);
      onDeleted();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(32px)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex flex-col items-center gap-4 text-center mb-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white/90 mb-1">Delete Business?</h3>
            <p className="text-sm text-white/50">
              <span className="text-white/70 font-medium">"{business.name}"</span> will be permanently
              deleted. Receipts, tasks, and procurement records linked to this business will be unlinked
              but not deleted.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/50 transition-colors"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => deleteMutation.mutate({ id: business.id })}
            disabled={deleteMutation.isPending}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all"
            style={{ background: "rgba(239,68,68,0.80)", boxShadow: "0 0 20px rgba(239,68,68,0.3)" }}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Business page ───────────────────────────────────────────────────────
export default function BusinessPage() {
  const { businesses, activeBusiness, setActiveBusiness, isLoading } = useBusiness();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: number; name: string; currency: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  return (
    <div className="min-h-screen bg-sutaeru">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Page header */}
        <div className="page-header mb-8">
          <div className="flex items-center gap-4">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "var(--accent-dim)", boxShadow: "0 0 24px var(--accent-glow)" }}
            >
              <Briefcase className="w-5 h-5" style={{ color: "var(--accent-color)" }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white/90 tracking-tight">Businesses</h1>
              <p className="text-sm text-white/40 mt-0.5">
                Create and manage business profiles. Receipts, tasks, and procurement records are scoped per business.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="pill-btn flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Business</span>
          </button>
        </div>

        {/* Business list */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-20 rounded-2xl animate-pulse"
                style={{ background: "rgba(255,255,255,0.05)" }}
              />
            ))}
          </div>
        ) : businesses.length === 0 ? (
          // Empty state
          <div
            className="glass-card flex flex-col items-center gap-5 py-16 text-center"
          >
            <div
              className="w-16 h-16 rounded-3xl flex items-center justify-center"
              style={{ background: "var(--accent-dim)", boxShadow: "0 0 32px var(--accent-glow)" }}
            >
              <Building2 className="w-7 h-7" style={{ color: "var(--accent-color)" }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white/80 mb-1">No businesses yet</h3>
              <p className="text-sm text-white/40 max-w-xs">
                Create your first business to start tracking receipts, tasks, and procurement.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="pill-btn flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Business
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {businesses.map((biz) => {
              const isActive = activeBusiness?.id === biz.id;
              return (
                <div
                  key={biz.id}
                  className="glass-card group flex items-center gap-4 cursor-pointer transition-all"
                  style={isActive ? {
                    borderColor: "var(--accent-border)",
                    boxShadow: "0 0 0 1px var(--accent-border), 0 0 24px var(--accent-glow)",
                  } : {}}
                  onClick={() => setActiveBusiness(isActive ? null : biz)}
                >
                  {/* Icon */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all"
                    style={{
                      background: isActive ? "var(--accent-dim)" : "rgba(255,255,255,0.06)",
                      boxShadow: isActive ? "0 0 16px var(--accent-glow)" : "none",
                    }}
                  >
                    <Building2
                      className="w-5 h-5 transition-colors"
                      style={{ color: isActive ? "var(--accent-color)" : "rgba(255,255,255,0.40)" }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white/90 truncate">{biz.name}</span>
                      {isActive && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                          style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
                        >
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-white/35">
                        <Globe className="w-3 h-3" />
                        {biz.currency ?? "IDR"}
                      </span>
                      <span className="text-xs text-white/25">
                        Created {new Date(biz.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTarget({ id: biz.id, name: biz.name, currency: biz.currency ?? "IDR" });
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5 text-white/50" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: biz.id, name: biz.name });
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                      style={{ background: "rgba(239,68,68,0.10)" }}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400/70" />
                    </button>
                  </div>

                  <ChevronRight
                    className="w-4 h-4 text-white/20 shrink-0 transition-colors group-hover:text-white/40"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Info callout */}
        {businesses.length > 0 && (
          <div
            className="mt-6 rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center mt-0.5 shrink-0"
              style={{ background: "var(--accent-dim)" }}
            >
              <span className="text-[10px] font-bold" style={{ color: "var(--accent-color)" }}>i</span>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              Click a business to set it as active. The active business is used as the default scope
              for Receipts, Tasks, Procurement, and Reports. You can change it at any time from the
              sidebar switcher or this page.
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <BusinessForm
          onClose={() => setShowCreate(false)}
          onSaved={() => setShowCreate(false)}
        />
      )}
      {editTarget && (
        <BusinessForm
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          business={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            // If the deleted business was active, clear it
            if (activeBusiness?.id === deleteTarget.id) setActiveBusiness(null);
          }}
        />
      )}
    </div>
  );
}
