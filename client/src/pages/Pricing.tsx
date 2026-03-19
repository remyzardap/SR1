import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, CreditCard, Zap, Building2, Star } from "lucide-react";

function PlanIcon({ planId }: { planId: string }) {
  if (planId === "starter") return <Zap className="h-5 w-5 text-blue-500" />;
  if (planId === "professional") return <Star className="h-5 w-5 text-purple-500" />;
  return <Building2 className="h-5 w-5 text-orange-500" />;
}

export default function Pricing() {
  const { user } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const { data } = trpc.payments.plans.useQuery();
  const { data: subscription } = trpc.payments.subscription.useQuery();

  const checkoutMutation = trpc.payments.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("Redirecting to Stripe checkout...");
        window.open(data.url, "_blank");
      }
      setLoadingPlan(null);
    },
    onError: (e) => {
      toast.error("Checkout failed: " + e.message);
      setLoadingPlan(null);
    },
  });

  function handleCheckout(planId: string, priceId: string) {
    setLoadingPlan(planId);
    checkoutMutation.mutate({
      planId,
      priceId,
      origin: window.location.origin,
    });
  }

  const plans = data?.plans ?? [];
  const oneTimeProducts = data?.oneTimeProducts ?? [];

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Choose Your Plan</h1>
        <p className="text-muted-foreground">
          Start free, scale as you grow. All plans include WhatsApp integration and AI-powered receipt extraction.
        </p>
        {subscription && (
          <Badge className="mt-2 bg-green-100 text-green-800 border-green-200">
            Current plan: {subscription.priceId ?? "Active subscription"} — {subscription.status}
          </Badge>
        )}
      </div>

      {/* Subscription Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={`relative flex flex-col ${plan.popular ? "border-primary shadow-lg ring-1 ring-primary" : ""}`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground px-3">Most Popular</Badge>
              </div>
            )}
            <CardHeader className="pb-4 pt-6">
              <div className="flex items-center gap-2 mb-2">
                <PlanIcon planId={plan.id} />
                <CardTitle className="text-lg">{plan.name}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
              <div className="mt-3">
                <span className="text-3xl font-bold">${(plan.price / 100).toFixed(0)}</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 gap-4">
              <ul className="space-y-2 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant={plan.popular ? "default" : "outline"}
                disabled={loadingPlan === plan.id || !user}
                onClick={() => handleCheckout(plan.id, plan.stripePriceId)}
              >
                {loadingPlan === plan.id ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</>
                ) : (
                  <><CreditCard className="h-4 w-4 mr-2" /> Get Started</>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* One-time Products */}
      {oneTimeProducts.length > 0 && (
        <>
          <Separator className="max-w-5xl mx-auto" />
          <div className="max-w-5xl mx-auto space-y-4">
            <h2 className="text-xl font-semibold text-center">One-Time Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {oneTimeProducts.map((product) => (
                <Card key={product.id}>
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <CreditCard className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{product.name}</p>
                        <p className="font-bold text-lg shrink-0">${(product.price / 100).toFixed(0)}</p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{product.description}</p>
                      <ul className="mt-2 space-y-1">
                        {product.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Check className="h-3 w-3 text-green-500 shrink-0" /> {f}
                          </li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 gap-1.5"
                        disabled={loadingPlan === product.id || !user}
                        onClick={() => handleCheckout(product.id, product.stripePriceId)}
                      >
                        {loadingPlan === product.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                        Purchase
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Test card info */}
      <div className="max-w-5xl mx-auto">
        <Card className="border-dashed bg-muted/30">
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            <p><strong>Test mode:</strong> Use card number <code className="bg-muted px-1 rounded font-mono">4242 4242 4242 4242</code> with any future expiry and any CVC to test payments.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
