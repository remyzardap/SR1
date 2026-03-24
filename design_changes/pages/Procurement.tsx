import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, ShoppingCart, Loader2, CheckCircle, XCircle, Pencil, Trash2 } from "lucide-react";

type ProcStatus = "open" | "in_review" | "approved" | "rejected" | "completed";

function procStatusColor(s: string) {
  switch (s) {
    case "approved": case "completed": return "text-green-700 border-green-200 bg-green-50";
    case "in_review": return "text-blue-700 border-blue-200 bg-blue-50";
    case "rejected": return "text-red-700 border-red-200 bg-red-50";
    default: return "text-gray-700 border-gray-200 bg-gray-50";
  }
}

const emptyForm = { description: "", quantity: 1, budgetPerUnit: "", currency: "IDR", location: "", vendorName: "", vendorContact: "" };

export default function Procurement() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [form, setForm] = useState({ ...emptyForm });

  const { data: items, isLoading } = trpc.procurement.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
    offset: 0,
  });

  const createMutation = trpc.procurement.create.useMutation({
    onSuccess: () => { utils.procurement.list.invalidate(); setCreateOpen(false); setForm({ ...emptyForm }); toast.success("Procurement request created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.procurement.update.useMutation({
    onSuccess: () => { utils.procurement.list.invalidate(); setEditItem(null); toast.success("Updated"); },
    onError: (e) => toast.error(e.message),
  });

  const approveMutation = trpc.procurement.approve.useMutation({
    onSuccess: () => { utils.procurement.list.invalidate(); setApproveTarget(null); setApprovalNote(""); toast.success("Procurement approved"); },
  });

  const rejectMutation = trpc.procurement.reject.useMutation({
    onSuccess: () => { utils.procurement.list.invalidate(); setRejectTarget(null); setApprovalNote(""); toast.success("Procurement rejected"); },
  });

  const deleteMutation = trpc.procurement.delete.useMutation({
    onSuccess: () => { utils.procurement.list.invalidate(); toast.success("Deleted"); },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Procurement</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage procurement requests and supplier sourcing</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Request
        </Button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 flex-wrap">
        {["all", "open", "in_review", "approved", "rejected", "completed"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className="capitalize"
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !items || items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 opacity-30" />
            <p className="text-sm">No procurement requests found</p>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>Create first request</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-snug line-clamp-2">{item.description}</CardTitle>
                  <Badge variant="outline" className={`text-xs shrink-0 ${procStatusColor(item.status)}`}>
                    {item.status.replace("_", " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className="font-medium">{item.quantity ?? 1} units</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Budget/unit</p>
                    <p className="font-medium">{item.budgetPerUnit ? formatCurrency(parseFloat(item.budgetPerUnit), item.currency ?? "IDR") : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Budget</p>
                    <p className="font-medium">{item.totalBudget ? formatCurrency(parseFloat(item.totalBudget), item.currency ?? "IDR") : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-medium truncate">{item.location ?? "-"}</p>
                  </div>
                </div>
                {(item.vendorName || item.vendorContact) && (
                  <div className="p-2 bg-muted/50 rounded text-xs space-y-0.5">
                    {item.vendorName && <p><span className="text-muted-foreground">Vendor:</span> {item.vendorName}</p>}
                    {item.vendorContact && <p><span className="text-muted-foreground">Contact:</span> {item.vendorContact}</p>}
                  </div>
                )}
                {item.approvalNote && (
                  <p className="text-xs text-muted-foreground italic">Note: {item.approvalNote}</p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(item.createdAt)}</span>
                  {item.source === "whatsapp" && <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">WhatsApp</Badge>}
                </div>
                <Separator />
                <div className="flex gap-1.5">
                  {item.status === "open" && (
                    <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => { setApproveTarget(item); setApprovalNote(""); }}>
                      <CheckCircle className="h-3 w-3" /> Approve
                    </Button>
                  )}
                  {(item.status === "open" || item.status === "in_review") && (
                    <Button size="sm" variant="outline" className="flex-1 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => { setRejectTarget(item); setApprovalNote(""); }}>
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditItem({ ...item })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate({ id: item.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setForm({ ...emptyForm }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Procurement Request</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Textarea placeholder="What do you need to procure?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Budget per Unit</Label>
                <Input type="number" placeholder="0" value={form.budgetPerUnit} onChange={(e) => setForm({ ...form, budgetPerUnit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IDR">IDR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="SGD">SGD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input placeholder="e.g. Jakarta" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Vendor Name</Label>
                <Input placeholder="Optional" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Vendor Contact</Label>
                <Input placeholder="Optional" value={form.vendorContact} onChange={(e) => setForm({ ...form, vendorContact: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({
                description: form.description,
                quantity: form.quantity,
                budgetPerUnit: form.budgetPerUnit ? parseFloat(form.budgetPerUnit) : undefined,
                currency: form.currency,
                location: form.location || undefined,
                vendorName: form.vendorName || undefined,
                vendorContact: form.vendorContact || undefined,
              })}
              disabled={!form.description || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Approve Procurement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Add an optional approval note.</p>
            <Textarea placeholder="Approval note (optional)" value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button onClick={() => approveMutation.mutate({ id: approveTarget.id, note: approvalNote || undefined })} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject Procurement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Add an optional rejection note.</p>
            <Textarea placeholder="Rejection reason (optional)" value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectMutation.mutate({ id: rejectTarget.id, note: approvalNote || undefined })} disabled={rejectMutation.isPending}>
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
