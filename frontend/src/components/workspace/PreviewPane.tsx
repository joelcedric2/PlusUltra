import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, RefreshCw, Play, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeviceMode } from '../Workspace';

interface PreviewPaneProps {
  deviceMode: DeviceMode;
  previewUrl: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  fileCount?: number;
}

export const PreviewPane = ({ deviceMode, previewUrl, loading, error, onRefresh, fileCount }: PreviewPaneProps) => {
  // Get device dimensions
  const getDeviceDimensions = () => {
    switch (deviceMode) {
      case 'mobile':
        return { width: 375, height: 667 };
      case 'tablet':
        return { width: 768, height: 1024 };
      default:
        return { width: '100%', height: '100%' };
    }
  };

  const dimensions = getDeviceDimensions();

  if (!previewUrl && !loading && !error) {
    return (
      <div className="h-full flex flex-col bg-background/30">
        <div className="flex-1 p-8 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Eye className="w-12 h-12 mx-auto text-muted-foreground" />
            <h3 className="text-lg font-semibold">Ready for Preview</h3>
            <p className="text-muted-foreground">Generated code will appear here</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background/30">
      {/* Preview Controls */}
      <div className="flex items-center justify-between p-4 border-b border-border/30 bg-card/20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              loading ? "bg-yellow-500 animate-pulse" :
              previewUrl ? "bg-green-500" :
              "bg-red-500"
            )} />
            <span className="text-sm font-medium">
              {loading ? 'Generating...' :
               previewUrl ? 'Live Preview' :
               'Preview Error'}
            </span>
          </div>

          {fileCount !== undefined && (
            <Badge variant="outline" className="text-xs">
              {fileCount} files
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 p-4 flex items-center justify-center overflow-hidden">
        <div className="w-full h-full relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">Generating preview...</p>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Card className="w-96">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-5 h-5" />
                    Preview Error
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">{error}</p>
                  <Button onClick={onRefresh} size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0 rounded-lg"
              style={{
                width: dimensions.width,
                height: dimensions.height,
                maxWidth: deviceMode === 'desktop' ? '100%' : dimensions.width,
                maxHeight: deviceMode === 'desktop' ? '100%' : dimensions.height,
              }}
              title="Live Preview"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Play className="w-12 h-12 mx-auto text-muted-foreground" />
                <h3 className="text-lg font-semibold">Preview Ready</h3>
                <p className="text-sm text-muted-foreground">Click refresh to generate preview</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
