import { Code2, Eye, Package, Github, Share2, Sparkles, Cloud, PanelLeftClose, Monitor, Smartphone, Tablet, ArrowUpRight, RotateCw, ChevronDown, Settings, Edit, ChevronLeft, Gift, AlertTriangle } from "lucide-react";
import logoImage from "@/assets/plusultra-logo.png";
import { Button } from "@/components/ui/button";
import { ViewMode, DeviceMode } from "../Workspace";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { CollaboratorPresence } from "./CollaboratorPresence";
import { useSimulatedCollaboration } from "@/hooks/useSimulatedCollaboration";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { BackendConnectionStatus } from "@/components/backend/BackendConnectionStatus";
import { MobilePivotDialog } from "@/components/mobile/MobilePivotDialog";
import { useAuth } from "@/contexts/AuthContext";
import { tokenService, TokenPool } from "@/lib/token";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

type ExtendedViewMode = ViewMode | "cloud";

interface HeaderProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  deviceMode: DeviceMode;
  setDeviceMode: (mode: DeviceMode) => void;
  onToggleChat: () => void;
  isChatCollapsed: boolean;
  projectId?: string;
  projectName?: string;
  onProjectNameChange?: (name: string) => void;
  onRefreshPreview?: () => void;
  currentPage?: string;
  availablePages?: string[];
  onPageChange?: (page: string) => void;
}

export const Header = ({
  viewMode,
  setViewMode,
  deviceMode,
  setDeviceMode,
  onToggleChat,
  isChatCollapsed,
  projectId = "untitled",
  projectName = "Untitled Project",
  onProjectNameChange,
  onRefreshPreview,
  currentPage = "home",
  availablePages = ["/home"],
  onPageChange
}: HeaderProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [isCloudDialogOpen, setIsCloudDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isMobilePivotOpen, setIsMobilePivotOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState(projectName);
  const [tokenPool, setTokenPool] = useState<TokenPool | null>(null);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const { collaborators } = useSimulatedCollaboration();

  // Fetch token balance when component mounts or user changes
  useEffect(() => {
    const fetchTokenBalance = async () => {
      if (!isAuthenticated || !user) {
        setTokenPool(null);
        return;
      }

      setIsLoadingTokens(true);
      try {
        const pool = await tokenService.getTokenPool(user.id, projectId);
        setTokenPool(pool);

        // Show warning toast if tokens are low
        if (tokenService.isLowOnTokens(pool) && pool.availableTokens > 0) {
          toast({
            title: "Low token balance",
            description: `You have ${pool.availableTokens.toFixed(1)} tokens remaining. Consider purchasing more tokens to avoid interruptions.`,
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Failed to fetch token balance:', error);
        // Don't show error toast - graceful degradation
      } finally {
        setIsLoadingTokens(false);
      }
    };

    fetchTokenBalance();
  }, [user, isAuthenticated, projectId, toast]);

  const handleConnectSupabase = async () => {
    try {
      const response = await apiClient.post("/api/v1/sandbox/connect-supabase", {
        projectId,
        supabaseUrl,
        supabaseKey,
      });

      if (response.success) {
        toast({
          title: "Supabase connected",
          description: "Your project is now connected to Supabase",
        });
        setIsCloudDialogOpen(false);
      }
    } catch (error) {
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Failed to connect to Supabase",
        variant: "destructive",
      });
    }
  };

  const handleGoToDashboard = () => {
    navigate("/dashboard");
  };

  const handleGetFreeTokens = () => {
    // Navigate to pricing or tokens page
    navigate("/pricing");
  };

  const handleRenameProject = async () => {
    if (!newProjectName.trim()) {
      toast({
        title: "Invalid name",
        description: "Project name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiClient.put(`/api/v1/projects/${projectId}`, {
        name: newProjectName,
      });

      if (response.success) {
        onProjectNameChange?.(newProjectName);
        toast({
          title: "Project renamed",
          description: `Project renamed to "${newProjectName}"`,
        });
        setIsRenameDialogOpen(false);
      }
    } catch (error) {
      toast({
        title: "Rename failed",
        description: error instanceof Error ? error.message : "Failed to rename project",
        variant: "destructive",
      });
    }
  };

  const handleOpenSettings = () => {
    navigate("/settings");
  };

  const handleOpenInNewWindow = () => {
    // Open only the preview in a new window
    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${projectName} - Preview</title>
            <style>
              body { margin: 0; padding: 0; }
              iframe { width: 100%; height: 100vh; border: none; }
            </style>
          </head>
          <body>
            <iframe src="${window.location.origin}/workspace?project=${projectId}&preview=true"></iframe>
          </body>
        </html>
      `);
    }
  };

  const handleRefreshPreview = () => {
    if (onRefreshPreview) {
      onRefreshPreview();
    } else {
      toast({
        title: "Refreshing preview",
        description: "Recompiling your app...",
      });
      // Trigger a preview refresh without full page reload
      window.dispatchEvent(new CustomEvent("refreshPreview"));
    }
  };

  const handleShareProject = async () => {
    try {
      // Generate shareable link
      const shareUrl = `${window.location.origin}/workspace?project=${projectId}`;

      if (navigator.share) {
        await navigator.share({
          title: projectName,
          text: `Check out my app: ${projectName}`,
          url: shareUrl,
        });
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Link copied",
          description: "Project link copied to clipboard",
        });
      }
    } catch (error) {
      console.error("Share failed:", error);
    }
  };

  const handleGitHubIntegration = () => {
    toast({
      title: "GitHub Integration",
      description: "Opening GitHub connection dialog...",
    });
    // Navigate to GitHub integration or open dialog
    navigate("/team");
  };

  return (
    <header className="h-16 bg-card/80 backdrop-blur-2xl flex items-center justify-between px-6 relative z-10">
      {/* Logo and Project Name */}
        <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="w-12 h-12 rounded-xl flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer">
            <img src={logoImage} alt="PlusUltra Logo" className="w-12 h-12 object-contain" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <span className="font-bold text-xl text-foreground">
                  {projectName}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 bg-card border-border z-50 p-3">
              <DropdownMenuItem
                className="gap-3 cursor-pointer hover:bg-accent/10 hover:text-foreground focus:bg-accent/10 focus:text-foreground mb-2"
                onClick={handleGoToDashboard}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Go to dashboard</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/50 mb-3" />
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Tokens</span>
                    {tokenPool && tokenService.isLowOnTokens(tokenPool) && (
                      <AlertTriangle className="w-3 h-3 text-orange-500" />
                    )}
                  </div>
                  <span className={cn(
                    "font-medium",
                    tokenPool && tokenService.isLowOnTokens(tokenPool)
                      ? "text-orange-500"
                      : "text-foreground"
                  )}>
                    {isLoadingTokens
                      ? "Loading..."
                      : tokenPool
                        ? tokenService.formatTokenBalance(tokenPool.availableTokens)
                        : user?.tokenBalance
                          ? `${user.tokenBalance} left`
                          : "N/A"
                    }
                  </span>
                </div>
                <Progress
                  value={tokenPool ? tokenService.calculateRemainingPercentage(tokenPool) : user?.tokenBalance || 0}
                  className={cn(
                    "h-2",
                    tokenPool && tokenService.isLowOnTokens(tokenPool)
                      ? "[&>div]:bg-gradient-to-r [&>div]:from-orange-500 [&>div]:to-red-500"
                      : "[&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500"
                  )}
                />
                {tokenPool && tokenService.isLowOnTokens(tokenPool) && (
                  <p className="text-xs text-orange-500 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Running low - consider purchasing more
                  </p>
                )}
              </div>
              <DropdownMenuItem
                className="gap-3 cursor-pointer hover:bg-accent/10 hover:text-foreground focus:bg-accent/10 focus:text-foreground mb-2"
                onClick={handleGetFreeTokens}
              >
                <Gift className="w-4 h-4 text-primary" />
                <span>Get Free Tokens</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/50 mb-2" />
              <DropdownMenuItem
                className="gap-3 cursor-pointer hover:bg-accent/10 hover:text-foreground focus:bg-accent/10 focus:text-foreground"
                onClick={() => setIsRenameDialogOpen(true)}
              >
                <Edit className="w-4 h-4" />
                <span>Rename Project</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-3 cursor-pointer hover:bg-accent/10 hover:text-foreground focus:bg-accent/10 focus:text-foreground"
                onClick={() => setIsMobilePivotOpen(true)}
              >
                <Smartphone className="w-4 h-4 text-primary" />
                <span>Convert to Mobile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-3 cursor-pointer hover:bg-accent/10 hover:text-foreground focus:bg-accent/10 focus:text-foreground"
                onClick={handleOpenSettings}
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="h-6 w-px bg-border/50" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleChat}
          className="h-8 w-8 p-0 hover:bg-muted/50 rounded-lg transition-all"
        >
          <PanelLeftClose className={cn(
            "w-4 h-4 text-muted-foreground hover:text-foreground transition-transform",
            isChatCollapsed && "rotate-180"
          )} />
        </Button>
      </div>

      {/* View Mode Toggle */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("preview")}
            className={cn(
              "gap-1.5 rounded-lg transition-all duration-200 h-8 px-2.5 text-xs",
              viewMode === "preview" 
                ? "bg-muted shadow-sm border border-border" 
                : "hover:bg-muted/50"
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            {viewMode === "preview" && <span className="font-medium">Preview</span>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("code")}
            className={cn(
              "gap-1.5 rounded-lg transition-all duration-200 h-8 px-2.5 text-xs",
              viewMode === "code" 
                ? "bg-muted shadow-sm border border-border" 
                : "hover:bg-muted/50"
            )}
          >
            <Code2 className="w-3.5 h-3.5" />
            {viewMode === "code" && <span className="font-medium">Code</span>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("build")}
            className={cn(
              "gap-1.5 rounded-lg transition-all duration-200 h-8 px-2.5 text-xs",
              viewMode === "build"
                ? "bg-muted shadow-sm border border-border"
                : "hover:bg-muted/50"
            )}
          >
            <Package className="w-3.5 h-3.5" />
            {viewMode === "build" && <span className="font-medium">Build</span>}
          </Button>

        <Dialog open={isCloudDialogOpen} onOpenChange={setIsCloudDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-lg transition-all h-8 w-8 p-0 hover:bg-muted/50"
            >
              <Cloud className="w-3.5 h-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Connect to Supabase</DialogTitle>
              <DialogDescription>
                Sync your Supabase project with PlusUltra. You'll need your project's API key and URL.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="supabase-url">Supabase Project URL</Label>
                <Input
                  id="supabase-url"
                  placeholder="https://your-project.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supabase-key">Supabase Anon Key</Label>
                <Input
                  id="supabase-key"
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                />
              </div>
              <div className="rounded-lg border border-border p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground mb-2">
                  Find your credentials in your Supabase project settings:
                </p>
                <a
                  href="https://supabase.com/dashboard/project/_/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Open Supabase Dashboard →
                </a>
              </div>
              <Button
                onClick={handleConnectSupabase}
                className="w-full bg-gradient-to-r from-accent to-purple hover:opacity-90 text-accent-foreground shadow-lg shadow-accent/20"
                disabled={!supabaseUrl || !supabaseKey}
              >
                Connect Project
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>

        {/* Device & Page Controls */}
        <div className="flex items-center gap-2 ml-3 bg-secondary border border-border rounded-xl px-2 py-1">
          {/* Cycling Screen Size Icon */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const modes: DeviceMode[] = ["mobile", "tablet", "desktop"];
              const currentIndex = modes.indexOf(deviceMode);
              const nextIndex = (currentIndex + 1) % modes.length;
              setDeviceMode(modes[nextIndex]);
            }}
            className="h-8 w-8 p-0 hover:bg-muted/50 rounded-lg transition-all"
          >
            {deviceMode === "mobile" && <Smartphone className="w-3.5 h-3.5" />}
            {deviceMode === "tablet" && <Tablet className="w-3.5 h-3.5" />}
            {deviceMode === "desktop" && <Monitor className="w-3.5 h-3.5" />}
          </Button>

          {/* Separator */}
          <span className="text-muted-foreground text-sm">/</span>

          {/* Page Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 hover:bg-muted/50 rounded-lg text-xs font-medium"
              >
                {currentPage}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-card border-border">
              {availablePages.map((page) => (
                <DropdownMenuItem
                  key={page}
                  className="text-xs cursor-pointer"
                  onClick={() => onPageChange?.(page)}
                >
                  {page}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Spacer */}
          <div className="w-2" />

          {/* Open in New Window */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenInNewWindow}
            className="h-8 w-8 p-0 hover:bg-muted/50 rounded-lg transition-all"
            title="Open preview in new window"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>

          {/* Refresh Preview */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshPreview}
            className="h-8 w-8 p-0 hover:bg-muted/50 rounded-lg transition-all"
            title="Refresh preview"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <CollaboratorPresence collaborators={collaborators} />
        <div className="h-6 w-px bg-border/50" />
        <BackendConnectionStatus projectId={projectId} />
        <div className="h-6 w-px bg-border/50" />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleGitHubIntegration}
          className="h-8 w-8 p-0 hover:bg-muted/50 rounded-lg transition-all"
          title="GitHub integration"
        >
          <Github className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleShareProject}
          className="h-8 w-8 p-0 hover:bg-muted/50 rounded-lg transition-all"
          title="Share project"
        >
          <Share2 className="w-4 h-4" />
        </Button>
        <Button size="sm" className="gap-2 bg-gradient-to-r from-accent to-purple hover:opacity-90 text-accent-foreground shadow-lg shadow-accent/20 rounded-lg font-medium" asChild>
          <Link to="/publish">
            <Sparkles className="w-4 h-4" />
            Publish
          </Link>
        </Button>
      </div>

      {/* Rename Project Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>
              Enter a new name for your project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="My Awesome Project"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRenameProject();
                  }
                }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setIsRenameDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRenameProject}
                className="bg-gradient-to-r from-accent to-purple hover:opacity-90 text-accent-foreground"
                disabled={!newProjectName.trim()}
              >
                Rename
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Pivot Dialog */}
      <MobilePivotDialog
        open={isMobilePivotOpen}
        onOpenChange={setIsMobilePivotOpen}
        projectId={projectId}
        projectName={projectName}
        onConversionComplete={(result) => {
          toast({
            title: "Mobile Conversion Complete",
            description: `Successfully converted to ${result.platform}`,
          });
        }}
      />
    </header>
  );
};
