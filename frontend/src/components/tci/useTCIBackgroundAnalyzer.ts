/**
 * TCI Background Analyzer Hook
 *
 * Automatically triggers TCI analysis when code changes occur.
 * Runs silently for all users - Free/Starter users feed the learning loop,
 * Pro/Enterprise users see results.
 *
 * This is a SYSTEM-TRIGGERED feature, not user-controlled.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAnalyzeCode, getUserTier } from "./api";
import type { TCIAnalysisResponse, AnalysisType } from "./types";

export interface TCIBackgroundAnalyzerOptions {
  /** Code to analyze */
  code: string;
  /** Programming language */
  language: "typescript" | "javascript" | "python" | "go" | "rust";
  /** Optional file path */
  filePath?: string;
  /** Debounce delay in milliseconds (default: 2000ms) */
  debounceMs?: number;
  /** Callback when analysis completes */
  onAnalysisComplete?: (result: TCIAnalysisResponse) => void;
  /** Callback when analysis fails */
  onAnalysisError?: (error: Error) => void;
  /** Enable/disable auto-analysis (default: true) */
  enabled?: boolean;
  /** Trigger analysis on mount (default: false) */
  analyzeOnMount?: boolean;
}

/**
 * useTCIBackgroundAnalyzer Hook
 *
 * Automatically analyzes code in the background:
 * - Debounces code changes (default 2 seconds)
 * - Runs appropriate analysis based on tier:
 *   - Free/Starter: Quick analysis (silent, feeds learning loop)
 *   - Pro/Enterprise: Full analysis (shows results)
 * - No user interaction required
 * - Always running (unless explicitly disabled)
 *
 * Usage:
 * ```tsx
 * const { isAnalyzing, lastResult, error } = useTCIBackgroundAnalyzer({
 *   code: currentCode,
 *   language: "typescript",
 *   filePath: currentFile,
 *   onAnalysisComplete: (result) => {
 *     // Show results panel for Pro/Enterprise users
 *     if (userTier === 'pro' || userTier === 'enterprise') {
 *       setShowInsights(true);
 *     }
 *   }
 * });
 * ```
 */
export function useTCIBackgroundAnalyzer({
  code,
  language,
  filePath,
  debounceMs = 2000,
  onAnalysisComplete,
  onAnalysisError,
  enabled = true,
  analyzeOnMount = false,
}: TCIBackgroundAnalyzerOptions) {
  const debounceTimer = useRef<NodeJS.Timeout>();
  const lastAnalyzedCode = useRef<string>("");
  const userTier = getUserTier();

  // Determine analysis type based on tier
  const analysisType: AnalysisType =
    userTier === "pro" || userTier === "enterprise" ? "full" : "quick";

  const analyzeCodeMutation = useAnalyzeCode(analysisType);

  // Trigger analysis
  const triggerAnalysis = useCallback(
    async (codeToAnalyze: string) => {
      // Skip if code hasn't changed
      if (codeToAnalyze === lastAnalyzedCode.current) {
        return;
      }

      // Skip if code is empty or too short
      if (!codeToAnalyze.trim() || codeToAnalyze.trim().length < 10) {
        return;
      }

      lastAnalyzedCode.current = codeToAnalyze;

      try {
        console.log(
          `[TCI Background] Analyzing code (${analysisType} analysis for ${userTier} tier)...`
        );

        const result = await analyzeCodeMutation.mutateAsync({
          code: codeToAnalyze,
          language,
          filePath,
          implementFixes: userTier === "pro" || userTier === "enterprise",
        });

        console.log(
          `[TCI Background] Analysis complete in ${result.timeElapsed.toFixed(1)}s`
        );

        onAnalysisComplete?.(result);
      } catch (error: any) {
        console.error("[TCI Background] Analysis failed:", error.message);

        // Don't show errors to Free/Starter users (silent operation)
        if (userTier === "pro" || userTier === "enterprise") {
          onAnalysisError?.(error);
        }
      }
    },
    [analysisType, language, filePath, userTier, analyzeCodeMutation, onAnalysisComplete, onAnalysisError]
  );

  // Debounced analysis on code change
  useEffect(() => {
    if (!enabled || !code) {
      return;
    }

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set new timer
    debounceTimer.current = setTimeout(() => {
      triggerAnalysis(code);
    }, debounceMs);

    // Cleanup
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [code, enabled, debounceMs, triggerAnalysis]);

  // Analyze on mount if requested
  useEffect(() => {
    if (analyzeOnMount && enabled && code) {
      triggerAnalysis(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  return {
    /** Whether analysis is currently running */
    isAnalyzing: analyzeCodeMutation.isPending,
    /** Last successful analysis result */
    lastResult: analyzeCodeMutation.data || null,
    /** Last error */
    error: analyzeCodeMutation.error,
    /** Manually trigger analysis (bypasses debounce) */
    triggerNow: () => triggerAnalysis(code),
    /** Current user tier */
    userTier,
    /** Analysis type being used */
    analysisType,
  };
}
