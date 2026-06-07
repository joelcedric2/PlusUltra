/**
 * Layer 4: Symbolic Logic Verification Display
 *
 * Displays formal logic verification results from the TCI system.
 * Shows invariants, proofs, counterexamples, and logic errors.
 */

import { CheckCircle2, XCircle, AlertTriangle, Code, FileQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogicVerification, LogicProof } from "./types";

export interface LogicVerificationDisplayProps {
  /** Logic verification results from Layer 4 */
  verification: LogicVerification;
  /** Optional className for styling */
  className?: string;
}

/**
 * Render a single logic proof/invariant
 */
function InvariantCard({ invariant }: { invariant: LogicProof }) {
  return (
    <div
      className={cn(
        "p-4 rounded-lg border-2 transition-all",
        invariant.holds
          ? "bg-green-500/5 border-green-500/20"
          : "bg-red-500/5 border-red-500/20"
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        {invariant.holds ? (
          <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1">
          <h4 className="font-semibold text-sm mb-1">
            {invariant.holds ? "Invariant Holds" : "Invariant Violated"}
          </h4>
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
            {invariant.invariant}
          </code>
        </div>
      </div>

      {invariant.proof && (
        <div className="ml-8 mt-3 p-3 bg-muted/30 rounded border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Code className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold text-blue-500">Formal Proof</span>
          </div>
          <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">
            {invariant.proof}
          </pre>
        </div>
      )}

      {invariant.counterexample && (
        <div className="ml-8 mt-3 p-3 bg-red-500/5 rounded border border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-semibold text-red-500">Counterexample</span>
          </div>
          <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap">
            {invariant.counterexample}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * LogicVerificationDisplay Component
 *
 * Displays Layer 4 symbolic logic verification results:
 * - Overall correctness status
 * - Individual invariants with proofs/counterexamples
 * - Logic errors detected
 * - Confidence score
 */
export function LogicVerificationDisplay({
  verification,
  className,
}: LogicVerificationDisplayProps) {
  const hasErrors = verification.logicErrors.length > 0;
  const invariantsPass = verification.invariants.every((inv) => inv.holds);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header: Overall Correctness */}
      <div
        className={cn(
          "p-4 rounded-lg border-2",
          verification.formalCorrectness
            ? "bg-green-500/10 border-green-500/30"
            : "bg-red-500/10 border-red-500/30"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {verification.formalCorrectness ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : (
              <XCircle className="w-6 h-6 text-red-500" />
            )}
            <div>
              <h3 className="font-bold text-lg">
                {verification.formalCorrectness
                  ? "Formally Correct"
                  : "Logic Errors Detected"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {verification.formalCorrectness
                  ? "All invariants hold and no logic errors found"
                  : "Code contains formal logic violations"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              {(verification.confidence * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">Confidence</div>
          </div>
        </div>
      </div>

      {/* Logic Errors Section */}
      {hasErrors && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Logic Errors ({verification.logicErrors.length})
          </h4>
          <div className="space-y-2">
            {verification.logicErrors.map((error, index) => (
              <div
                key={index}
                className="p-3 rounded-lg bg-red-500/5 border border-red-500/20"
              >
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invariants Section */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <FileQuestion className="w-4 h-4 text-blue-500" />
          Invariants Checked ({verification.invariants.length})
        </h4>

        {verification.invariants.length === 0 ? (
          <div className="p-4 rounded-lg bg-muted/20 border border-border text-center">
            <p className="text-sm text-muted-foreground">
              No invariants were checked for this code
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {verification.invariants.map((invariant, index) => (
              <InvariantCard key={index} invariant={invariant} />
            ))}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 p-4 bg-muted/20 rounded-lg border border-border">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-500">
            {verification.invariants.filter((inv) => inv.holds).length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Invariants Pass</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-500">
            {verification.invariants.filter((inv) => !inv.holds).length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Invariants Fail</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-500">
            {verification.logicErrors.length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Logic Errors</div>
        </div>
      </div>

      {/* Technical Details */}
      <details className="p-4 bg-muted/10 rounded-lg border border-border">
        <summary className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
          Technical Details
        </summary>
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold">Model:</span> Grok (xAI)
          </p>
          <p>
            <span className="font-semibold">Method:</span> Symbolic logic verification using formal
            methods
          </p>
          <p>
            <span className="font-semibold">Analysis Time:</span> {verification.timing.toFixed(2)}s
          </p>
          <p>
            <span className="font-semibold">Verification Strategy:</span> The system checks
            mathematical invariants, boundary conditions, and logical consistency using automated
            theorem proving.
          </p>
        </div>
      </details>
    </div>
  );
}
