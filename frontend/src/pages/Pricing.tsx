import { useState } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Sparkles, Zap, Plus, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { tokenService } from "@/lib/token";

const Pricing = () => {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [tokensToPurchase, setTokensToPurchase] = useState(100);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const TOKEN_PRICE = 0.002; // $0.002 per token
  const totalCost = tokensToPurchase * TOKEN_PRICE;

  const handlePurchaseTokens = async () => {
    if (!isAuthenticated || !user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to purchase tokens",
        variant: "destructive"
      });
      return;
    }

    if (tokensToPurchase < 10) {
      toast({
        title: "Minimum purchase",
        description: "Minimum token purchase is 10 tokens",
        variant: "destructive"
      });
      return;
    }

    setIsPurchasing(true);
    try {
      const result = await tokenService.purchaseTokens(user.id, tokensToPurchase);

      toast({
        title: "Tokens purchased successfully!",
        description: `${result.tokensPurchased} tokens added to your account. Total cost: $${result.cost.toFixed(2)}`,
      });

      // Reset the input
      setTokensToPurchase(100);
    } catch (error) {
      toast({
        title: "Purchase failed",
        description: error instanceof Error ? error.message : "Failed to purchase tokens",
        variant: "destructive"
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  const adjustTokens = (delta: number) => {
    setTokensToPurchase(prev => Math.max(10, prev + delta));
  };
  
  const tiers = [
    {
      name: "Free",
      monthlyPrice: "$0",
      yearlyPrice: "$0",
      period: "/month",
      tokens: "100 tokens/month",
      sessions: "~20 sessions/month for small apps",
      features: [
        "1 project, 1 user (no collaboration)",
        "Web/native apps",
        "Basic app store/Google Play publishing readiness",
        "BYO Supabase (Auth, DB, Functions)",
        "5GB storage",
        "Public apps only",
        "No TCI",
        "Docs/community support"
      ],
      cta: "Get Started",
      ctaVariant: "outline" as const,
      popular: false
    },
    {
      name: "Starter",
      monthlyPrice: "$25",
      yearlyPrice: "$20",
      period: "/month",
      yearlyTotal: "$240/year",
      tokens: "250 tokens",
      sessions: "~100 builds/edits/month",
      features: [
        "4 projects",
        "1 user + 2 collaborators (3 total/project)",
        "Web/native apps",
        "Basic app store/Google Play publishing",
        "BYO Supabase",
        "25GB storage",
        "Custom domains",
        "Basic integrations",
        "No TCI",
        "Email support (3-day SLA)"
      ],
      cta: "Start Free Trial",
      ctaVariant: "default" as const,
      popular: true,
      targetUsers: "Solo builders/freelancers"
    },
    {
      name: "Pro",
      monthlyPrice: "$200",
      yearlyPrice: "$160",
      period: "/month",
      yearlyTotal: "$1,920/year",
      tokens: "500 tokens/month",
      sessions: "~200+ sessions/month",
      features: [
        "10 projects",
        "1 user + 4 collaborators (5 total/project)",
        "Web/native apps",
        "Full app store/Google Play publishing",
        "BYO Supabase",
        "100GB storage",
        "Full TCI (temporal graphs, replays, predictions)",
        "Advanced integrations (EAS/TestFlight, compliance audits)",
        "Priority support (2-day SLA)",
        "Custom branding",
        "Analytics"
      ],
      cta: "Start Pro Trial",
      ctaVariant: "default" as const,
      popular: false,
      targetUsers: "Power devs/small teams"
    },
    {
      name: "Enterprise",
      monthlyPrice: "Custom",
      yearlyPrice: "Custom",
      period: "",
      tokens: "Unlimited tokens (fair use)",
      sessions: "TCI included",
      features: [
        "Unlimited projects/collaborators",
        "Dedicated instances (K8s)",
        "Custom integrations/on-prem",
        "RBAC/SSO",
        "TCI with full governance (audit logs, SOC2/GDPR/SOX)",
        "Dedicated support (1-day SLA)",
        "99.9% SLA uptime",
        "Web/native apps",
        "Full app store/Google Play publishing",
        "BYO Supabase"
      ],
      cta: "Contact Sales",
      ctaVariant: "outline" as const,
      popular: false
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      
      {/* Hero Section */}
      <section className="pt-32 pb-12 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <Badge className="mb-6 bg-accent/10 text-accent border-accent/20 hover:bg-accent/20">
            <Sparkles className="w-3 h-3 mr-1" />
            Simple, Transparent Pricing
          </Badge>
          
          <h1 className="text-4xl md:text-6xl font-bold mb-6 text-foreground">
            Choose the plan that fits your needs
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            From solo builders to enterprise teams, we have a plan for everyone
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <span className={`text-lg ${billingPeriod === 'monthly' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
              className="relative w-14 h-7 bg-muted rounded-full transition-colors hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 bg-accent rounded-full transition-transform duration-200 ease-in-out ${
                  billingPeriod === 'yearly' ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-lg ${billingPeriod === 'yearly' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
              Yearly
              <Badge className="ml-2 bg-accent/20 text-accent border-0">Save 20%</Badge>
            </span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {tiers.map((tier) => (
              <Card 
                key={tier.name} 
                className={`glass-panel relative flex flex-col h-full ${
                  tier.popular ? 'border-2 border-accent shadow-lg' : ''
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-accent text-white">Most Popular</Badge>
                  </div>
                )}
                
                <CardHeader className="pb-4">
                  <CardTitle className="text-2xl">{tier.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground">
                      {billingPeriod === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice}
                    </span>
                    <span className="text-muted-foreground">{tier.period}</span>
                  </div>
                  {billingPeriod === 'yearly' && tier.yearlyTotal && (
                    <p className="text-sm text-muted-foreground mt-2">{tier.yearlyTotal}</p>
                  )}
                  <div className="mt-4 space-y-1">
                    <p className="text-sm font-semibold text-accent">{tier.tokens}</p>
                    <p className="text-xs text-muted-foreground">{tier.sessions}</p>
                  </div>
                  {tier.targetUsers && (
                    <p className="text-xs text-muted-foreground italic mt-2">{tier.targetUsers}</p>
                  )}
                </CardHeader>
                
                <CardContent className="flex-1 flex flex-col">
                  <ul className="space-y-3 mb-6 flex-1">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    variant={tier.ctaVariant}
                    className={`w-full ${
                      tier.ctaVariant === 'default' 
                        ? 'bg-gradient-to-r from-accent to-purple text-white border-0' 
                        : ''
                    }`}
                    asChild
                  >
                    <Link to="/workspace">{tier.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Token Purchase Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
              <Zap className="w-3 h-3 mr-1" />
              Token Top-Up
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Need More Tokens?</h2>
            <p className="text-xl text-muted-foreground">
              Purchase additional tokens at $0.002 per token. No subscription required.
            </p>
          </div>

          <Card className="glass-panel border-2 border-accent/20">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Zap className="w-6 h-6 text-accent" />
                Purchase Tokens
              </CardTitle>
              <CardDescription>
                Top up your token balance anytime. Perfect for handling peak usage or large projects.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="tokens">Number of Tokens</Label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => adjustTokens(-50)}
                    disabled={tokensToPurchase <= 10}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    id="tokens"
                    type="number"
                    min="10"
                    step="10"
                    value={tokensToPurchase}
                    onChange={(e) => setTokensToPurchase(Math.max(10, parseInt(e.target.value) || 10))}
                    className="text-center text-lg font-semibold"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => adjustTokens(50)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">Minimum purchase: 10 tokens</p>
              </div>

              <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Price per token:</span>
                  <span className="font-medium">${TOKEN_PRICE.toFixed(3)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Tokens to purchase:</span>
                  <span className="font-medium">{tokensToPurchase}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex justify-between items-center text-lg">
                  <span className="font-semibold">Total:</span>
                  <span className="font-bold text-accent">${totalCost.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handlePurchaseTokens}
                  disabled={isPurchasing || !isAuthenticated}
                  className="w-full bg-gradient-to-r from-accent to-purple text-white border-0 text-lg py-6"
                  size="lg"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  {isPurchasing ? "Processing..." : isAuthenticated ? "Purchase Tokens" : "Sign In to Purchase"}
                </Button>
                {!isAuthenticated && (
                  <p className="text-sm text-muted-foreground text-center">
                    <Link to="/signin" className="text-accent hover:underline">
                      Sign in
                    </Link>
                    {" "}to purchase tokens
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTokensToPurchase(100)}
                  className="text-xs"
                >
                  100 tokens
                  <br />
                  <span className="text-muted-foreground">${(100 * TOKEN_PRICE).toFixed(2)}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTokensToPurchase(500)}
                  className="text-xs"
                >
                  500 tokens
                  <br />
                  <span className="text-muted-foreground">${(500 * TOKEN_PRICE).toFixed(2)}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTokensToPurchase(1000)}
                  className="text-xs"
                >
                  1,000 tokens
                  <br />
                  <span className="text-muted-foreground">${(1000 * TOKEN_PRICE).toFixed(2)}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FAQ or Additional Info Section */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-center">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-lg">What are PlusUltra Tokens?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  PlusUltra Tokens are usage credits that power your app building sessions, edits, and TCI features. 
                  Each build or edit consumes tokens based on complexity.
                </p>
              </CardContent>
            </Card>

            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-lg">What is TCI?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Temporal Code Intelligence (TCI) provides advanced debugging with temporal graphs, replays, 
                  and predictions. TCI gets smarter the more you use it, learning to understand your intent and 
                  providing increasingly personalized insights. Available in Pro and Enterprise tiers for time-saving bug resolution.
                </p>
              </CardContent>
            </Card>

            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-lg">Can I upgrade or downgrade anytime?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, 
                  and we'll prorate any differences.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center glass-panel rounded-3xl p-12">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to start building?</h2>
          <p className="text-xl text-muted-foreground mb-8">Choose your plan and ship your app today</p>
          <Button 
            size="lg" 
            className="bg-gradient-to-r from-accent to-purple text-white border-0 text-lg px-8 py-6 hover:opacity-90"
            asChild
          >
            <Link to="/workspace">Get Started Free</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto text-center text-muted-foreground">
          <p>&copy; 2025 PlusUltra. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
