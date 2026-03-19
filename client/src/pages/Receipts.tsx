import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate, statusColor, statusLabel, RECEIPT_CATEGORIES, PAYMENT_METHODS } from "@/lib/utils";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, Search, Eye, Loader2, Receipt as ReceiptIcon, ImageIcon, X } from "lucide-react";

type ReceiptStatus = "auto" | "needs_review" | "approved" | "rejected";

export default function Receipts() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: receipts, isLoading } = trpc.receipts.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
    offset: 0,
  });

  const { data: selected } = trpc.receipts.byId.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const approveMutation = trpc.receipts.approve.useMutation({
    onSuccess: () => { utils.receipts.list.invalidate(); utils.receipts.byId.invalidate(); toast.success("Receipt approved"); },
  });
  const rejectMutation = trpc.receipts.reject.useMutation({
    onSuccess: () => { utils.receipts.list.invalidate(); utils.receipts.byId.invalidate(); toast.success("Receipt rejected"); },
  });
  const uploadMutation = trpc.receipts.uploadAndExtract.useMutation({
    onSuccess: (data) => {
      utils.receipts.list.invalidate();
      setUploadOpen(false);
      toast.success(`Receipt processed! ${data.extracted.needsReview ? "Added to review queue." : "Saved to ledger."}`);
    },
    onError: (e) => toast.error("Upload failed: " + e.message),
  });

  const filtered = (receipts ?? []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.vendor?.toLowerCase().includes(s) ||
      r.category?.toLowerCase().includes(s) ||
      r.description?.toLowerCase().includes(s)
    );
  });

  async function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadMutation.mutate({ fileName: file.name, fileBase64: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receipts & Bills</h1>
          <p className="text-muted-foreground text-sm mt-1">All captured receipts and expense records</p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" /> Upload Receipt
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendor, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Receipt List */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <ReceiptIcon className="h-10 w-10 opacity-30" />
                  <p className="text-sm">No receipts found</p>
                  <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>Upload your first receipt</Button>
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-muted/30 transition-colors ${selectedId === r.id ? "bg-accent/50" : ""}`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {r.fileUrl ? (
                          <img src={r.fileUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                        ) : (
                          <ReceiptIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.vendor ?? "Unknown Vendor"}</p>
                        <p className="text-xs text-muted-foreground">{r.category ?? "Uncategorized"} · {formatDate(r.date ?? r.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold">{formatCurrency(parseFloat(r.amount ?? "0"), r.currency ?? "IDR")}</span>
                        <Badge variant="outline" className={`text-xs ${statusColor(r.status)}`}>{statusLabel(r.status)}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel */}
        <div>
          {selected ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm font-semibold">Receipt Detail</CardTitle>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selected.fileUrl && (
                  <div className="rounded-lg overflow-hidden border">
                    <img src={selected.fileUrl} alt="Receipt" className="w-full object-contain max-h-48" />
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <DetailRow label="Vendor" value={selected.vendor ?? "-"} />
                  <DetailRow label="Date" value={formatDate(selected.date)} />
                  <DetailRow label="Amount" value={formatCurrency(parseFloat(selected.amount ?? "0"), selected.currency ?? "IDR")} />
                  <DetailRow label="Tax" value={selected.taxAmount ? formatCurrency(parseFloat(selected.taxAmount), selected.currency ?? "IDR") : "-"} />
                  <DetailRow label="Category" value={selected.category ?? "-"} />
                  <DetailRow label="Payment" value={selected.paymentMethod ?? "-"} />
                  <DetailRow label="Source" value={selected.source} />
                  <DetailRow label="Status" value={
                    <Badge variant="outline" className={`text-xs ${statusColor(selected.status)}`}>{statusLabel(selected.status)}</Badge>
                  } />
                  {selected.description && (
                    <div>
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="text-sm mt-0.5">{selected.description}</p>
                    </div>
                  )}
                </div>
                {selected.status === "needs_review" && (
                  <>
                    <Separator />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => approveMutation.mutate({ id: selected.id })}
                        disabled={approveMutation.isPending}
                      >
                        {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-destructive hover:text-destructive"
                        onClick={() => rejectMutation.mutate({ id: selected.id })}
                        disabled={rejectMutation.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full">
              <CardContent className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground gap-2">
                <Eye className="h-8 w-8 opacity-30" />
                <p className="text-sm">Select a receipt to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFileUpload(file);
              }}
            >
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Extracting data with AI...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop image here or click to browse</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG, WEBP supported</p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}
