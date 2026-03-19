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
import { formatCurrency, formatDate, RECEIPT_CATEGORIES, PAYMENT_METHODS } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck, CheckCircle, XCircle, Edit2, Loader2, AlertCircle } from "lucide-react";

export default function ReviewQueue() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.receipts.needsReview.useQuery();
  const [editItem, setEditItem] = useState<any | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  const approveMutation = trpc.receipts.approve.useMutation({
    onSuccess: () => {
      utils.receipts.needsReview.invalidate();
      utils.reports.dashboardStats.invalidate();
      toast.success("Receipt approved and added to ledger");
    },
  });

  const rejectMutation = trpc.receipts.reject.useMutation({
    onSuccess: () => {
      utils.receipts.needsReview.invalidate();
      utils.reports.dashboardStats.invalidate();
      setRejectTarget(null);
      setRejectNote("");
      toast.success("Receipt rejected");
    },
  });

  const updateMutation = trpc.receipts.update.useMutation({
    onSuccess: () => {
      utils.receipts.needsReview.invalidate();
      setEditItem(null);
      toast.success("Receipt updated");
    },
    onError: (e) => toast.error("Update failed: " + e.message),
  });

  function handleApproveEdited() {
    if (!editItem) return;
    updateMutation.mutate({
      id: editItem.id,
      vendor: editItem.vendor,
      date: editItem.date ? new Date(editItem.date).toISOString() : undefined,
      amount: editItem.amount ? parseFloat(editItem.amount) : undefined,
      taxAmount: editItem.taxAmount ? parseFloat(editItem.taxAmount) : undefined,
      category: editItem.category,
      paymentMethod: editItem.paymentMethod,
      description: editItem.description,
      status: "approved",
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Items requiring your review and approval before being added to the ledger
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !items || items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <CheckCircle className="h-12 w-12 text-green-500 opacity-60" />
            <p className="text-base font-medium">All caught up!</p>
            <p className="text-sm">No items require review at this time.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-700">{items.length} item{items.length !== 1 ? "s" : ""} need your review</span>
          </div>
          {items.map((item) => (
            <Card key={item.id} className="border-amber-200">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {item.fileUrl && (
                    <img src={item.fileUrl} alt="Receipt" className="h-24 w-24 object-cover rounded-lg border shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{item.vendor ?? "Unknown Vendor"}</p>
                        <p className="text-sm text-muted-foreground">{item.description ?? "No description"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold">{formatCurrency(parseFloat(item.amount ?? "0"), item.currency ?? "IDR")}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(item.date ?? item.createdAt)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{item.category ?? "Uncategorized"}</Badge>
                      <Badge variant="outline">{item.paymentMethod ?? "Unknown payment"}</Badge>
                      <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
                        Source: {item.source}
                      </Badge>
                      {item.ocrConfidence && (
                        <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50">
                          Confidence: {Math.round(parseFloat(item.ocrConfidence) * 100)}%
                        </Badge>
                      )}
                    </div>

                    {item.rawText && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw extracted text</summary>
                        <p className="mt-1 p-2 bg-muted rounded text-xs font-mono whitespace-pre-wrap">{item.rawText}</p>
                      </details>
                    )}

                    <Separator />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate({ id: item.id })}
                        disabled={approveMutation.isPending}
                        className="gap-1.5"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditItem({ ...item })}
                        className="gap-1.5"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit & Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => setRejectTarget(item.id)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit & Approve Receipt</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Vendor</Label>
                  <Input value={editItem.vendor ?? ""} onChange={(e) => setEditItem({ ...editItem, vendor: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={editItem.date ? new Date(editItem.date).toISOString().split("T")[0] : ""}
                    onChange={(e) => setEditItem({ ...editItem, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    value={editItem.amount ?? ""}
                    onChange={(e) => setEditItem({ ...editItem, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tax Amount</Label>
                  <Input
                    type="number"
                    value={editItem.taxAmount ?? ""}
                    onChange={(e) => setEditItem({ ...editItem, taxAmount: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={editItem.category ?? ""} onValueChange={(v) => setEditItem({ ...editItem, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {RECEIPT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <Select value={editItem.paymentMethod ?? ""} onValueChange={(v) => setEditItem({ ...editItem, paymentMethod: v })}>
                    <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={editItem.description ?? ""}
                  onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleApproveEdited} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Optionally add a note explaining why this receipt is being rejected.</p>
            <Textarea
              placeholder="Rejection reason (optional)"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget, note: rejectNote || undefined })}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
