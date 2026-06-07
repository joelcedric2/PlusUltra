import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Download, Palette, Package, Smartphone, Image as ImageIcon, Loader2, CheckCircle2, XCircle } from "lucide-react";
import logoImage from "@/assets/plusultra-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

interface GeneratedAsset {
  id: string;
  type: string;
  size: string;
  url: string;
  platform: string;
}

interface AssetGenerationResult {
  success: boolean;
  projectId: string;
  assets: {
    ios?: GeneratedAsset[];
    android?: GeneratedAsset[];
  };
  tciInsights?: any;
  generationTime?: number;
  estimatedCost?: number;
}

const AssetGenerator = () => {
  const { toast } = useToast();
  const [appName, setAppName] = useState("");
  const [platform, setPlatform] = useState<"ios" | "android" | "both">("both");
  const [userPrompt, setUserPrompt] = useState("");
  const [colorScheme, setColorScheme] = useState<string[]>(["#17D9E3"]);
  const [style, setStyle] = useState<"modern" | "minimal" | "gradient" | "flat" | "abstract" | "3d">("modern");
  const [industry, setIndustry] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<AssetGenerationResult | null>(null);
  const [newColor, setNewColor] = useState("#17D9E3");

  const handleAddColor = () => {
    if (colorScheme.length < 5) {
      setColorScheme([...colorScheme, newColor]);
    }
  };

  const handleRemoveColor = (index: number) => {
    setColorScheme(colorScheme.filter((_, i) => i !== index));
  };

  const handleGenerateAssets = async () => {
    if (!appName.trim()) {
      toast({
        title: "App name required",
        description: "Please enter your app name to generate assets.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGenerationResult(null);

    try {
      const response = await apiClient.post<AssetGenerationResult>("/api/assets/generate", {
        appName,
        platform,
        userPrompt: userPrompt || undefined,
        preferences: {
          colorScheme,
          style,
          industry: industry || undefined,
        },
      });

      if (response.success && response.data) {
        setGenerationResult(response.data);
        toast({
          title: "Assets generated successfully!",
          description: `Generated ${Object.values(response.data.assets).flat().length} assets in ${response.data.generationTime}ms`,
        });
      }
    } catch (error) {
      console.error("Asset generation error:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Failed to generate assets. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadAsset = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Header */}
      <header className="h-16 bg-card/80 backdrop-blur-2xl border-b border-border flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="w-12 h-12 rounded-xl flex items-center justify-center hover:opacity-80 transition-opacity">
            <img src={logoImage} alt="PlusUltra Logo" className="w-12 h-12 object-contain" />
          </Link>
          <div>
            <h1 className="font-bold text-xl text-foreground">Asset Generator</h1>
            <p className="text-xs text-muted-foreground">Create stunning app icons and assets with AI</p>
          </div>
        </div>
        <Link to="/workspace">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Workspace
          </Button>
        </Link>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuration Panel */}
          <div className="space-y-6">
            <Card className="bg-card/80 backdrop-blur-sm border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  App Information
                </CardTitle>
                <CardDescription>Tell us about your app to generate perfect assets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="appName">App Name *</Label>
                  <Input
                    id="appName"
                    placeholder="My Awesome App"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    className="bg-background/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform">Target Platform</Label>
                  <Select value={platform} onValueChange={(value: any) => setPlatform(value)}>
                    <SelectTrigger id="platform" className="bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">iOS & Android</SelectItem>
                      <SelectItem value="ios">iOS Only</SelectItem>
                      <SelectItem value="android">Android Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="userPrompt">Description (Optional)</Label>
                  <Textarea
                    id="userPrompt"
                    placeholder="A modern fintech app with a clean, professional design..."
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    className="bg-background/50 min-h-[80px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry">Industry (Optional)</Label>
                  <Input
                    id="industry"
                    placeholder="e.g., fintech, healthcare, education"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/80 backdrop-blur-sm border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-primary" />
                  Design Preferences
                </CardTitle>
                <CardDescription>Customize the look and feel of your assets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="style">Design Style</Label>
                  <Select value={style} onValueChange={(value: any) => setStyle(value)}>
                    <SelectTrigger id="style" className="bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="modern">Modern</SelectItem>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="gradient">Gradient</SelectItem>
                      <SelectItem value="flat">Flat</SelectItem>
                      <SelectItem value="abstract">Abstract</SelectItem>
                      <SelectItem value="3d">3D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Color Scheme (Max 5)</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {colorScheme.map((color, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1 bg-background/50 rounded-lg px-2 py-1 border border-border"
                      >
                        <div
                          className="w-6 h-6 rounded border border-border"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-mono">{color}</span>
                        {colorScheme.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 hover:bg-destructive/10"
                            onClick={() => handleRemoveColor(index)}
                          >
                            <XCircle className="w-3 h-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {colorScheme.length < 5 && (
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        className="w-16 h-10 p-1 bg-background/50"
                      />
                      <Button variant="outline" size="sm" onClick={handleAddColor} className="flex-1">
                        Add Color
                      </Button>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleGenerateAssets}
                  disabled={isGenerating || !appName.trim()}
                  className="w-full bg-gradient-to-r from-accent to-purple hover:opacity-90 text-accent-foreground shadow-lg shadow-accent/20"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating Assets...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Assets
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Preview Panel */}
          <div className="space-y-6">
            <Card className="bg-card/80 backdrop-blur-sm border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-primary" />
                  Generated Assets
                </CardTitle>
                <CardDescription>
                  {generationResult
                    ? `${Object.values(generationResult.assets).flat().length} assets ready to download`
                    : "Your generated assets will appear here"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!generationResult && !isGenerating && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                      <Package className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">No assets generated yet</p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Fill in the app information and click "Generate Assets" to create your app icons
                    </p>
                  </div>
                )}

                {isGenerating && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <p className="text-sm font-medium mb-1">Generating your assets...</p>
                    <p className="text-xs text-muted-foreground">This may take a few moments</p>
                  </div>
                )}

                {generationResult && (
                  <Tabs defaultValue={platform === "both" ? "ios" : platform} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="ios" disabled={!generationResult.assets.ios}>
                        <Smartphone className="w-4 h-4 mr-2" />
                        iOS
                      </TabsTrigger>
                      <TabsTrigger value="android" disabled={!generationResult.assets.android}>
                        <Smartphone className="w-4 h-4 mr-2" />
                        Android
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="ios" className="mt-4">
                      {generationResult.assets.ios && (
                        <ScrollArea className="h-[400px] pr-4">
                          <div className="grid grid-cols-2 gap-3">
                            {generationResult.assets.ios.map((asset) => (
                              <Card key={asset.id} className="bg-background/50 border-border overflow-hidden group">
                                <div className="aspect-square bg-muted/30 flex items-center justify-center p-4">
                                  <div
                                    className="w-full h-full rounded-2xl bg-gradient-to-br from-accent/20 to-purple/20 flex items-center justify-center"
                                    style={{
                                      background: `linear-gradient(135deg, ${colorScheme[0]}33, ${colorScheme[1] || colorScheme[0]}33)`,
                                    }}
                                  >
                                    <ImageIcon className="w-12 h-12 text-primary" />
                                  </div>
                                </div>
                                <div className="p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Badge variant="secondary" className="text-xs">
                                      {asset.size}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{asset.type}</span>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => downloadAsset(asset.url, `${appName}-${asset.size}.png`)}
                                  >
                                    <Download className="w-3 h-3 mr-2" />
                                    Download
                                  </Button>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </TabsContent>

                    <TabsContent value="android" className="mt-4">
                      {generationResult.assets.android && (
                        <ScrollArea className="h-[400px] pr-4">
                          <div className="grid grid-cols-2 gap-3">
                            {generationResult.assets.android.map((asset) => (
                              <Card key={asset.id} className="bg-background/50 border-border overflow-hidden group">
                                <div className="aspect-square bg-muted/30 flex items-center justify-center p-4">
                                  <div
                                    className="w-full h-full rounded-2xl bg-gradient-to-br from-accent/20 to-purple/20 flex items-center justify-center"
                                    style={{
                                      background: `linear-gradient(135deg, ${colorScheme[0]}33, ${colorScheme[1] || colorScheme[0]}33)`,
                                    }}
                                  >
                                    <ImageIcon className="w-12 h-12 text-primary" />
                                  </div>
                                </div>
                                <div className="p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Badge variant="secondary" className="text-xs">
                                      {asset.size}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{asset.type}</span>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => downloadAsset(asset.url, `${appName}-${asset.size}.png`)}
                                  >
                                    <Download className="w-3 h-3 mr-2" />
                                    Download
                                  </Button>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </TabsContent>
                  </Tabs>
                )}

                {generationResult && (
                  <div className="mt-4 p-4 bg-muted/30 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Generation Time</span>
                      <span className="font-medium">{generationResult.generationTime}ms</span>
                    </div>
                    {generationResult.estimatedCost && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Estimated Cost</span>
                        <span className="font-medium">${generationResult.estimatedCost.toFixed(4)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-green-500">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Assets generated successfully</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetGenerator;
