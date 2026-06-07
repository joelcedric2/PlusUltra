import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  User,
  Mail,
  Calendar,
  Folder,
  Settings as SettingsIcon,
  Github,
  Shield,
  Clock,
  Sparkles
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api";

interface UserStats {
  totalProjects: number;
  publicProjects: number;
  totalTokensUsed: number;
  accountAge: number;
}

const Profile = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats>({
    totalProjects: 0,
    publicProjects: 0,
    totalTokensUsed: 0,
    accountAge: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserStats();
  }, []);

  const loadUserStats = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get<UserStats>("/api/v1/auth/stats");
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("Failed to load user stats:", error);
      // Demo stats if API fails
      setStats({
        totalProjects: 3,
        publicProjects: 1,
        totalTokensUsed: 1247,
        accountAge: 30,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <section className="pt-32 pb-12 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Profile Header */}
          <Card className="glass-panel border-primary/20 mb-8 animate-fade-in">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                <Avatar className="w-24 h-24 ring-4 ring-accent/20">
                  <AvatarFallback className="bg-gradient-to-br from-accent/30 to-purple/30 text-2xl font-bold">
                    {getInitials(user?.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 space-y-3">
                  <div>
                    <h1 className="text-3xl font-bold mb-1">{user?.name || "User"}</h1>
                    <p className="text-muted-foreground flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      {user?.email || "user@example.com"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Calendar className="w-3 h-3" />
                      Joined {formatDate(user?.createdAt)}
                    </Badge>
                    {user?.githubUsername && (
                      <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-500 border-green-500/20">
                        <Github className="w-3 h-3" />
                        {user.githubUsername}
                      </Badge>
                    )}
                  </div>
                </div>

                <Link to="/settings">
                  <Button variant="outline" className="gap-2">
                    <SettingsIcon className="w-4 h-4" />
                    Edit Profile
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="glass-panel border-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 animate-fade-in [animation-delay:100ms]">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Projects</p>
                    <p className="text-2xl font-bold">{isLoading ? "—" : stats.totalProjects}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Folder className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 animate-fade-in [animation-delay:150ms]">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Public Projects</p>
                    <p className="text-2xl font-bold">{isLoading ? "—" : stats.publicProjects}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 animate-fade-in [animation-delay:200ms]">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Tokens Used</p>
                    <p className="text-2xl font-bold">
                      {isLoading ? "—" : stats.totalTokensUsed.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 animate-fade-in [animation-delay:250ms]">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Account Age</p>
                    <p className="text-2xl font-bold">{isLoading ? "—" : `${stats.accountAge}d`}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Account Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="glass-panel border-primary/20 animate-fade-in [animation-delay:300ms]">
              <CardHeader>
                <CardTitle>Account Details</CardTitle>
                <CardDescription>Your account information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Full Name</p>
                      <p className="text-sm text-muted-foreground">{user?.name || "Not set"}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Email Address</p>
                      <p className="text-sm text-muted-foreground">{user?.email || "Not set"}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Member Since</p>
                      <p className="text-sm text-muted-foreground">{formatDate(user?.createdAt)}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Account Status</p>
                      <p className="text-sm text-green-500">Active</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                    Verified
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-primary/20 animate-fade-in [animation-delay:350ms]">
              <CardHeader>
                <CardTitle>Connected Services</CardTitle>
                <CardDescription>Third-party integrations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <Github className="w-5 h-5" />
                    <div>
                      <p className="font-medium">GitHub</p>
                      <p className="text-sm text-muted-foreground">
                        {user?.githubUsername || "Not connected"}
                      </p>
                    </div>
                  </div>
                  {user?.githubUsername ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                      Connected
                    </Badge>
                  ) : (
                    <Button variant="outline" size="sm">
                      Connect
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5" />
                    <div>
                      <p className="font-medium">Google</p>
                      <p className="text-sm text-muted-foreground">Not connected</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Connect
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto text-center text-muted-foreground">
          <p>&copy; 2025 PlusUltra. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Profile;
