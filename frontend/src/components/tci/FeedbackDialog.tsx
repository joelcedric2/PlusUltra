/**
 * TCI Feedback Dialog
 *
 * Allows users to submit feedback on TCI analysis results.
 * This feedback feeds into the learning loop to improve accuracy over time.
 */

import { useState } from "react";
import { ThumbsUp, ThumbsDown, AlertTriangle, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useSubmitFeedback } from "./api";
import { useToast } from "@/hooks/use-toast";
import type { TCIFeedbackRequest } from "./types";

export interface FeedbackDialogProps {
  /** Analysis ID to submit feedback for */
  analysisId: string;
  /** Whether dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onOpenChange: (open: boolean) => void;
  /** Optional callback after successful submission */
  onSuccess?: () => void;
}

type OutcomeType = "shipped" | "refactored" | "rejected";

/**
 * FeedbackDialog Component
 *
 * Collects user feedback about TCI analysis accuracy:
 * - Was the analysis helpful?
 * - What was the actual outcome? (shipped/refactored/rejected)
 * - Were there any bugs found?
 * - Were there breaking changes?
 * - Which layers were most helpful?
 * - Additional comments
 */
export function FeedbackDialog({
  analysisId,
  open,
  onOpenChange,
  onSuccess,
}: FeedbackDialogProps) {
  const { toast } = useToast();
  const submitFeedback = useSubmitFeedback();

  // Form state
  const [wasHelpful, setWasHelpful] = useState<boolean | null>(null);
  const [actualOutcome, setActualOutcome] = useState<OutcomeType | null>(null);
  const [bugsFoundText, setBugsFoundText] = useState("");
  const [breakingChangesText, setBreakingChangesText] = useState("");
  const [comment, setComment] = useState("");
  const [layerFeedback, setLayerFeedback] = useState({
    visualHelpful: false,
    causalHelpful: false,
    historicalHelpful: false,
    logicHelpful: false,
  });

  const handleSubmit = async () => {
    if (wasHelpful === null || actualOutcome === null) {
      toast({
        title: "Incomplete feedback",
        description: "Please answer all required questions",
        variant: "destructive",
      });
      return;
    }

    const bugsFound = bugsFoundText.trim()
      ? bugsFoundText.split("\n").filter((bug) => bug.trim())
      : undefined;

    const breakingChanges = breakingChangesText.trim()
      ? breakingChangesText.split("\n").filter((change) => change.trim())
      : undefined;

    const feedbackRequest: TCIFeedbackRequest = {
      analysisId,
      wasHelpful,
      actualOutcome,
      bugsFound,
      breakingChanges,
      comment: comment.trim() || undefined,
      layerFeedback,
    };

    try {
      await submitFeedback.mutateAsync(feedbackRequest);

      toast({
        title: "Feedback submitted",
        description: "Thank you! Your feedback helps improve TCI accuracy.",
      });

      // Reset form
      setWasHelpful(null);
      setActualOutcome(null);
      setBugsFoundText("");
      setBreakingChangesText("");
      setComment("");
      setLayerFeedback({
        visualHelpful: false,
        causalHelpful: false,
        historicalHelpful: false,
        logicHelpful: false,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Submission failed",
        description: error instanceof Error ? error.message : "Failed to submit feedback",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Submit Feedback</DialogTitle>
          <DialogDescription>
            Help us improve TCI by sharing the real-world outcome of this analysis
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Question 1: Was it helpful? */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              Was this analysis helpful? <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-3">
              <Button
                variant={wasHelpful === true ? "default" : "outline"}
                size="lg"
                onClick={() => setWasHelpful(true)}
                className={cn(
                  "flex-1",
                  wasHelpful === true &&
                    "bg-green-500 hover:bg-green-600 text-white"
                )}
              >
                <ThumbsUp className="w-5 h-5 mr-2" />
                Yes, helpful
              </Button>
              <Button
                variant={wasHelpful === false ? "default" : "outline"}
                size="lg"
                onClick={() => setWasHelpful(false)}
                className={cn(
                  "flex-1",
                  wasHelpful === false &&
                    "bg-red-500 hover:bg-red-600 text-white"
                )}
              >
                <ThumbsDown className="w-5 h-5 mr-2" />
                Not helpful
              </Button>
            </div>
          </div>

          {/* Question 2: Actual outcome */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              What was the actual outcome? <span className="text-red-500">*</span>
            </Label>
            <RadioGroup
              value={actualOutcome || undefined}
              onValueChange={(value) => setActualOutcome(value as OutcomeType)}
            >
              <div className="flex items-center space-x-2 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="shipped" id="shipped" />
                <Label
                  htmlFor="shipped"
                  className="flex items-center gap-2 cursor-pointer flex-1"
                >
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <div>
                    <div className="font-medium">Shipped</div>
                    <div className="text-xs text-muted-foreground">
                      Code was deployed to production
                    </div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="refactored" id="refactored" />
                <Label
                  htmlFor="refactored"
                  className="flex items-center gap-2 cursor-pointer flex-1"
                >
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  <div>
                    <div className="font-medium">Refactored</div>
                    <div className="text-xs text-muted-foreground">
                      Code was modified based on analysis
                    </div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="rejected" id="rejected" />
                <Label
                  htmlFor="rejected"
                  className="flex items-center gap-2 cursor-pointer flex-1"
                >
                  <XCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <div className="font-medium">Rejected</div>
                    <div className="text-xs text-muted-foreground">
                      Code was discarded or blocked
                    </div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Question 3: Bugs found */}
          <div className="space-y-3">
            <Label htmlFor="bugs" className="text-base font-semibold">
              Bugs found in production (optional)
            </Label>
            <Textarea
              id="bugs"
              placeholder="List any bugs that were discovered after shipping (one per line)"
              value={bugsFoundText}
              onChange={(e) => setBugsFoundText(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              This helps TCI learn to detect these patterns in the future
            </p>
          </div>

          {/* Question 4: Breaking changes */}
          <div className="space-y-3">
            <Label htmlFor="breaking" className="text-base font-semibold">
              Breaking changes (optional)
            </Label>
            <Textarea
              id="breaking"
              placeholder="List any breaking changes that occurred (one per line)"
              value={breakingChangesText}
              onChange={(e) => setBreakingChangesText(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Question 5: Layer helpfulness */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">
              Which layers were most helpful? (optional)
            </Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="visual"
                  checked={layerFeedback.visualHelpful}
                  onCheckedChange={(checked) =>
                    setLayerFeedback((prev) => ({
                      ...prev,
                      visualHelpful: checked === true,
                    }))
                  }
                />
                <Label
                  htmlFor="visual"
                  className="text-sm font-normal cursor-pointer"
                >
                  Layer 1: Visual Pattern Recognition
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="causal"
                  checked={layerFeedback.causalHelpful}
                  onCheckedChange={(checked) =>
                    setLayerFeedback((prev) => ({
                      ...prev,
                      causalHelpful: checked === true,
                    }))
                  }
                />
                <Label
                  htmlFor="causal"
                  className="text-sm font-normal cursor-pointer"
                >
                  Layer 2: Causal Chain Analysis
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="historical"
                  checked={layerFeedback.historicalHelpful}
                  onCheckedChange={(checked) =>
                    setLayerFeedback((prev) => ({
                      ...prev,
                      historicalHelpful: checked === true,
                    }))
                  }
                />
                <Label
                  htmlFor="historical"
                  className="text-sm font-normal cursor-pointer"
                >
                  Layer 3: Historical Pattern Matching
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="logic"
                  checked={layerFeedback.logicHelpful}
                  onCheckedChange={(checked) =>
                    setLayerFeedback((prev) => ({
                      ...prev,
                      logicHelpful: checked === true,
                    }))
                  }
                />
                <Label
                  htmlFor="logic"
                  className="text-sm font-normal cursor-pointer"
                >
                  Layer 4: Symbolic Logic Verification
                </Label>
              </div>
            </div>
          </div>

          {/* Question 6: Additional comments */}
          <div className="space-y-3">
            <Label htmlFor="comment" className="text-base font-semibold">
              Additional comments (optional)
            </Label>
            <Textarea
              id="comment"
              placeholder="Any other feedback or insights?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={
              wasHelpful === null ||
              actualOutcome === null ||
              submitFeedback.isPending
            }
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90 text-white"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            {submitFeedback.isPending ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
