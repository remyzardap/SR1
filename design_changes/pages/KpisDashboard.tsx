import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, Users, DollarSign, Receipt, CheckSquare,
  FileText, ShoppingCart, RefreshCw, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; label: string };
}) {
  const isPositive = (trend?.value ?? 0) >= 0;
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </div>
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
              isPositive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}>
              {isPositive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(trend.value)}% {trend.label}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendBar({
  data,
  label,
  valueKey,
  color = "bg-primary",
}: {
  data: any[];
  label: string;
  valueKey: string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d[valueKey] ?? 0), 1);
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-end gap-1 h-24">
        {data.map((d, i) => {
          const pct = ((d[valueKey] ?? 0) / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end h-20">
                <div
                  className={`w-full rounded-t ${color} opacity-80 hover:opacity-100 transition-opacity`}
                  style={{ height: `${Math.max(pct, 2)}%` }}
                  title={`${d.label}: ${d[valueKey]}`}
                />
              </div>
              <span className="text-[9px] text-muted-foreground truncate w-full text-center">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function KpisDashboard() {
  const { data, isLoading, error, refetch, isFetching } = trpc.kpis.overview.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Business KPIs
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Key performance indicators and business metrics.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
            Failed to load KPI data. You may not have admin access.
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-5">
                  <div className="h-20 bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {data && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                icon={Users}
                label="Total Users"
                value={data.users.total.toLocaleString()}
                sub={`+${data.users.newThisMonth} this month`}
                trend={{ value: data.users.growthPct, label: "MoM" }}
              />
              <KpiCard
                icon={DollarSign}
                label="MRR (30d)"
                value={formatCurrency(data.revenue.mrrUsd)}
                sub="Monthly recurring revenue"
              />
              <KpiCard
                icon={DollarSign}
                label="Total Revenue"
                value={formatCurrency(data.revenue.totalPayments)}
                sub={`Avg ${formatCurrency(data.revenue.avgRevenuePerUser)}/user`}
              />
              <KpiCard
                icon={Receipt}
                label="Receipts (Month)"
                value={data.activity.receiptsThisMonth.toLocaleString()}
                sub="Expense receipts submitted"
              />
              <KpiCard
                icon={CheckSquare}
                label="Tasks Completed"
                value={data.activity.tasksCompleted.toLocaleString()}
                sub="All time"
              />
              <KpiCard
                icon={FileText}
                label="Files Generated"
                value={data.activity.filesGenerated.toLocaleString()}
                sub="All time"
              />
              <KpiCard
                icon={ShoppingCart}
                label="Procurements Approved"
                value={data.activity.procurementsApproved.toLocaleString()}
                sub="All time"
              />
              <KpiCard
                icon={Users}
                label="New Users (Month)"
                value={data.users.newThisMonth.toLocaleString()}
                sub="This calendar month"
              />
            </div>

            {/* Trend Charts */}
            {data.trends.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">New Users (6 months)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TrendBar data={data.trends} label="" valueKey="newUsers" color="bg-blue-500" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Receipts (6 months)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TrendBar data={data.trends} label="" valueKey="receipts" color="bg-violet-500" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Revenue (6 months)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TrendBar data={data.trends} label="" valueKey="revenue" color="bg-emerald-500" />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Trend Table */}
            {data.trends.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Monthly Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 text-muted-foreground font-medium">Month</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">New Users</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Receipts</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.trends].reverse().map((row) => (
                          <tr key={`${row.year}-${row.month}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="py-2 font-medium">{row.label}</td>
                            <td className="py-2 text-right">{row.newUsers.toLocaleString()}</td>
                            <td className="py-2 text-right">{row.receipts.toLocaleString()}</td>
                            <td className="py-2 text-right">{formatCurrency(row.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
