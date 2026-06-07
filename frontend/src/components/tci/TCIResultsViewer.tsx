/**
 * TCI Results Viewer
 *
 * Main component for displaying TCI 6-layer analysis results.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import type { TCIResultsViewerProps, Verdict } from './types';

export function TCIResultsViewer({
  report,
  analysisId,
  analysisType,
  onFeedback,
}: TCIResultsViewerProps) {
  const [selectedTab, setSelectedTab] = useState('overview');

  // Calculate overall metrics
  const overallConfidence = report.verdict.confidence;
  const overallRisk = report.verdict.synthesizedRisk.overall;
  const totalTime = report.timings.total || 0;

  // Verdict colors and icons
  const verdictConfig: Record<Verdict, { color: string; icon: React.ReactNode; label: string }> = {
    SHIP: {
      color: 'text-green-600',
      icon: <CheckCircle2 className="h-5 w-5" />,
      label: 'Ship It',
    },
    REFACTOR: {
      color: 'text-yellow-600',
      icon: <AlertTriangle className="h-5 w-5" />,
      label: 'Needs Refactoring',
    },
    REJECT: {
      color: 'text-red-600',
      icon: <XCircle className="h-5 w-5" />,
      label: 'Do Not Ship',
    },
  };

  const currentVerdict = verdictConfig[report.verdict.verdict];

  return (
    <div className="space-y-6">
      {/* Header with Overall Verdict */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={currentVerdict.color}>{currentVerdict.icon}</div>
              <div>
                <CardTitle className="text-2xl">{currentVerdict.label}</CardTitle>
                <CardDescription>
                  Analysis ID: {analysisId.substring(0, 8)}...
                </CardDescription>
              </div>
            </div>
            <Badge variant={analysisType === 'full' ? 'default' : 'secondary'}>
              {analysisType === 'full' ? '6-Layer Analysis' : 'Quick Analysis'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Overall Risk */}
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Overall Risk</div>
              <div className="flex items-center gap-2">
                <Progress value={overallRisk * 10} className="h-2" />
                <span className="text-sm font-medium">{overallRisk.toFixed(1)}/10</span>
              </div>
            </div>

            {/* Confidence */}
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Confidence</div>
              <div className="flex items-center gap-2">
                <Progress value={overallConfidence * 100} className="h-2" />
                <span className="text-sm font-medium">{(overallConfidence * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* Analysis Time */}
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Analysis Time
              </div>
              <div className="text-sm font-medium">{(totalTime / 1000).toFixed(1)}s</div>
            </div>

            {/* Model Consensus */}
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Consensus
              </div>
              <div className="text-sm font-medium">
                {(report.verdict.consensusStrength * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Risk Breakdown */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(report.verdict.synthesizedRisk.breakdown).map(([key, value]) => (
              <div key={key} className="text-xs">
                <div className="text-muted-foreground capitalize">{key}</div>
                <Progress value={value * 10} className="h-1 mt-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Each Layer */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="visual">Layer 1</TabsTrigger>
          {report.causal && <TabsTrigger value="causal">Layer 2</TabsTrigger>}
          <TabsTrigger value="historical">Layer 3</TabsTrigger>
          {report.logic && <TabsTrigger value="logic">Layer 4</TabsTrigger>}
          <TabsTrigger value="verdict">Layer 5</TabsTrigger>
          {report.implementation && <TabsTrigger value="implementation">Layer 6</TabsTrigger>}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analysis Summary</CardTitle>
              <CardDescription>Key findings from all layers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Actionable Steps */}
              {report.verdict.actionableSteps.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Recommended Actions</h4>
                  <ul className="space-y-1">
                    {report.verdict.actionableSteps.map((step, idx) => (
                      <li key={idx} className="text-sm flex items-start gap-2">
                        <span className="text-muted-foreground">{idx + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Model Agreements */}
              <div>
                <h4 className="font-semibold mb-2">Model Consensus</h4>
                <div className="space-y-2">
                  {report.verdict.modelAgreements.map((agreement, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">{agreement.model}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={agreement.verdict === 'SHIP' ? 'default' : 'destructive'}>
                          {agreement.verdict}
                        </Badge>
                        <span className="text-muted-foreground">
                          {(agreement.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conflicts */}
              {report.verdict.conflicts.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-yellow-600">Model Disagreements</h4>
                  <ul className="space-y-1">
                    {report.verdict.conflicts.map((conflict, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground">
                        • {conflict}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Layer 1: Visual */}
        <TabsContent value="visual">
          <Card>
            <CardHeader>
              <CardTitle>Layer 1: Visual Pattern Recognition</CardTitle>
              <CardDescription>DeepSeek Vision Analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Code Health Score */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Code Health Score</span>
                    <span className="text-sm font-bold">{report.visual.overallCodeHealth}/10</span>
                  </div>
                  <Progress value={report.visual.overallCodeHealth * 10} />
                </div>

                {/* Visual Patterns Detected */}
                <div>
                  <h4 className="font-semibold mb-2">Patterns Detected</h4>
                  {report.visual.visualPatterns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No issues detected</p>
                  ) : (
                    <div className="space-y-2">
                      {report.visual.visualPatterns.map((pattern, idx) => (
                        <div
                          key={idx}
                          className="border rounded-lg p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{pattern.type}</span>
                            <Badge
                              variant={
                                pattern.severity === 'CRITICAL' || pattern.severity === 'HIGH'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                            >
                              {pattern.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{pattern.description}</p>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Line {pattern.location.line}</span>
                            <span>Confidence: {(pattern.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Layer 2: Causal (if available) */}
        {report.causal && (
          <TabsContent value="causal">
            <Card>
              <CardHeader>
                <CardTitle>Layer 2: Causal Chain Analysis</CardTitle>
                <CardDescription>Claude 4.5 Impact Prediction</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Causal Chain */}
                  <div>
                    <h4 className="font-semibold mb-2">Impact Chain</h4>
                    <div className="space-y-2">
                      {report.causal.chain.map((step, idx) => (
                        <div key={idx} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                              {step.step}
                            </div>
                            {idx < report.causal!.chain.length - 1 && (
                              <div className="w-0.5 h-full bg-border mt-1" />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                variant={
                                  step.impactLevel === 'HIGH' ? 'destructive' : 'secondary'
                                }
                              >
                                {step.impactLevel}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {(step.likelihood * 100).toFixed(0)}% likely
                              </span>
                            </div>
                            <p className="text-sm">{step.description}</p>
                            {step.affectedFiles.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Affects: {step.affectedFiles.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Breaking Changes */}
                  {report.causal.breakingChanges.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-red-600">Breaking Changes</h4>
                      <ul className="space-y-1">
                        {report.causal.breakingChanges.map((change, idx) => (
                          <li key={idx} className="text-sm">
                            • {change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Risk Assessment */}
                  <div>
                    <h4 className="font-semibold mb-2">Risk Over Time</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Immediate</div>
                        <Progress value={report.causal.riskAssessment.immediate * 10} />
                        <div className="text-xs mt-1">
                          {report.causal.riskAssessment.immediate.toFixed(1)}/10
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Short-term</div>
                        <Progress value={report.causal.riskAssessment.shortTerm * 10} />
                        <div className="text-xs mt-1">
                          {report.causal.riskAssessment.shortTerm.toFixed(1)}/10
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Long-term</div>
                        <Progress value={report.causal.riskAssessment.longTerm * 10} />
                        <div className="text-xs mt-1">
                          {report.causal.riskAssessment.longTerm.toFixed(1)}/10
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Layer 3: Historical */}
        <TabsContent value="historical">
          <Card>
            <CardHeader>
              <CardTitle>Layer 3: Historical Pattern Matching</CardTitle>
              <CardDescription>GPT-4/5 Pattern Library</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Matched Pattern */}
                {report.historical.thisCodeMatchesPattern && (
                  <div className="bg-muted p-3 rounded-lg">
                    <div className="text-sm font-medium mb-1">This code matches:</div>
                    <div className="text-lg font-semibold">
                      {report.historical.thisCodeMatchesPattern}
                    </div>
                  </div>
                )}

                {/* Similar Patterns */}
                {report.historical.similarPatterns.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Similar Code Patterns</h4>
                    <div className="space-y-2">
                      {report.historical.similarPatterns.map((pattern, idx) => (
                        <div key={idx} className="border rounded-lg p-3">
                          <div className="font-medium text-sm mb-1">{pattern.pattern}</div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {pattern.description}
                          </p>
                          {pattern.knownBugs.length > 0 && (
                            <div>
                              <div className="text-xs font-medium mb-1">Known Bugs:</div>
                              <ul className="text-xs text-muted-foreground space-y-0.5">
                                {pattern.knownBugs.map((bug, bidx) => (
                                  <li key={bidx}>• {bug}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-2">
                            Seen {pattern.frequency} times in codebase
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Common Mistakes */}
                {report.historical.commonMistakes.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Common Mistakes to Avoid</h4>
                    <ul className="space-y-1">
                      {report.historical.commonMistakes.map((mistake, idx) => (
                        <li key={idx} className="text-sm">
                          • {mistake}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {report.historical.recommendations.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Recommendations</h4>
                    <ul className="space-y-1">
                      {report.historical.recommendations.map((rec, idx) => (
                        <li key={idx} className="text-sm">
                          • {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Additional tabs would go here - I'll create them in separate files */}

        {/* Verdict Tab */}
        <TabsContent value="verdict">
          <Card>
            <CardHeader>
              <CardTitle>Layer 5: Cross-Model Synthesis</CardTitle>
              <CardDescription>Gemini Consensus Building</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className={`text-6xl ${currentVerdict.color} mb-2`}>
                    {currentVerdict.icon}
                  </div>
                  <h3 className="text-2xl font-bold mb-1">{currentVerdict.label}</h3>
                  <p className="text-muted-foreground">
                    {(report.verdict.confidence * 100).toFixed(0)}% confidence
                  </p>
                </div>

                {/* Full content from earlier overview */}
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-2">Synthesis Details</h4>
                  <div className="text-sm text-muted-foreground">
                    Based on consensus from {report.verdict.modelAgreements.length} AI models
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Implementation Tab (if available) */}
        {report.implementation && (
          <TabsContent value="implementation">
            <Card>
              <CardHeader>
                <CardTitle>Layer 6: Automatic Implementation</CardTitle>
                <CardDescription>Claude 4.5 Code Fixes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted p-3 rounded-lg">
                    <div className="text-sm font-medium mb-2">Improved Code</div>
                    <pre className="text-xs overflow-x-auto">
                      <code>{report.implementation.improvedCode}</code>
                    </pre>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Changes Made</h4>
                    <div className="space-y-2">
                      {report.implementation.changes.map((change, idx) => (
                        <div key={idx} className="text-sm border-l-2 pl-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge>{change.type}</Badge>
                            <span className="text-muted-foreground">Line {change.line}</span>
                          </div>
                          <div className="text-muted-foreground">{change.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Tests: </span>
                      {report.implementation.testsPassed ? (
                        <span className="text-green-600 font-medium">Passed</span>
                      ) : (
                        <span className="text-red-600 font-medium">Failed</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Confidence: </span>
                      <span className="font-medium">
                        {(report.implementation.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Feedback Section */}
      {onFeedback && (
        <Card>
          <CardHeader>
            <CardTitle>Was this analysis helpful?</CardTitle>
            <CardDescription>
              Your feedback helps improve TCI accuracy over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                👍 Helpful
              </Button>
              <Button variant="outline" size="sm">
                👎 Not Helpful
              </Button>
              <Button variant="outline" size="sm">
                💬 Provide Detailed Feedback
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
