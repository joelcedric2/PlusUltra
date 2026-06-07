/**
 * Temporal Code Intelligence (TCI) - Type Definitions
 *
 * Multi-Model Analysis System:
 * - Layer 1: Visual Pattern Recognition (DeepSeek OCR)
 * - Layer 1b: Video/Animation Understanding (Kimi 2)
 * - Layer 2: Causal Chain Reasoning (Claude 4.5)
 * - Layer 3: Historical Pattern Matching (GPT-5)
 * - Layer 4: Symbolic Logic Verification (Grok)
 * - Layer 5: Cross-Model Synthesis (Gemini)
 */

// ============================================================
// Project Context
// ============================================================

export interface ProjectContext {
  filePath: string; // Path to the file being analyzed
  language: string; // 'typescript' | 'python' | 'go' | 'rust'
  framework?: string; // 'react' | 'nextjs' | 'express' | 'fastapi'

  // File relationships
  imports: string[]; // Modules/files this file imports
  dependencies: string[]; // External dependencies used
  exports: string[]; // Symbols exported from this file

  // Quality metrics (optional)
  testCoverage?: number; // 0-100

  // Legacy fields (optional for backwards compatibility)
  domain?: string; // 'web' | 'mobile' | 'backend' | 'ml' | 'blockchain'
  importedBy?: string[]; // Files that import this file
  linesOfCode?: number;
  invariants?: Invariant[];
}

export interface Invariant {
  id: string;
  description: string;
  expression: string; // Logical expression
  category: 'security' | 'correctness' | 'performance' | 'business';
}

// ============================================================
// Layer 1: Visual Pattern Recognition (DeepSeek OCR)
// ============================================================

export type VisualPatternType =
  | 'ASYMMETRY'      // Unmatched brackets, inconsistent indentation
  | 'DENSITY'        // Too many nested blocks
  | 'COLOR_PATTERN'  // Syntax highlighting reveals issues
  | 'REPETITION'     // Code duplication
  | 'GAPS'           // Missing error handling
  | 'LINE_LENGTH';   // Readability issues

export interface VisualPattern {
  type: VisualPatternType;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  location: string; // Line range or description
  description: string; // What DeepSeek sees
  likelyIssue: string; // What this usually indicates
}

export interface VisualInsights {
  visualPatterns: VisualPattern[];
  overallCodeHealth: number; // 0-10 scale
  reasoning: string; // Why this score
  confidence: number; // 0-1
}

// ============================================================
// Layer 1b: Kimi 2 Visual/Video Understanding
// ============================================================

/**
 * Animation timing information extracted by Kimi 2
 */
export interface AnimationTiming {
  duration: number; // milliseconds
  easing: string; // CSS easing function (ease, ease-in-out, cubic-bezier, etc.)
  delay: number; // delay before animation starts (ms)
}

/**
 * Motion pattern detected in video/animation
 */
export interface MotionPattern {
  type: 'parallax' | 'scroll-animation' | 'hover-effect' | 'loading' | 'entrance' | 'exit' | 'css-animation' | 'transition';
  description: string; // Human-readable description
  timing?: AnimationTiming;
  elements: string[]; // CSS selectors or element descriptions
}

/**
 * CSS animation details extracted from video/code
 */
export interface CSSAnimation {
  name: string; // Animation name (e.g., 'fadeIn', 'slideUp')
  duration: number; // milliseconds
  easing: string; // Easing function
  delay?: number; // Delay in ms
  properties?: string[]; // CSS properties being animated (transform, opacity, etc.)
  selector?: string; // CSS selector for the animated element
  iterationCount?: number | 'infinite';
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
}

/**
 * UI interaction pattern detected in video recording
 */
export interface InteractionPattern {
  type: 'click' | 'hover' | 'scroll' | 'drag' | 'input';
  element: string; // Selector or description of interacted element
  effect: string; // Visual effect that occurs
  timing?: AnimationTiming;
  frequency?: number; // How often this interaction occurred
}

/**
 * Kimi 2 Visual Insights - Complete analysis result
 * Contains video/animation understanding for frontend tasks
 */
export interface KimiVisualInsights {
  // Summary of what was observed in the video/screenshot
  videoSummary?: string;

  // Motion patterns detected (parallax, scroll animations, hover effects)
  motionPatterns: MotionPattern[];

  // CSS animations extracted with timing details
  cssAnimations: CSSAnimation[];

  // User interaction patterns and their visual feedback
  uiInteractions: InteractionPattern[];

  // Confidence in the analysis (0-1)
  confidence: number;

  // Optional: Raw frames analyzed
  frameCount?: number;

  // Optional: Video duration in seconds
  videoDuration?: number;
}

// ============================================================
// Layer 2: Causal Chain Reasoning (Claude 4.5)
// ============================================================

export interface CausalStep {
  step: number;
  change: string; // What changes
  because: string; // Why it changes
  affects: string[]; // Files/components affected
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface CausalChain {
  causalChain: CausalStep[];
  predictedOutcome: string; // What will happen
  confidence: number; // 0-1
  recommendation: 'SAFE' | 'RISKY' | 'DANGEROUS';
}

// ============================================================
// Layer 3: Historical Pattern Matching (GPT-5)
// ============================================================

export interface SimilarPattern {
  pattern: string; // Description of pattern
  frequency: string; // How often seen
  commonBugs: string[]; // Typical bugs in this pattern
  bestPractice: string; // What experts do instead
}

export interface RiskAssessment {
  bugs: string[]; // Likely bugs based on history
  vulnerabilities: string[]; // Security issues
  performance: string; // Performance implications
}

export interface HistoricalInsights {
  similarPatterns: SimilarPattern[];
  thisCodeMatchesPattern: string; // Which pattern this code matches
  riskAssessment: RiskAssessment;
  confidence: number; // 0-1
}

// ============================================================
// Layer 4: Symbolic Logic Verification (Grok)
// ============================================================

export interface InvariantVerification {
  invariant: string; // Description
  holds: boolean; // True if invariant is preserved
  proof: string; // Logical reasoning
  counterexample?: string; // If violated, example that breaks it
}

export interface LogicVerification {
  verifications: InvariantVerification[];
  overallCorrectness: number; // 0-1
  recommendation: 'VERIFIED' | 'SUSPECTED_BUGS' | 'PROVEN_INCORRECT' | 'UNCERTAIN' | 'NOT_ANALYZED';
}

// ============================================================
// Layer 5: Cross-Model Synthesis (Gemini)
// ============================================================

export interface SynthesizedRisk {
  visual: number; // 0-10
  causal: number; // 0-10
  historical: number; // 0-10
  logical: number; // 0-10
  overall: number; // 0-10 (weighted average)
}

export interface ActionableStep {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  action: string; // What developer should do
  category: 'FIX' | 'REFACTOR' | 'ADD' | 'REMOVE' | 'TEST';
}

export interface TCIVerdict {
  agreements: string[]; // Insights all models agree on
  conflicts: string[]; // Where models disagree
  conflictResolutions: string[]; // How to resolve conflicts
  synthesizedRisk: SynthesizedRisk;
  actionableSteps: ActionableStep[];
  confidence: number; // 0-1
  verdict: 'SHIP' | 'REVIEW' | 'REFACTOR' | 'REJECT';
}

// ============================================================
// Layer 6: Claude Implementation (Claude 4.5)
// ============================================================

export interface ImplementationResult {
  originalCode: string;
  improvedCode: string;
  changes: CodeChange[];
  implementedFixes: ImplementedFix[];
  explanation: string;
  confidence: number; // 0-1
  remainingIssues: string[]; // Issues that couldn't be auto-fixed
}

export interface CodeChange {
  type: 'FIX' | 'REFACTOR' | 'ADD' | 'REMOVE';
  location: string; // File/line
  before: string; // Original code snippet
  after: string; // Improved code snippet
  reason: string; // Why this change was made
  fromLayer: 'visual' | 'causal' | 'historical' | 'logic' | 'synthesis';
}

export interface ImplementedFix {
  issue: string; // Original issue from analysis
  fix: string; // What was done
  layer: 'visual' | 'causal' | 'historical' | 'logic' | 'synthesis';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  success: boolean;
}

// ============================================================
// Complete TCI Report
// ============================================================

export interface TCIReport {
  // Analysis Results (6 Layers + Kimi)
  visual: VisualInsights;
  kimiVisual?: KimiVisualInsights; // Layer 1b: Kimi's video/animation analysis
  causal: CausalChain | null; // Null if no change proposed
  historical: HistoricalInsights;
  logic: LogicVerification;
  verdict: TCIVerdict;
  implementation: ImplementationResult; // Layer 6

  // Timing breakdown (always present from orchestrator)
  timings: {
    visual: number;
    kimiVisual?: number; // Kimi 2 analysis timing
    causal: number;
    historical: number;
    logic: number;
    synthesis: number;
    implementation: number; // Layer 6 timing
  };

  // Metadata (optional - added when storing to database)
  analysisId?: string;
  userId?: string;
  codeHash?: string;
  analysisType?: 'full' | 'quick';

  // Metrics (optional - calculated after analysis)
  timeElapsedMs?: number;
  costUSD?: number;
  confidence?: number; // 0-1
}

// ============================================================
// Learning & Feedback
// ============================================================

export interface TCIOutcome {
  analysisId: string;
  status: 'shipped' | 'refactored' | 'rejected';

  // Actual results
  bugsFound: Bug[];
  breakingChanges: BreakingChange[];
  userFeedback?: string;

  // Accuracy
  accuracy: {
    visual: boolean;
    causal: boolean;
    historical: boolean;
    logic: boolean;
    synthesis: boolean;
    overall: number; // 0-1
  };
}

export interface Bug {
  type: string; // 'sql-injection' | 'xss' | 'memory-leak' | etc.
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  location: string;
  description: string;
}

export interface BreakingChange {
  file: string;
  description: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ============================================================
// API Request/Response Types
// ============================================================

export interface TCIAnalyzeRequest {
  userId: string;
  code: string;
  context: ProjectContext;
  proposedChange?: string; // For causal analysis
  analysisType?: 'full' | 'quick'; // Default: tier-based
}

export interface TCIAnalyzeResponse {
  success: boolean;
  data?: TCIReport;
  error?: string;
  upgradePrompt?: string; // For free users
}

export interface TCIFeedbackRequest {
  analysisId: string;
  outcome: TCIOutcome;
}

export interface TCIFeedbackResponse {
  success: boolean;
  message: string;
  newAccuracy?: {
    visual: number;
    causal: number;
    historical: number;
    logic: number;
    synthesis: number;
    overall: number;
  };
}

// ============================================================
// Internal Service Types
// ============================================================

export interface CodeImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: 'png' | 'jpeg';
}

export interface ModelWeight {
  model: 'deepseek' | 'claude' | 'gpt5' | 'grok' | 'gemini' | 'kimi';
  analysisType: 'visual' | 'kimi-visual' | 'causal' | 'historical' | 'logic' | 'synthesis';
  currentWeight: number;
  accuracy: number;
  totalAnalyses: number;
  correctPredictions: number;
}

export interface TCIPattern {
  id: string;
  name: string;
  description: string;
  category: 'bug' | 'vulnerability' | 'anti-pattern' | 'best-practice';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  codeSignature: string; // Regex pattern
  visualSignature?: {
    densityThreshold?: number;
    colorPatterns?: string[];
    repetitionCount?: number;
  };
  statistics: {
    occurrenceCount: number;
    detectionCount: number;
    missedCount: number;
    accuracy: number;
  };
}
