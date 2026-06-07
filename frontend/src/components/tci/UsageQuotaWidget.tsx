/**
 * TCI Usage Quota Widget
 *
 * Displays TCI status in the workspace header dropdown menu.
 * TCI is ALWAYS ACTIVE - analyzing code in the background for all users.
 *
 * Free/Starter: TCI runs silently, feeds learning loop
 * Pro/Enterprise: TCI runs and shows full insights
 *
 * Integrates with the existing token bar UI pattern.
 */

import { AlertTriangle, Sparkles, TrendingUp, Shield } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useTCIUsage } from "./api";
import type { UserTier, TCIUsageStats } from "./types";

export interface UsageQuotaWidgetProps {
  /** Optional callback when user clicks upgrade */
  onUpgrade?: () => void;
  /** Show compact version (no upgrade prompt) */
  compact?: boolean;
}

/**
 * Get tier display badge color and text
 */
function getTierBadge(tier: UserTier): { text: string; className: string } {
  switch (tier) {
    case "free":
      return { text: "Free", className: "bg-gray-500/10 text-gray-500 border-gray-500/20" };
    case "starter":
      return { text: "Starter", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" };
    case "pro":
      return { text: "Pro", className: "bg-purple-500/10 text-purple-500 border-purple-500/20" };
    case "enterprise":
      return { text: "Enterprise", className: "bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-500 border-amber-500/20" };
  }
}

/**
 * Calculate usage percentage for progress bar
 */
function calculateUsagePercentage(stats: TCIUsageStats): number {
  const { quickAnalyses, fullAnalyses, quickLimit, fullLimit } = stats.today;

  // Pro/Enterprise have unlimited
  if (quickLimit === Infinity && fullLimit === Infinity) {
    // Show a filled bar for unlimited users
    return 100;
  }

  // For limited tiers, calculate percentage of quick analyses used
  if (quickLimit > 0) {
    return (quickAnalyses / quickLimit) * 100;
  }

  return 0;
}

/**
 * Determine if user is running low on quota
 */
function isLowOnQuota(stats: TCIUsageStats): boolean {
  const { quickAnalyses, fullAnalyses, quickLimit, fullLimit } = stats.today;

  // Pro/Enterprise never low
  if (quickLimit === Infinity && fullLimit === Infinity) {
    return false;
  }

  // Low if at 80% or more of daily limit
  return quickAnalyses >= quickLimit * 0.8;
}

/**
 * Get progress bar color based on usage
 */
function getProgressColor(stats: TCIUsageStats): string {
  if (stats.tier === "pro" || stats.tier === "enterprise") {
    return "[&>div]:bg-gradient-to-r [&>div]:from-purple-500 [&>div]:to-blue-500";
  }

  if (isLowOnQuota(stats)) {
    return "[&>div]:bg-gradient-to-r [&>div]:from-orange-500 [&>div]:to-red-500";
  }

  return "[&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500";
}

/**
 * Format usage text for display
 */
function formatUsageText(stats: TCIUsageStats): string {
  const { quickAnalyses, fullAnalyses, quickRemaining, fullRemaining, quickLimit, fullLimit } = stats.today;

  // Pro/Enterprise
  if (quickLimit === Infinity && fullLimit === Infinity) {
    const total = quickAnalyses + fullAnalyses;
    return total === 0 ? "Unlimited" : `${total} today`;
  }

  // Free/Starter (only quick analyses)
  if (fullLimit === 0) {
    return `${quickRemaining} left`;
  }

  // Mixed limits
  return `${quickRemaining} quick, ${fullRemaining} full left`;
}

/**
 * UsageQuotaWidget Component
 *
 * Displays TCI analysis quota with the same UI pattern as the token bar.
 * Shows:
 * - TCI tier badge
 * - Analyses used today
 * - Progress bar (color-coded by usage)
 * - Warning when quota is low
 * - Upgrade prompt (optional)
 */
export function UsageQuotaWidget({ onUpgrade, compact = false }: UsageQuotaWidgetProps) {
  const { data: stats, isLoading, error } = useTCIUsage();

  // Don't render anything if loading or error
  if (isLoading || error || !stats) {
    return null;
  }

  const tierBadge = getTierBadge(stats.tier);
  const usagePercentage = calculateUsagePercentage(stats);
  const lowOnQuota = isLowOnQuota(stats);
  const progressColor = getProgressColor(stats);
  const usageText = formatUsageText(stats);

  const isLocked = stats.tier === "free" || stats.tier === "starter";

  return (
    <div className="mb-3">
      {/* Always Active Badge */}
      <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded bg-green-500/10 border border-green-500/20">
        <Shield className="w-3 h-3 text-green-500" />
        <span className="text-[10px] font-medium text-green-500">
          TCI Always Active
        </span>
      </div>

      <div className="flex items-center justify-between text-xs mb-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {isLocked ? "Running silently" : "TCI Analyses"}
          </span>
          <span className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded border",
            tierBadge.className
          )}>
            {tierBadge.text}
          </span>
          {lowOnQuota && (
            <AlertTriangle className="w-3 h-3 text-orange-500" />
          )}
        </div>
        <span className={cn(
          "font-medium",
          lowOnQuota ? "text-orange-500" : "text-foreground"
        )}>
          {isLocked ? "Upgrade to view" : usageText}
        </span>
      </div>

      <Progress
        value={usagePercentage}
        className={cn("h-2", progressColor)}
      />

      {/* Warning message when quota is low */}
      {lowOnQuota && (
        <p className="text-xs text-orange-500 mt-1.5 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {stats.today.quickRemaining === 0
            ? "Daily limit reached"
            : "Running low - consider upgrading"
          }
        </p>
      )}

      {/* Upgrade prompt for non-Pro/Enterprise users */}
      {!compact && stats.tier !== "pro" && stats.tier !== "enterprise" && stats.upgradeOptions && (
        <button
          onClick={onUpgrade}
          className="w-full mt-2 px-2 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 hover:border-purple-500/40 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-purple-500" />
              <span className="text-xs font-medium text-purple-500">
                Upgrade to view TCI insights
              </span>
            </div>
            <TrendingUp className="w-3 h-3 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {stats.upgradeOptions.pro && (
            <p className="text-[10px] text-muted-foreground text-left mt-0.5">
              See full analysis results • {stats.upgradeOptions.pro.price}
            </p>
          )}
        </button>
      )}

      {/* Quick stats for Pro/Enterprise users */}
      {!compact && (stats.tier === "pro" || stats.tier === "enterprise") && (
        <div className="mt-2 px-2 py-1.5 rounded-lg bg-purple-500/5 border border-purple-500/10">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">This month</span>
            <span className="font-medium text-foreground">
              {stats.thisMonth.quickAnalyses + stats.thisMonth.fullAnalyses} analyses
            </span>
          </div>
          {stats.thisMonth.totalCost > 0 && (
            <div className="flex items-center justify-between text-[10px] mt-1">
              <span className="text-muted-foreground">Saved</span>
              <span className="font-medium text-green-500">
                ${stats.thisMonth.totalCost.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for smaller spaces
 */
export function CompactUsageQuotaWidget(props: Omit<UsageQuotaWidgetProps, 'compact'>) {
  return <UsageQuotaWidget {...props} compact />;
}
