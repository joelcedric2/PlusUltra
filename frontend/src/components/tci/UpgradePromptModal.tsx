/**
 * TCI Upgrade Prompt Modal
 *
 * Modal dialog that shows when users need to upgrade their TCI tier.
 * Displays tier comparison and upgrade options.
 */

import { useState } from "react";
import { Check, X, Sparkles, Zap, Shield, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserTier } from "./types";

export interface UpgradePromptProps {
  /** Current user tier */
  currentTier: UserTier;
  /** Reason for showing upgrade prompt */
  reason: "limit-reached" | "feature-locked" | "suggestion";
  /** Whether modal is open */
  open: boolean;
  /** Callback when modal is closed */
  onOpenChange: (open: boolean) => void;
  /** Callback when user clicks upgrade button */
  onUpgrade?: (tier: UserTier) => void;
}

interface TierFeature {
  name: string;
  free: boolean | string;
  starter: boolean | string;
  pro: boolean | string;
  enterprise: boolean | string;
}

const TIER_FEATURES: TierFeature[] = [
  {
    name: "Quick Analysis (2 layers)",
    free: "10/day",
    starter: "100/day",
    pro: "Unlimited",
    enterprise: "Unlimited",
  },
  {
    name: "Full 6-Layer Analysis",
    free: false,
    starter: false,
    pro: "Unlimited",
    enterprise: "Unlimited",
  },
  {
    name: "Accuracy",
    free: "~75%",
    starter: "~75%",
    pro: "93-95%",
    enterprise: "93-95%",
  },
  {
    name: "Auto-Fix Implementation",
    free: false,
    starter: false,
    pro: true,
    enterprise: true,
  },
  {
    name: "Visual Pattern Recognition",
    free: true,
    starter: true,
    pro: true,
    enterprise: true,
  },
  {
    name: "Causal Chain Analysis",
    free: false,
    starter: false,
    pro: true,
    enterprise: true,
  },
  {
    name: "Historical Pattern Matching",
    free: true,
    starter: true,
    pro: true,
    enterprise: true,
  },
  {
    name: "Symbolic Logic Verification",
    free: false,
    starter: false,
    pro: true,
    enterprise: true,
  },
  {
    name: "Cross-Model Synthesis",
    free: false,
    starter: false,
    pro: true,
    enterprise: true,
  },
  {
    name: "Priority Processing",
    free: false,
    starter: false,
    pro: false,
    enterprise: true,
  },
  {
    name: "Support",
    free: "Community",
    starter: "Email",
    pro: "Priority",
    enterprise: "Dedicated",
  },
];

interface TierOption {
  tier: UserTier;
  name: string;
  price: string;
  priceDetail: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  borderColor: string;
  bgColor: string;
  recommended?: boolean;
}

const TIER_OPTIONS: Record<Exclude<UserTier, "free">, TierOption> = {
  starter: {
    tier: "starter",
    name: "Starter",
    price: "$9",
    priceDetail: "/month",
    description: "10x more daily analyses for growing projects",
    icon: Zap,
    color: "text-blue-500",
    borderColor: "border-blue-500/20 hover:border-blue-500/40",
    bgColor: "bg-blue-500/5 hover:bg-blue-500/10",
    recommended: false,
  },
  pro: {
    tier: "pro",
    name: "Pro",
    price: "$29",
    priceDetail: "/month",
    description: "Unlimited full 6-layer analysis with 93-95% accuracy",
    icon: Sparkles,
    color: "text-purple-500",
    borderColor: "border-purple-500/40 hover:border-purple-500/60",
    bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
    recommended: true,
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    price: "Custom",
    priceDetail: "",
    description: "Priority processing, dedicated support, custom SLAs",
    icon: Shield,
    color: "text-amber-500",
    borderColor: "border-amber-500/20 hover:border-amber-500/40",
    bgColor: "bg-gradient-to-br from-amber-500/5 to-orange-500/5 hover:from-amber-500/10 hover:to-orange-500/10",
    recommended: false,
  },
};

/**
 * Get modal title based on reason
 */
function getModalTitle(reason: UpgradePromptProps["reason"]): string {
  switch (reason) {
    case "limit-reached":
      return "Daily Limit Reached";
    case "feature-locked":
      return "Unlock Full TCI Analysis";
    case "suggestion":
      return "Upgrade Your TCI Plan";
  }
}

/**
 * Get modal description based on reason
 */
function getModalDescription(reason: UpgradePromptProps["reason"], currentTier: UserTier): string {
  switch (reason) {
    case "limit-reached":
      return `You've used all your daily analyses on the ${currentTier} plan. Upgrade to continue analyzing code.`;
    case "feature-locked":
      return `Full 6-layer analysis with auto-fix requires Pro or Enterprise. You're currently on ${currentTier}.`;
    case "suggestion":
      return `Get more value from TCI with unlimited analyses and higher accuracy.`;
  }
}

/**
 * Render feature value (checkmark, X, or text)
 */
function renderFeatureValue(value: boolean | string): React.ReactNode {
  if (value === true) {
    return <Check className="w-4 h-4 text-green-500" />;
  }
  if (value === false) {
    return <X className="w-4 h-4 text-muted-foreground/30" />;
  }
  return <span className="text-xs text-muted-foreground">{value}</span>;
}

/**
 * UpgradePromptModal Component
 *
 * Shows tier comparison table and upgrade options.
 * Handles upgrade flow when user selects a new tier.
 */
export function UpgradePromptModal({
  currentTier,
  reason,
  open,
  onOpenChange,
  onUpgrade,
}: UpgradePromptProps) {
  const [selectedTier, setSelectedTier] = useState<UserTier | null>(
    currentTier === "free" ? "pro" : null
  );

  const title = getModalTitle(reason);
  const description = getModalDescription(reason, currentTier);

  // Get available upgrade options (only tiers above current)
  const availableUpgrades = Object.values(TIER_OPTIONS).filter((option) => {
    const tierOrder: UserTier[] = ["free", "starter", "pro", "enterprise"];
    const currentIndex = tierOrder.indexOf(currentTier);
    const optionIndex = tierOrder.indexOf(option.tier);
    return optionIndex > currentIndex;
  });

  const handleUpgrade = () => {
    if (selectedTier && onUpgrade) {
      onUpgrade(selectedTier);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{title}</DialogTitle>
          <DialogDescription className="text-base">{description}</DialogDescription>
        </DialogHeader>

        {/* Tier Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
          {availableUpgrades.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedTier === option.tier;

            return (
              <button
                key={option.tier}
                onClick={() => setSelectedTier(option.tier)}
                className={cn(
                  "relative p-5 rounded-xl border-2 transition-all text-left",
                  option.borderColor,
                  option.bgColor,
                  isSelected && "ring-2 ring-offset-2",
                  isSelected && option.color.replace("text-", "ring-")
                )}
              >
                {option.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-semibold rounded-full">
                    Recommended
                  </div>
                )}

                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg">{option.name}</h3>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={cn("text-3xl font-bold", option.color)}>
                        {option.price}
                      </span>
                      {option.priceDetail && (
                        <span className="text-sm text-muted-foreground">{option.priceDetail}</span>
                      )}
                    </div>
                  </div>
                  <Icon className={cn("w-8 h-8", option.color)} />
                </div>

                <p className="text-sm text-muted-foreground mb-4">{option.description}</p>

                {isSelected && (
                  <div className={cn("flex items-center gap-1 text-sm font-medium", option.color)}>
                    <Check className="w-4 h-4" />
                    Selected
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-3 text-left text-sm font-semibold">Feature</th>
                <th className="px-4 py-3 text-center text-sm font-semibold">Free</th>
                <th className="px-4 py-3 text-center text-sm font-semibold">Starter</th>
                <th className="px-4 py-3 text-center text-sm font-semibold">Pro</th>
                <th className="px-4 py-3 text-center text-sm font-semibold">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {TIER_FEATURES.map((feature, index) => (
                <tr
                  key={feature.name}
                  className={cn(
                    "border-b border-border/50",
                    index % 2 === 0 && "bg-muted/20"
                  )}
                >
                  <td className="px-4 py-3 text-sm">{feature.name}</td>
                  <td className="px-4 py-3 text-center">{renderFeatureValue(feature.free)}</td>
                  <td className="px-4 py-3 text-center">{renderFeatureValue(feature.starter)}</td>
                  <td className="px-4 py-3 text-center">{renderFeatureValue(feature.pro)}</td>
                  <td className="px-4 py-3 text-center">{renderFeatureValue(feature.enterprise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cost Savings Note */}
        {selectedTier === "pro" && (
          <div className="mt-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm mb-1 text-green-600 dark:text-green-400">
                  Break-even at 33 analyses/month
                </h4>
                <p className="text-sm text-muted-foreground">
                  Each full analysis costs $0.90 pay-per-use. With Pro, you save money after just 33
                  analyses per month. Plus, you get unlimited quick analyses too.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe Later
          </Button>

          <Button
            onClick={handleUpgrade}
            disabled={!selectedTier}
            className={cn(
              "bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-90 text-white shadow-lg shadow-purple-500/20",
              !selectedTier && "opacity-50 cursor-not-allowed"
            )}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {selectedTier ? `Upgrade to ${TIER_OPTIONS[selectedTier as keyof typeof TIER_OPTIONS]?.name}` : "Select a Plan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
