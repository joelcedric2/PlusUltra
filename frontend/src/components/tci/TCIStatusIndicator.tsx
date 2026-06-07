/**
 * TCI Status Indicator
 *
 * Shows TCI analysis status in the editor.
 * Always visible - indicates TCI is working in the background.
 *
 * For Free/Starter: Shows locked state with upgrade prompt
 * For Pro/Enterprise: Shows analysis status and opens insights panel
 */

import { useState } from "react";
import { Shield, Loader2, CheckCircle, AlertTriangle, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserTier } from "./api";
import { UpgradePromptModal } from "./UpgradePromptModal";
import type { TCIAnalysisResponse, Verdict } from "./types";

export interface TCIStatusIndicatorProps {
  /** Whether analysis is currently running */
  isAnalyzing: boolean;
  /** Last analysis result */
  lastResult?: TCIAnalysisResponse | null;
  /** Callback when user clicks to view insights */
  onViewInsights?: () => void;
  /** Compact mode (icon only) */
  compact?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * Get status color based on verdict
 */
function getVerdictColor(verdict: Verdict): string {
  switch (verdict) {
    case "SHIP":
      return "text-green-500";
    case "REFACTOR":
      return "text-orange-500";
    case "REJECT":
      return "text-red-500";
  }
}

/**
 * Get status icon based on verdict
 */
function getVerdictIcon(verdict: Verdict) {
  switch (verdict) {
    case "SHIP":
      return CheckCircle;
    case "REFACTOR":
      return AlertTriangle;
    case "REJECT":
      return AlertTriangle;
  }
}

/**
 * TCIStatusIndicator Component
 *
 * Shows TCI analysis status:
 * - Analyzing: Spinner + "TCI analyzing..."
 * - Complete: Verdict icon + "SHIP/REFACTOR/REJECT"
 * - Locked (Free/Starter): Lock icon + "Upgrade to view"
 *
 * Always visible to indicate TCI is working.
 */
export function TCIStatusIndicator({
  isAnalyzing,
  lastResult,
  onViewInsights,
  compact = false,
  className,
}: TCIStatusIndicatorProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const userTier = getUserTier();
  const isLocked = userTier === "free" || userTier === "starter";

  const handleClick = () => {
    if (isLocked) {
      setShowUpgradeModal(true);
    } else if (onViewInsights) {
      onViewInsights();
    }
  };

  // Locked state for Free/Starter
  if (isLocked) {
    return (
      <>
        <button
          onClick={handleClick}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50 hover:border-purple-500/30 transition-all group cursor-pointer",
            compact && "px-2 py-1",
            className
          )}
          title="TCI is analyzing in the background. Upgrade to view insights."
        >
          <Lock className={cn("text-muted-foreground group-hover:text-purple-500 transition-colors", compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
          {!compact && (
            <>
              <span className="text-xs text-muted-foreground group-hover:text-purple-500 transition-colors font-medium">
                TCI Active
              </span>
              <Sparkles className="w-3 h-3 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </>
          )}
        </button>

        <UpgradePromptModal
          currentTier={userTier}
          reason="feature-locked"
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          onUpgrade={(tier) => {
            console.log("Upgrade to:", tier);
            setShowUpgradeModal(false);
          }}
        />
      </>
    );
  }

  // Analyzing state
  if (isAnalyzing) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20",
          compact && "px-2 py-1",
          className
        )}
      >
        <Loader2 className={cn("text-blue-500 animate-spin", compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
        {!compact && (
          <span className="text-xs text-blue-500 font-medium">
            TCI Analyzing...
          </span>
        )}
      </div>
    );
  }

  // Completed state with verdict
  if (lastResult?.report.verdict) {
    const verdict = lastResult.report.verdict.verdict;
    const Icon = getVerdictIcon(verdict);
    const colorClass = getVerdictColor(verdict);

    return (
      <button
        onClick={handleClick}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer",
          verdict === "SHIP" && "bg-green-500/10 border-green-500/20 hover:border-green-500/40",
          verdict === "REFACTOR" && "bg-orange-500/10 border-orange-500/20 hover:border-orange-500/40",
          verdict === "REJECT" && "bg-red-500/10 border-red-500/20 hover:border-red-500/40",
          compact && "px-2 py-1",
          className
        )}
        title={`TCI Verdict: ${verdict} (${(lastResult.report.verdict.confidence * 100).toFixed(0)}% confidence)`}
      >
        <Icon className={cn(colorClass, compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
        {!compact && (
          <>
            <span className={cn("text-xs font-bold", colorClass)}>
              {verdict}
            </span>
            <span className="text-xs text-muted-foreground">
              {(lastResult.report.verdict.confidence * 100).toFixed(0)}%
            </span>
          </>
        )}
      </button>
    );
  }

  // Idle state (TCI ready)
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/20 border border-border/30",
        compact && "px-2 py-1",
        className
      )}
      title="TCI is ready to analyze code"
    >
      <Shield className={cn("text-muted-foreground", compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
      {!compact && (
        <span className="text-xs text-muted-foreground font-medium">
          TCI Ready
        </span>
      )}
    </div>
  );
}

/**
 * Compact version for toolbars
 */
export function CompactTCIStatusIndicator(
  props: Omit<TCIStatusIndicatorProps, "compact">
) {
  return <TCIStatusIndicator {...props} compact />;
}
