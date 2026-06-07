/**
 * Admin TCI Dashboard Page
 *
 * Comprehensive dashboard for monitoring TCI system performance,
 * accuracy, costs, and pattern library growth.
 */

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  DollarSign,
  Database,
  Clock,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  Layers,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useTCIOverview,
  useTCILayerPerformance,
  useTCIPatternLibrary,
} from "@/components/tci";

/**
 * Metric Card Component
 */
function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  className?: string;
}) {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trend && trendValue && (
          <div className="flex items-center gap-1 mt-2">
            {trend === "up" ? (
              <TrendingUp className="w-3 h-3 text-green-500" />
            ) : trend === "down" ? (
              <TrendingDown className="w-3 h-3 text-red-500" />
            ) : null}
            <span
              className={cn(
                "text-xs font-medium",
                trend === "up" && "text-green-500",
                trend === "down" && "text-red-500",
                trend === "neutral" && "text-muted-foreground"
              )}
            >
              {trendValue}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Layer Performance Bar
 */
function LayerPerformanceBar({
  layer,
  model,
  accuracy,
  confidence,
  averageTime,
}: {
  layer: string;
  model: string;
  accuracy: number;
  confidence: number;
  averageTime: number;
}) {
  const getAccuracyColor = (acc: number) => {
    if (acc >= 90) return "bg-green-500";
    if (acc >= 75) return "bg-blue-500";
    if (acc >= 60) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="font-semibold text-sm">{layer}</h4>
          <p className="text-xs text-muted-foreground">{model}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{(accuracy * 100).toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground">Accuracy</div>
        </div>
      </div>

      <div className="space-y-2 mt-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Accuracy</span>
            <span className="font-medium">{(accuracy * 100).toFixed(1)}%</span>
          </div>
          <Progress
            value={accuracy * 100}
            className={cn("h-2", `[&>div]:${getAccuracyColor(accuracy * 100)}`)}
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-medium">{(confidence * 100).toFixed(1)}%</span>
          </div>
          <Progress
            value={confidence * 100}
            className="h-2 [&>div]:bg-blue-500"
          />
        </div>

        <div className="flex justify-between text-xs pt-1">
          <span className="text-muted-foreground">Avg Time</span>
          <span className="font-medium">{averageTime.toFixed(2)}s</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Admin TCI Dashboard
 */
export function TCIDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    data: overview,
    isLoading: overviewLoading,
    refetch: refetchOverview,
  } = useTCIOverview();

  const {
    data: layerPerformance,
    isLoading: layersLoading,
    refetch: refetchLayers,
  } = useTCILayerPerformance();

  const {
    data: patternLibrary,
    isLoading: patternsLoading,
    refetch: refetchPatterns,
  } = useTCIPatternLibrary();

  const handleRefresh = () => {
    refetchOverview();
    refetchLayers();
    refetchPatterns();
    setRefreshKey((prev) => prev + 1);
  };

  const isLoading = overviewLoading || layersLoading || patternsLoading;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">TCI System Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor 6-layer multi-model code intelligence performance
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isLoading}
          variant="outline"
          size="sm"
        >
          <RefreshCw
            className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {/* Overview Metrics */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Analyses"
            value={overview.totalAnalyses.toLocaleString()}
            subtitle={`${overview.recentAnalyses} in last 24h`}
            icon={Activity}
            trend="up"
            trendValue="+12% from last week"
          />
          <MetricCard
            title="Average Accuracy"
            value={`${(overview.averageConfidence * 100).toFixed(1)}%`}
            subtitle="Across all layers"
            icon={Target}
            trend="up"
            trendValue="+2.3% this month"
          />
          <MetricCard
            title="Average Risk Score"
            value={(overview.averageRisk * 10).toFixed(1)}
            subtitle="Out of 10"
            icon={AlertTriangle}
            trend="down"
            trendValue="-0.5 from last month"
          />
          <MetricCard
            title="Total Cost"
            value={`$${overview.totalCost.toFixed(2)}`}
            subtitle="All time"
            icon={DollarSign}
            trend="up"
            trendValue="+$45 this month"
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="layers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="layers">
            <Layers className="w-4 h-4 mr-2" />
            Layer Performance
          </TabsTrigger>
          <TabsTrigger value="patterns">
            <Database className="w-4 h-4 mr-2" />
            Pattern Library
          </TabsTrigger>
          <TabsTrigger value="costs">
            <DollarSign className="w-4 h-4 mr-2" />
            Cost Analysis
          </TabsTrigger>
        </TabsList>

        {/* Layer Performance Tab */}
        <TabsContent value="layers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>6-Layer Performance Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">
                Individual layer accuracy, confidence, and timing
              </p>
            </CardHeader>
            <CardContent>
              {layerPerformance && layerPerformance.layers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {layerPerformance.layers.map((layer, index) => (
                    <LayerPerformanceBar key={index} {...layer} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No layer performance data available yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pattern Library Tab */}
        <TabsContent value="patterns" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="Total Patterns"
              value={patternLibrary?.totalPatterns.toLocaleString() || "0"}
              subtitle="Growing with every feedback"
              icon={Database}
            />
            <MetricCard
              title="Bug Patterns"
              value={patternLibrary?.byCategory.bug || 0}
              subtitle="Known bug signatures"
              icon={AlertTriangle}
            />
            <MetricCard
              title="Vulnerabilities"
              value={patternLibrary?.byCategory.vulnerability || 0}
              subtitle="Security patterns"
              icon={CheckCircle}
            />
          </div>

          {patternLibrary && (
            <>
              {/* By Severity */}
              <Card>
                <CardHeader>
                  <CardTitle>Patterns by Severity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(patternLibrary.bySeverity).map(([severity, count]) => (
                      <div key={severity}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium capitalize">{severity}</span>
                          <span className="text-muted-foreground">{count}</span>
                        </div>
                        <Progress
                          value={(count / patternLibrary.totalPatterns) * 100}
                          className={cn(
                            "h-2",
                            severity === "critical" && "[&>div]:bg-red-500",
                            severity === "high" && "[&>div]:bg-orange-500",
                            severity === "medium" && "[&>div]:bg-yellow-500",
                            severity === "low" && "[&>div]:bg-green-500"
                          )}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top Patterns */}
              <Card>
                <CardHeader>
                  <CardTitle>Most Common Patterns</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {patternLibrary.topPatterns.map((pattern, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg border border-border bg-muted/20"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm">{pattern.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground capitalize">
                                {pattern.category}
                              </span>
                              <span className="text-xs">•</span>
                              <span
                                className={cn(
                                  "text-xs font-medium capitalize",
                                  pattern.severity === "critical" && "text-red-500",
                                  pattern.severity === "high" && "text-orange-500",
                                  pattern.severity === "medium" && "text-yellow-500",
                                  pattern.severity === "low" && "text-green-500"
                                )}
                              >
                                {pattern.severity}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">
                              {pattern.occurrences}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              occurrences
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Accuracy</span>
                          <span className="font-medium">
                            {(pattern.accuracy * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Cost Analysis Tab */}
        <TabsContent value="costs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">
                Analysis costs per model and layer
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">
                      Quick Analysis Cost
                    </div>
                    <div className="text-2xl font-bold">$0.30</div>
                    <div className="text-xs text-muted-foreground">
                      Layers 1 + 3
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">
                      Full Analysis Cost
                    </div>
                    <div className="text-2xl font-bold">$0.90</div>
                    <div className="text-xs text-muted-foreground">
                      All 6 layers
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <h4 className="font-semibold text-sm mb-3">Cost per Layer</h4>
                  <div className="space-y-2">
                    {[
                      { name: "Layer 1: Visual (DeepSeek)", cost: 0.15 },
                      { name: "Layer 2: Causal (Claude)", cost: 0.20 },
                      { name: "Layer 3: Historical (GPT)", cost: 0.15 },
                      { name: "Layer 4: Logic (Grok)", cost: 0.10 },
                      { name: "Layer 5: Synthesis (Gemini)", cost: 0.15 },
                      { name: "Layer 6: Implementation (Claude)", cost: 0.15 },
                    ].map((layer, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">{layer.name}</span>
                        <span className="font-medium">${layer.cost.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TCIDashboard;
