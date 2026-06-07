/**
 * TCI 6-Layer System - TypeScript Types
 *
 * Type definitions for TCI analysis results and UI components.
 */

export type UserTier = 'free' | 'starter' | 'pro' | 'enterprise';

export type AnalysisType = 'quick' | 'full';

export type Verdict = 'SHIP' | 'REFACTOR' | 'REJECT';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type PatternCategory = 'bug' | 'vulnerability' | 'anti-pattern' | 'best-practice';

// Layer 1: Visual Pattern Recognition
export interface VisualPattern {
  type: string;
  description: string;
  severity: Severity;
  location: {
    line: number;
    column?: number;
  };
  confidence: number;
}

export interface VisualInsights {
  visualPatterns: VisualPattern[];
  overallCodeHealth: number; // 0-10 scale
  confidence: number;
  screenshot?: string; // Base64 or URL
  timing: number;
}

// Layer 2: Causal Chain Analysis
export interface CausalStep {
  step: number;
  description: string;
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  affectedFiles: string[];
  likelihood: number;
}

export interface CausalChain {
  chain: CausalStep[];
  breakingChanges: string[];
  riskAssessment: {
    immediate: number;
    shortTerm: number;
    longTerm: number;
  };
  confidence: number;
  timing: number;
}

// Layer 3: Historical Pattern Matching
export interface SimilarCode {
  pattern: string;
  description: string;
  knownBugs: string[];
  frequency: number;
}

export interface HistoricalInsights {
  thisCodeMatchesPattern: string;
  similarPatterns: SimilarCode[];
  commonMistakes: string[];
  recommendations: string[];
  confidence: number;
  timing: number;
}

// Layer 4: Symbolic Logic Verification
export interface LogicProof {
  invariant: string;
  holds: boolean;
  proof?: string;
  counterexample?: string;
}

export interface LogicVerification {
  invariants: LogicProof[];
  formalCorrectness: boolean;
  logicErrors: string[];
  confidence: number;
  timing: number;
}

// Layer 5: Cross-Model Synthesis
export interface ModelAgreement {
  model: string;
  verdict: Verdict;
  confidence: number;
  weight: number;
}

export interface SynthesizedRisk {
  overall: number; // 0-10 scale
  breakdown: {
    security: number;
    performance: number;
    maintainability: number;
    correctness: number;
  };
}

export interface TCIVerdict {
  verdict: Verdict;
  confidence: number;
  synthesizedRisk: SynthesizedRisk;
  modelAgreements: ModelAgreement[];
  consensusStrength: number;
  conflicts: string[];
  actionableSteps: string[];
  timing: number;
}

// Layer 6: Implementation
export interface CodeChange {
  type: 'add' | 'remove' | 'modify';
  line: number;
  before?: string;
  after?: string;
  reason: string;
}

export interface Implementation {
  improvedCode: string;
  changes: CodeChange[];
  testsPassed: boolean;
  confidence: number;
  timing: number;
}

// Complete TCI Report
export interface TCIReport {
  visual: VisualInsights;
  causal?: CausalChain; // Optional for quick analysis
  historical: HistoricalInsights;
  logic?: LogicVerification; // Optional for quick analysis
  verdict: TCIVerdict;
  implementation?: Implementation; // Optional
  timings: {
    visual?: number;
    causal?: number;
    historical?: number;
    logic?: number;
    synthesis?: number;
    implementation?: number;
    total?: number;
  };
}

// API Response Types
export interface TCIAnalysisResponse {
  report: TCIReport;
  analysisId: string;
  cost: number;
  timeElapsed: number;
  message?: string;
  upgradePrompt?: string;
}

export interface TCIFeedbackRequest {
  analysisId: string;
  wasHelpful: boolean;
  actualOutcome: 'shipped' | 'refactored' | 'rejected';
  bugsFound?: string[];
  breakingChanges?: string[];
  comment?: string;
  layerFeedback?: {
    visualHelpful?: boolean;
    causalHelpful?: boolean;
    historicalHelpful?: boolean;
    logicHelpful?: boolean;
  };
}

// Usage Statistics
export interface TCIUsageStats {
  tier: UserTier;
  today: {
    quickAnalyses: number;
    fullAnalyses: number;
    quickRemaining: number;
    fullRemaining: number;
    quickLimit: number;
    fullLimit: number;
  };
  thisMonth: {
    quickAnalyses: number;
    fullAnalyses: number;
    totalCost: number;
  };
  allTime: {
    totalAnalyses: number;
    totalCost: number;
  };
  upgradeOptions?: {
    pro?: {
      tier: string;
      price: string;
      features: string[];
    };
    enterprise?: {
      tier: string;
      price: string;
      features: string[];
    };
  };
}

// Component Props
export interface TCIResultsViewerProps {
  report: TCIReport;
  analysisId: string;
  analysisType: AnalysisType;
  onFeedback?: (feedback: TCIFeedbackRequest) => void;
}

export interface UsageQuotaWidgetProps {
  stats: TCIUsageStats;
  onUpgrade?: () => void;
}

export interface UpgradePromptProps {
  currentTier: UserTier;
  reason: 'limit-reached' | 'feature-locked' | 'suggestion';
  onUpgrade?: () => void;
  onDismiss?: () => void;
}
