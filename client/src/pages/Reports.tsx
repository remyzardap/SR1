import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Download, BarChart3, Loader2, TrendingUp, FileText, Table2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

const now = new Date();
const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2000, i, 1).toLocaleString("default", { month: "long" }),
}));
const YEARS = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

export default function Reports() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: summary, isLoading } = trpc.reports.monthlySummary.useQuery({ year, month });
  const { data: trend } = trpc.reports.trend.useQuery({ months: 6 });

  const exportMutation = trpc.reports.exportCSV.useMutation({
    onSuccess: (data) => {
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.fileName;
      a.click();
      toast.success(`Exported ${data.totalEntries} entries`);
    },
    onError: (e) => toast.error("Export failed: " + e.message),
  });

  const exportExcelMutation = trpc.reports.exportExcel.useMutation({
    onSuccess: (data) => {
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.fileName;
      a.click();
      toast.success(`Excel exported: ${data.totalEntries} entries`);
    },
    onError: (e) => toast.error("Excel export failed: " + e.message),
  });

  const exportPDFMutation = trpc.reports.exportPDF.useMutation({
    onSuccess: (data) => {
      const a = document.createElement("a");
      a.href = data.url;
      a.download = data.fileName;
      a.click();
      toast.success(`PDF exported: ${data.totalEntries} entries`);
    },
    onError: (e) => toast.error("PDF export failed: " + e.message),
  });

  const pieData = useMemo(() => {
    return (summary?.byCategory ?? []).map((c) => ({
      name: c.category.charAt(0).toUpperCase() + c.category.slice(1),
      value: c.amount,
    }));
  }, [summary]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Monthly expense summaries and financial insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => exportMutation.mutate({ year, month })}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            CSV
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => exportExcelMutation.mutate({ year, month })}
            disabled={exportExcelMutation.isPending}
          >
            {exportExcelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table2 className="h-4 w-4" />}
            Excel
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => exportPDFMutation.mutate({ year, month })}
            disabled={exportPDFMutation.isPending}
          >
            {exportPDFMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Expenses</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(summary?.total ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">{MONTHS[month - 1].label} {year}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Entries</p>
                <p className="text-2xl font-bold mt-1">{summary?.entries?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Receipts & bills</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Categories</p>
                <p className="text-2xl font-bold mt-1">{summary?.byCategory?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Distinct expense types</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 6-Month Trend */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> 6-Month Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!trend || trend.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="total" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> By Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!pieData || pieData.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No expenses this month</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Ledger Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Ledger Entries — {MONTHS[month - 1].label} {year}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!summary?.entries || summary.entries.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  No entries for this period
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Vendor</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Category</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Payment</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Amount</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {summary.entries.map((e) => (
                        <tr key={e.id} className="hover:bg-muted/20">
                          <td className="px-5 py-3 text-muted-foreground">{formatDate(e.date ?? e.createdAt)}</td>
                          <td className="px-5 py-3 font-medium">{e.vendor ?? "-"}</td>
                          <td className="px-5 py-3 capitalize">{e.category ?? "-"}</td>
                          <td className="px-5 py-3 capitalize">{e.paymentMethod ?? "-"}</td>
                          <td className="px-5 py-3 text-right font-semibold">{formatCurrency(parseFloat(e.amount ?? "0"), e.currency ?? "IDR")}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground">{e.taxAmount ? formatCurrency(parseFloat(e.taxAmount), e.currency ?? "IDR") : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={4} className="px-5 py-3 text-sm font-semibold">Total</td>
                        <td className="px-5 py-3 text-right font-bold">{formatCurrency(summary.total)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
