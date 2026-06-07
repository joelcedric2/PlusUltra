import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Download,
  Smartphone,
  Monitor,
  Apple,
  Play,
  CheckCircle,
  AlertCircle,
  Package,
  Code,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildDeployProps {
  projectId: string;
  files: Record<string, string>;
}

export const BuildDeployPane = ({ projectId, files }: BuildDeployProps) => {
  const [buildStatus, setBuildStatus] = useState<'idle' | 'building' | 'success' | 'error'>('idle');
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [deployStatus, setDeployStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle');
  const [deployProgress, setDeployProgress] = useState(0);
  const [availablePlatforms, setAvailablePlatforms] = useState([
    { id: 'web', name: 'Web App', icon: Monitor, status: 'ready', description: 'React Web Application' },
    { id: 'ios', name: 'iOS App', icon: Apple, status: 'ready', description: 'iOS Native App' },
    { id: 'android', name: 'Android App', icon: Smartphone, status: 'ready', description: 'Android Native App' },
    { id: 'desktop', name: 'Desktop App', icon: Monitor, status: 'ready', description: 'Desktop Application' }
  ]);

  const handleBuild = async (platform: string) => {
    setBuildStatus('building');
    setBuildProgress(0);
    setBuildLogs([]);

    try {
      // Simulate build process
      const steps = [
        'Analyzing project structure...',
        'Installing dependencies...',
        'Compiling TypeScript...',
        'Bundling assets...',
        'Optimizing code...',
        'Running tests...',
        'Generating build...',
        'Build completed successfully!'
      ];

      for (let i = 0; i < steps.length; i++) {
        setBuildLogs(prev => [...prev, steps[i]]);
        setBuildProgress((i + 1) / steps.length * 100);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setBuildStatus('success');
    } catch (error) {
      setBuildLogs(prev => [...prev, 'Build failed: ' + (error instanceof Error ? error.message : 'Unknown error')]);
      setBuildStatus('error');
    }
  };

  const handleDeploy = async (platform: string) => {
    setDeployStatus('deploying');
    setDeployProgress(0);

    try {
      // Simulate deployment process
      const steps = [
        'Preparing deployment package...',
        'Validating app configuration...',
        'Uploading to deployment service...',
        'Configuring CDN...',
        'Setting up monitoring...',
        'Deployment completed successfully!'
      ];

      for (let i = 0; i < steps.length; i++) {
        setBuildProgress(100); // Build is complete
        setDeployProgress((i + 1) / steps.length * 100);
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      setDeployStatus('success');
    } catch (error) {
      setDeployStatus('error');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-green-500';
      case 'building': return 'bg-yellow-500 animate-pulse';
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready': return 'Ready to Build';
      case 'building': return 'Building...';
      case 'success': return 'Built Successfully';
      case 'error': return 'Build Failed';
      default: return 'Unknown';
    }
  };

  return (
    <div className="h-full flex flex-col bg-background/30">
      {/* Build & Deploy Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/30 bg-card/20">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Build & Deploy</h2>
          <Badge variant="outline" className="text-xs">
            {Object.keys(files).length} files
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBuildStatus('idle');
              setDeployStatus('idle');
              setBuildProgress(0);
              setDeployProgress(0);
              setBuildLogs([]);
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      {/* Build & Deploy Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="build" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="build" className="flex items-center gap-2">
              <Code className="w-4 h-4" />
              Build
            </TabsTrigger>
            <TabsTrigger value="deploy" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Deploy
            </TabsTrigger>
            <TabsTrigger value="platforms" className="flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Platforms
            </TabsTrigger>
          </TabsList>

          <TabsContent value="build" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Build Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Build Type</label>
                    <div className="mt-1">
                      <Badge variant="outline">Production</Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Target</label>
                    <div className="mt-1">
                      <Badge variant="outline">Multi-Platform</Badge>
                    </div>
                  </div>
                </div>

                {buildStatus !== 'idle' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Build Progress</span>
                      <span className="text-sm text-muted-foreground">{Math.round(buildProgress)}%</span>
                    </div>
                    <Progress value={buildProgress} className="w-full" />

                    <div className="bg-muted/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                      <div className="font-mono text-xs space-y-1">
                        {buildLogs.map((log, index) => (
                          <div key={index} className="text-muted-foreground">
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleBuild('multi-platform')}
                    disabled={buildStatus === 'building'}
                    className="flex-1"
                  >
                    {buildStatus === 'building' ? (
                      'Building...'
                    ) : buildStatus === 'success' ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Build Complete
                      </>
                    ) : (
                      <>
                        <Package className="w-4 h-4 mr-2" />
                        Build All Platforms
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deploy" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Deployment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {buildStatus !== 'success' ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Build your application first before deploying</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Deployment Progress</span>
                        <span className="text-sm text-muted-foreground">{Math.round(deployProgress)}%</span>
                      </div>
                      <Progress value={deployProgress} className="w-full" />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleDeploy('web')}
                        disabled={deployStatus === 'deploying'}
                        variant="outline"
                        className="flex-1"
                      >
                        {deployStatus === 'deploying' ? 'Deploying...' : 'Deploy to Web'}
                      </Button>
                      <Button
                        onClick={() => handleDeploy('stores')}
                        disabled={deployStatus === 'deploying'}
                        variant="outline"
                        className="flex-1"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        App Stores
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="platforms" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availablePlatforms.map((platform) => {
                const Icon = platform.icon;
                return (
                  <Card key={platform.id} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Icon className="w-5 h-5" />
                          {platform.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", getStatusColor(platform.status))} />
                          <span className="text-xs text-muted-foreground">
                            {getStatusText(platform.status)}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        {platform.description}
                      </p>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleBuild(platform.id)}
                          disabled={buildStatus === 'building' || platform.status === 'error'}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Build
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleDeploy(platform.id)}
                          disabled={deployStatus === 'deploying' || buildStatus !== 'success'}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Deploy
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
