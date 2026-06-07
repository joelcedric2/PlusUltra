/**
 * TCI Insights Panel
 *
 * Passive, always-visible panel showing TCI analysis results.
 * Appears automatically when analysis completes.
 *
 * For Free/Starter: Shows upgrade prompt
 * For Pro/Enterprise: Shows full analysis results
 */

import { useState } from "react";
import { X, ChevronUp, ChevronDown, Lock, Sparkles, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getUserTier } from "./api";
import { TCIResultsViewer } from "./TCIResultsViewer";
import { UpgradePromptModal } from "./UpgradePromptModal";
import type { TCIAnalysisResponse } from "./types";

export interface TCIInsightsPanelProps {
  /** Latest analysis result */
  result?: TCIAnalysisResponse | null;
  /** Whether analysis is currently running */
  isAnalyzing?: boolean;
  /** Callback when panel is closed (minimized) */
  onClose?: () => void;
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * TCIInsightsPanel Component
 *
 * Passive panel that shows TCI analysis results:
 * - Always visible (can be minimized)
 * - Auto-expands when new results arrive
 * - Free/Starter: Shows "Upgrade to view insights"
 * - Pro/Enterprise: Shows full TCI results
 * - Cannot be disabled (always-on feature)
 *
 * Usage:
 * ```tsx
 * const { lastResult, isAnalyzing } = useTCIBackgroundAnalyzer({
 *   code: currentCode,
 *   language: "typescript"
 * });
 *
 * <TCIInsightsPanel
 *   result={lastResult}
 *   isAnalyzing={isAnalyzing}
 * />
 * ```
 */
export function TCIInsightsPanel({
  result,
  isAnalyzing = false,
  onClose,
  defaultCollapsed = false,
  className,
}: TCIInsightsPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const userTier = getUserTier();
  const isLocked = userTier === "free" || userTier === "starter";

  // Auto-expand when new results arrive
  const handleNewResult = () => {
    if (result && !isLocked) {
      setIsCollapsed(false);
    }
  };

  // Expand on result change
  useState(() => {
    handleNewResult();
  });

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleUpgradeClick = () => {
    setShowUpgradeModal(true);
  };

  // Don't render if no result and not analyzing
  if (!result && !isAnalyzing) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          "fixed bottom-0 right-4 w-96 bg-card border-t border-l border-r border-border rounded-t-xl shadow-2xl transition-all duration-300 z-50",
          isCollapsed ? "h-12" : "h-[600px]",
          className
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-3 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={handleToggleCollapse}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-500" />
            <h3 className="font-semibold text-sm">
              TCI Insights
              {isAnalyzing && (
                <span className="ml-2 text-xs text-blue-500 font-normal">
                  Analyzing...
                </span>
              )}
            </h3>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCollapse();
              }}
              className="h-7 w-7 p-0"
            >
              {isCollapsed ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="h-7 w-7 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        {!isCollapsed && (
          <div className="h-[calc(100%-49px)] overflow-y-auto">
            {isLocked ? (
              // Locked state for Free/Starter
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-purple-500/10 border-2 border-purple-500/20 flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8 text-purple-500" />
                </div>
                <h3 className="font-bold text-lg mb-2">TCI is Always Active</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-xs">
                  TCI is analyzing your code in the background and learning from it.
                  Upgrade to Pro to see full insights and recommendations.
                </p>
                <div className="space-y-2 text-xs text-muted-foreground mb-6">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-green-500" />
                    <span>6-layer analysis running</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-green-500" />
                    <span>Feeding learning loop</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-green-500" />
                    <span>Building pattern library</span>
                  </div>
                </div>
                <Button
                  onClick={handleUpgradeClick}
                  className="bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-90 text-white"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Upgrade to Pro
                </Button>
              </div>
            ) : result ? (
              // Results for Pro/Enterprise
              <div className="p-4">
                <TCIResultsViewer
                  report={result.report}
                  analysisId={result.analysisId}
                  analysisType="full"
                />
              </div>
            ) : isAnalyzing ? (
              // Analyzing state
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-blue-500/10 border-2 border-blue-500/20 flex items-center justify-center mb-4 relative">
                  <Shield className="w-8 h-8 text-blue-500" />
                  <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                </div>
                <h3 className="font-bold text-lg mb-2">Analyzing Code...</h3>
                <p className="text-sm text-muted-foreground">
                  TCI is running 6-layer analysis on your code
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Upgrade Modal */}
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
