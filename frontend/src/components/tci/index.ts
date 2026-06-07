/**
 * TCI 6-Layer System - Component Exports
 *
 * Centralized exports for all TCI components.
 *
 * TCI is ALWAYS ACTIVE - runs automatically in the background for all users.
 * Free/Starter: TCI runs silently, feeds learning loop
 * Pro/Enterprise: TCI runs and shows full insights
 */

// Types
export * from "./types";

// API Hooks
export * from "./api";

// Background Analyzer (System-Triggered)
export { useTCIBackgroundAnalyzer } from "./useTCIBackgroundAnalyzer";
export type { TCIBackgroundAnalyzerOptions } from "./useTCIBackgroundAnalyzer";

// Main Components
export { TCIResultsViewer } from "./TCIResultsViewer";
export type { TCIResultsViewerProps } from "./TCIResultsViewer";

export { TCIInsightsPanel } from "./TCIInsightsPanel";
export type { TCIInsightsPanelProps } from "./TCIInsightsPanel";

export { TCIStatusIndicator, CompactTCIStatusIndicator } from "./TCIStatusIndicator";
export type { TCIStatusIndicatorProps } from "./TCIStatusIndicator";

export { UsageQuotaWidget, CompactUsageQuotaWidget } from "./UsageQuotaWidget";
export type { UsageQuotaWidgetProps } from "./UsageQuotaWidget";

export { UpgradePromptModal } from "./UpgradePromptModal";
export type { UpgradePromptProps } from "./UpgradePromptModal";

export { LogicVerificationDisplay } from "./LogicVerificationDisplay";
export type { LogicVerificationDisplayProps } from "./LogicVerificationDisplay";

export { FeedbackDialog } from "./FeedbackDialog";
export type { FeedbackDialogProps } from "./FeedbackDialog";

// Deprecated: AnalyzeTrigger (TCI is now automatic, system-triggered)
// @deprecated Use useTCIBackgroundAnalyzer instead
export { AnalyzeTrigger, CompactAnalyzeTrigger } from "./AnalyzeTrigger";
export type { AnalyzeTriggerProps } from "./AnalyzeTrigger";
