/**
 * Mobile Pivot Dialog
 * AI-powered conversion from web to mobile (React Native or Capacitor)
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Smartphone,
  Zap,
  Brain,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Code,
  Package,
  FileCode,
  Plus,
  Minus,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';

export type MobilePlatform = 'react-native' | 'capacitor' | 'auto';

export interface ConversionPreview {
  platform: 'react-native' | 'capacitor';
  confidence: number;
  reasoning: string;
  estimatedChanges: {
    filesAdded: number;
    filesModified: number;
    filesRemoved: number;
  };
  changes: FileChange[];
  dependencies: {
    added: string[];
    removed: string[];
  };
  warnings: string[];
}

export interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'removed';
  preview?: string;
}

export interface ConversionResult {
  success: boolean;
  platform: 'react-native' | 'capacitor';
  filesChanged: number;
  newProjectPath?: string;
  message: string;
}

interface MobilePivotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onConversionComplete?: (result: ConversionResult) => void;
}

type WizardStep = 'select' | 'analyze' | 'preview' | 'convert' | 'complete';

export const MobilePivotDialog: React.FC<MobilePivotDialogProps> = ({
  open,
  onOpenChange,
  projectId,
  projectName,
  onConversionComplete,
}) => {
  const api = useApi();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<WizardStep>('select');
  const [selectedPlatform, setSelectedPlatform] = useState<MobilePlatform>('auto');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [preview, setPreview] = useState<ConversionPreview | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);

  const platforms = [
    {
      id: 'react-native' as const,
      name: 'React Native',
      description: 'True native mobile apps with full native API access',
      icon: Smartphone,
      pros: ['Best performance', 'Full native access', 'Rich ecosystem'],
      cons: ['Steeper learning curve', 'More setup required'],
      bestFor: 'Complex apps with native features',
    },
    {
      id: 'capacitor' as const,
      name: 'Capacitor',
      description: 'Web-first approach with native bridge capabilities',
      icon: Zap,
      pros: ['Easier migration', 'Reuse web code', 'Quick deployment'],
      cons: ['WebView performance', 'Limited native access'],
      bestFor: 'Web apps that need mobile packaging',
    },
    {
      id: 'auto' as const,
      name: 'AI Recommendation',
      description: 'Let our AI analyze your project and choose the best platform',
      icon: Brain,
      pros: ['Intelligent analysis', 'Best fit for your app', 'Expert guidance'],
      cons: [],
      bestFor: 'When you want the optimal choice',
      highlighted: true,
    },
  ];

  const handlePlatformSelect = (platform: MobilePlatform) => {
    setSelectedPlatform(platform);
  };

  const handleAnalyzeProject = async () => {
    setIsAnalyzing(true);
    setCurrentStep('analyze');

    try {
      // Call AI orchestrator to analyze project and recommend platform
      const response = await api.post<{ success: boolean; data: ConversionPreview }>(
        '/api/v1/mobile/analyze',
        {
          projectId,
          preferredPlatform: selectedPlatform === 'auto' ? null : selectedPlatform,
        }
      );

      setPreview(response.data);
      setCurrentStep('preview');

      toast({
        title: 'Analysis Complete',
        description: `Recommended: ${response.data.platform === 'react-native' ? 'React Native' : 'Capacitor'}`,
      });
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Could not analyze project',
        variant: 'destructive',
      });
      setCurrentStep('select');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStartConversion = async () => {
    if (!preview) return;

    setIsConverting(true);
    setCurrentStep('convert');
    setConversionProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setConversionProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const response = await api.post<{ success: boolean; data: ConversionResult }>(
        '/api/v1/mobile/convert',
        {
          projectId,
          platform: preview.platform,
        }
      );

      clearInterval(progressInterval);
      setConversionProgress(100);

      setConversionResult(response.data);
      setCurrentStep('complete');

      toast({
        title: 'Conversion Complete',
        description: `Successfully converted to ${preview.platform === 'react-native' ? 'React Native' : 'Capacitor'}`,
      });

      if (onConversionComplete) {
        onConversionComplete(response.data);
      }
    } catch (error) {
      toast({
        title: 'Conversion Failed',
        description: error instanceof Error ? error.message : 'Could not convert project',
        variant: 'destructive',
      });
      setCurrentStep('preview');
    } finally {
      setIsConverting(false);
    }
  };

  const resetWizard = () => {
    setCurrentStep('select');
    setSelectedPlatform('auto');
    setPreview(null);
    setConversionResult(null);
    setConversionProgress(0);
  };

  const handleClose = () => {
    resetWizard();
    onOpenChange(false);
  };

  const getChangeIcon = (type: FileChange['type']) => {
    switch (type) {
      case 'added':
        return <Plus className="w-4 h-4 text-green-500" />;
      case 'modified':
        return <FileCode className="w-4 h-4 text-blue-500" />;
      case 'removed':
        return <Minus className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Convert to Mobile App</DialogTitle>
          <DialogDescription>
            Transform {projectName} into a native mobile application
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-12rem)] pr-4">
          {/* Platform Selection Step */}
          {currentStep === 'select' && (
            <div className="space-y-6">
              <Alert>
                <Brain className="h-4 w-4" />
                <AlertDescription>
                  Choose your mobile platform or let our AI recommend the best option based on your
                  project's characteristics
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {platforms.map((platform) => (
                  <Card
                    key={platform.id}
                    className={`cursor-pointer transition-all hover:border-primary ${
                      selectedPlatform === platform.id ? 'border-primary bg-primary/5' : ''
                    } ${platform.highlighted ? 'border-primary/50' : ''}`}
                    onClick={() => handlePlatformSelect(platform.id)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between mb-2">
                        <platform.icon className="w-8 h-8 text-primary" />
                        {platform.highlighted && <Badge variant="default">Recommended</Badge>}
                      </div>
                      <CardTitle className="text-lg">{platform.name}</CardTitle>
                      <CardDescription className="text-sm">{platform.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Best For:</p>
                        <p className="text-xs">{platform.bestFor}</p>
                      </div>
                      {platform.pros.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Pros:</p>
                          <ul className="text-xs space-y-0.5">
                            {platform.pros.map((pro, i) => (
                              <li key={i} className="flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-green-500" />
                                {pro}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {platform.cons.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Cons:</p>
                          <ul className="text-xs space-y-0.5">
                            {platform.cons.map((con, i) => (
                              <li key={i} className="flex items-center gap-1 text-muted-foreground">
                                <AlertTriangle className="w-3 h-3" />
                                {con}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleAnalyzeProject}>
                  Analyze Project
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Analyzing Step */}
          {currentStep === 'analyze' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Analyzing Your Project</h3>
              <p className="text-muted-foreground text-center max-w-md">
                Our AI is examining your codebase, dependencies, and architecture to recommend the best
                mobile platform...
              </p>
            </div>
          )}

          {/* Preview Step */}
          {currentStep === 'preview' && preview && (
            <div className="space-y-6">
              <Alert>
                <Brain className="h-4 w-4" />
                <AlertDescription>
                  <strong>
                    Recommended: {preview.platform === 'react-native' ? 'React Native' : 'Capacitor'}
                  </strong>
                  <br />
                  {preview.reasoning}
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Files Added</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-500">
                      +{preview.estimatedChanges.filesAdded}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Files Modified</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-500">
                      ~{preview.estimatedChanges.filesModified}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">AI Confidence</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{(preview.confidence * 100).toFixed(0)}%</div>
                  </CardContent>
                </Card>
              </div>

              <Tabs defaultValue="changes" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="changes">File Changes</TabsTrigger>
                  <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
                  <TabsTrigger value="warnings">Warnings</TabsTrigger>
                </TabsList>

                <TabsContent value="changes" className="space-y-2">
                  <ScrollArea className="h-64 border rounded-lg p-4">
                    {preview.changes.map((change, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
                        {getChangeIcon(change.type)}
                        <span className="flex-1 font-mono text-sm">{change.path}</span>
                        <Badge variant="outline" className="text-xs">
                          {change.type}
                        </Badge>
                      </div>
                    ))}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="dependencies" className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-green-500" />
                      Added Dependencies
                    </h4>
                    <div className="border rounded-lg p-4 space-y-1">
                      {preview.dependencies.added.map((dep, i) => (
                        <div key={i} className="text-sm font-mono text-green-500">
                          + {dep}
                        </div>
                      ))}
                    </div>
                  </div>
                  {preview.dependencies.removed.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Minus className="w-4 h-4 text-red-500" />
                        Removed Dependencies
                      </h4>
                      <div className="border rounded-lg p-4 space-y-1">
                        {preview.dependencies.removed.map((dep, i) => (
                          <div key={i} className="text-sm font-mono text-red-500">
                            - {dep}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="warnings" className="space-y-2">
                  {preview.warnings.length > 0 ? (
                    preview.warnings.map((warning, i) => (
                      <Alert key={i} variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{warning}</AlertDescription>
                      </Alert>
                    ))
                  ) : (
                    <Alert>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <AlertDescription>No warnings detected. Project is ready to convert!</AlertDescription>
                    </Alert>
                  )}
                </TabsContent>
              </Tabs>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setCurrentStep('select')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleStartConversion}>
                  Start Conversion
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Converting Step */}
          {currentStep === 'convert' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <div className="w-full max-w-md space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Converting to {preview?.platform === 'react-native' ? 'React Native' : 'Capacitor'}...</span>
                  <span>{conversionProgress}%</span>
                </div>
                <Progress value={conversionProgress} className="h-2" />
              </div>
              <p className="text-muted-foreground text-center max-w-md">
                Transforming files, installing dependencies, and configuring mobile build tools...
              </p>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && conversionResult && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                <h3 className="text-2xl font-bold mb-2">Conversion Complete!</h3>
                <p className="text-muted-foreground text-center">
                  Your project has been successfully converted to{' '}
                  {preview?.platform === 'react-native' ? 'React Native' : 'Capacitor'}
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Conversion Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform:</span>
                    <Badge>{conversionResult.platform}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Files Changed:</span>
                    <span className="font-medium">{conversionResult.filesChanged}</span>
                  </div>
                  {conversionResult.newProjectPath && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">New Project Path:</span>
                      <span className="font-mono text-xs">{conversionResult.newProjectPath}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription>
                  <strong>Next Steps:</strong> Run <code className="px-1 bg-muted rounded">npm install</code> to
                  install mobile dependencies, then use{' '}
                  <code className="px-1 bg-muted rounded">
                    {preview?.platform === 'react-native' ? 'npx react-native run-ios' : 'npx cap run ios'}
                  </code>{' '}
                  to test on iOS
                </AlertDescription>
              </Alert>

              <Button onClick={handleClose} className="w-full">
                Done
              </Button>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
