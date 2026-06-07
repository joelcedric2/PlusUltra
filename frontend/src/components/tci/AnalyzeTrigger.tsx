/**
 * TCI Analysis Trigger Button
 *
 * Button component to trigger TCI analysis on code.
 * Handles both quick and full analysis modes with proper error handling.
 */

import { useState } from "react";
import { Sparkles, Zap, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAnalyzeCode, getUserTier } from "./api";
import { useToast } from "@/hooks/use-toast";
import { UpgradePromptModal } from "./UpgradePromptModal";
import type { AnalysisType, TCIAnalysisResponse } from "./types";

export interface AnalyzeTriggerProps {
  /** Code to analyze */
  code: string;
  /** Programming language */
  language: "typescript" | "javascript" | "python" | "go" | "rust";
  /** Optional file path */
  filePath?: string;
  /** Optional proposed change description */
  proposedChange?: string;
  /** Callback when analysis completes */
  onAnalysisComplete?: (result: TCIAnalysisResponse) => void;
  /** Callback when analysis fails */
  onAnalysisError?: (error: Error) => void;
  /** Show as icon button instead of text button */
  iconOnly?: boolean;
  /** Custom className */
  className?: string;
  /** Size variant */
  size?: "default" | "sm" | "lg" | "icon";
}

/**
 * AnalyzeTrigger Component
 *
 * Provides a button (or dropdown) to trigger TCI analysis.
 * - Quick Analysis: 2 layers, ~75% accuracy, 6-8s, $0.30
 * - Full Analysis: 6 layers, 93-95% accuracy, 20-30s, $0.90
 *
 * Automatically handles:
 * - Tier-based access control
 * - Upgrade prompts when limits are reached
 * - Loading states
 * - Error handling
 */
export function AnalyzeTrigger({
  code,
  language,
  filePath,
  proposedChange,
  onAnalysisComplete,
  onAnalysisError,
  iconOnly = false,
  className,
  size = "default",
}: AnalyzeTriggerProps) {
  const { toast } = useToast();
  const [analysisType, setAnalysisType] = useState<AnalysisType>("quick");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"limit-reached" | "feature-locked" | "suggestion">("suggestion");

  const analyzeCodeMutation = useAnalyzeCode(analysisType);
  const userTier = getUserTier();

  const handleAnalyze = async (type: AnalysisType, implementFixes: boolean = false) => {
    if (!code.trim()) {
      toast({
        title: "No code to analyze",
        description: "Please enter some code first",
        variant: "destructive",
      });
      return;
    }

    setAnalysisType(type);

    try {
      const result = await analyzeCodeMutation.mutateAsync({
        code,
        language,
        filePath,
        proposedChange,
        implementFixes,
      });

      toast({
        title: "Analysis complete",
        description: `${type === "quick" ? "Quick" : "Full"} analysis finished in ${result.timeElapsed.toFixed(1)}s`,
      });

      onAnalysisComplete?.(result);
    } catch (error: any) {
      console.error("TCI analysis failed:", error);

      // Check for tier-based errors
      if (error.message?.includes("not available on your plan")) {
        setUpgradeReason("feature-locked");
        setShowUpgradeModal(true);
      } else if (error.message?.includes("Daily limit exceeded")) {
        setUpgradeReason("limit-reached");
        setShowUpgradeModal(true);
      } else {
        toast({
          title: "Analysis failed",
          description: error.message || "Failed to analyze code",
          variant: "destructive",
        });
      }

      onAnalysisError?.(error);
    }
  };

  const handleQuickAnalysis = () => handleAnalyze("quick", false);
  const handleFullAnalysis = () => handleAnalyze("full", false);
  const handleFullWithFixes = () => handleAnalyze("full", true);

  const isLoading = analyzeCodeMutation.isPending;

  // Icon-only button (for toolbar)
  if (iconOnly) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={isLoading}
              className={cn("relative", className)}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={handleQuickAnalysis} disabled={isLoading}>
              <Zap className="w-4 h-4 mr-2 text-blue-500" />
              <div className="flex-1">
                <div className="font-medium text-sm">Quick Analysis</div>
                <div className="text-xs text-muted-foreground">~75% accuracy • 6-8s</div>
              </div>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={handleFullAnalysis} disabled={isLoading}>
              <Sparkles className="w-4 h-4 mr-2 text-purple-500" />
              <div className="flex-1">
                <div className="font-medium text-sm">Full Analysis</div>
                <div className="text-xs text-muted-foreground">93-95% accuracy • 20-30s</div>
              </div>
            </DropdownMenuItem>

            {(userTier === "pro" || userTier === "enterprise") && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleFullWithFixes} disabled={isLoading}>
                  <Sparkles className="w-4 h-4 mr-2 text-green-500" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">Full + Auto-Fix</div>
                    <div className="text-xs text-muted-foreground">Analysis with fixes</div>
                  </div>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <UpgradePromptModal
          currentTier={userTier}
          reason={upgradeReason}
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          onUpgrade={(tier) => {
            console.log("Upgrade to:", tier);
            // TODO: Navigate to billing page
            setShowUpgradeModal(false);
          }}
        />
      </>
    );
  }

  // Full button with dropdown
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            size={size}
            disabled={isLoading}
            className={cn(
              "bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-90 text-white shadow-lg shadow-purple-500/20",
              className
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Analyze Code
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <div className="px-3 py-2 text-xs text-muted-foreground mb-2">
            Choose analysis type:
          </div>

          <DropdownMenuItem onClick={handleQuickAnalysis} disabled={isLoading}>
            <Zap className="w-4 h-4 mr-3 text-blue-500" />
            <div className="flex-1">
              <div className="font-medium text-sm mb-0.5">Quick Analysis</div>
              <div className="text-xs text-muted-foreground">
                2 layers • ~75% accuracy • 6-8s • $0.30
              </div>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleFullAnalysis} disabled={isLoading}>
            <Sparkles className="w-4 h-4 mr-3 text-purple-500" />
            <div className="flex-1">
              <div className="font-medium text-sm mb-0.5">Full Analysis</div>
              <div className="text-xs text-muted-foreground">
                6 layers • 93-95% accuracy • 20-30s • $0.90
              </div>
            </div>
          </DropdownMenuItem>

          {(userTier === "pro" || userTier === "enterprise") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleFullWithFixes} disabled={isLoading}>
                <Sparkles className="w-4 h-4 mr-3 text-green-500" />
                <div className="flex-1">
                  <div className="font-medium text-sm mb-0.5">Full + Auto-Fix</div>
                  <div className="text-xs text-muted-foreground">
                    Analysis with automatic fix implementation
                  </div>
                </div>
              </DropdownMenuItem>
            </>
          )}

          {userTier === "free" && (
            <>
              <DropdownMenuSeparator />
              <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-3 h-3" />
                Upgrade to Pro for full analysis
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <UpgradePromptModal
        currentTier={userTier}
        reason={upgradeReason}
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        onUpgrade={(tier) => {
          console.log("Upgrade to:", tier);
          // TODO: Navigate to billing page
          setShowUpgradeModal(false);
        }}
      />
    </>
  );
}

/**
 * Compact version for toolbars
 */
export function CompactAnalyzeTrigger(
  props: Omit<AnalyzeTriggerProps, "iconOnly" | "size">
) {
  return <AnalyzeTrigger {...props} iconOnly size="icon" />;
}
