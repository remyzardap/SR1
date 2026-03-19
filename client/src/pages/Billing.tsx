import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, ExternalLink, Loader2, Receipt, Settings, CheckCircle, XCircle, Clock } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";
import { PLANS } from "../../../server/stripeProducts";

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-800 border-green-200 gap-1"><CheckCircle className="h-3 w-3" /> Active</Badge>;
    case "cancelled":
    case "canceled":
      return <Badge className="bg-red-100 text-red-800 border-red-200 gap-1"><XCircle className="h-3 w-3" /> Cancelled</Badge>;
    case "past_due":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1"><Clock className="h-3 w-3" /> Past Due</Badge>;
    case "paid":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>;
    case "succeeded":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Succeeded</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function Billing() {
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: subscription, isLoading: subLoading } = trpc.payments.subscription.useQuery();
  const { data: history, isLoading: histLoading } = trpc.payments.history.useQuery({ limit: 20 });

  const portalMutation = trpc.payments.createPortal.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("Opening Stripe billing portal...");
        window.open(data.url, "_blank");
      }
      setPortalLoading(false);
    },
    onError: (e) => {
      toast.error("Could not open portal: " + e.message);
      setPortalLoading(false);
    },
  });

  const currentPlan = subscription?.priceId
    ? PLANS.find((p) => p.stripePriceId === subscription.priceId)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Payments</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your subscription and view payment history</p>
        </div>
        <Link href="/pricing">
          <Button variant="outline" className="gap-2">
            <CreditCard className="h-4 w-4" /> View Plans
          </Button>
        </Link>
      </div>

      {/* Current Subscription */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4" /> Current Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading subscription...
            </div>
          ) : !subscription ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">No active subscription</p>
                <p className="text-sm text-muted-foreground mt-0.5">Upgrade to unlock all features</p>
              </div>
              <Link href="/pricing">
                <Button className="gap-2">
                  <CreditCard className="h-4 w-4" /> Choose a Plan
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-lg">{currentPlan?.name ?? "Subscription"}</p>
                    {statusBadge(subscription.status)}
                  </div>
                  {currentPlan && (
                    <p className="text-sm text-muted-foreground">{currentPlan.description}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Renews on {formatDate(subscription.currentPeriodEnd)}
                    {subscription.cancelAtPeriodEnd && (
                      <span className="text-red-600 ml-2">(Cancels at period end)</span>
                    )}
                  </p>
                </div>
                {currentPlan && (
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold">${(currentPlan.price / 100).toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">/month</p>
                  </div>
                )}
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={portalLoading}
                  onClick={() => { setPortalLoading(true); portalMutation.mutate({ origin: window.location.origin }); }}
                >
                  {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Manage Subscription
                </Button>
                <Link href="/pricing">
                  <Button variant="ghost" className="gap-2">Upgrade Plan</Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Payment History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {histLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Receipt className="h-10 w-10 opacity-30" />
              <p className="text-sm">No payment history yet</p>
              <Link href="/pricing">
                <Button variant="outline" size="sm">Make your first purchase</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Description</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-muted-foreground">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((payment) => (
                    <tr key={payment.id} className="hover:bg-muted/20">
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(payment.createdAt)}</td>
                      <td className="px-5 py-3 font-medium">{payment.description ?? "Payment"}</td>
                      <td className="px-5 py-3">{statusBadge(payment.status)}</td>
                      <td className="px-5 py-3 text-right font-semibold">
                        ${(payment.amount / 100).toFixed(2)} <span className="text-xs text-muted-foreground uppercase">{payment.currency}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {payment.receiptUrl ? (
                          <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                              <ExternalLink className="h-3 w-3" /> View
                            </Button>
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
