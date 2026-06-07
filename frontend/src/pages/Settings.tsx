import { useState } from "react";
import { Link } from "react-router-dom";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Lock,
  Bell,
  Palette,
  Code,
  CreditCard,
  Shield,
  Sparkles,
  Github,
  Mail,
  Trash2,
  Save,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Settings = () => {
  const { user, logout } = useAuth();
  const { toast } = useToast();

  // Profile settings
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");

  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [projectUpdates, setProjectUpdates] = useState(true);
  const [collaborationAlerts, setCollaborationAlerts] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);

  // Appearance settings
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [compactMode, setCompactMode] = useState(false);

  // Developer settings
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [enableTCI, setEnableTCI] = useState(true);

  // Revenue tracking settings
  const [revenueTrackingConsent, setRevenueTrackingConsent] = useState(false);
  const [hasAcceptedRevenue, setHasAcceptedRevenue] = useState(false);
  const [showRevenueModal, setShowRevenueModal] = useState(false);

  const handleSaveProfile = async () => {
    try {
      const response = await apiClient.put("/api/v1/auth/profile", {
        name,
        email,
      });

      if (response.success) {
        toast({
          title: "Profile updated",
          description: "Your profile has been updated successfully",
        });
      }
    } catch (error) {
      toast({
        title: "Update failed",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveNotifications = async () => {
    try {
      const response = await apiClient.put("/api/v1/settings/notifications", {
        emailNotifications,
        projectUpdates,
        collaborationAlerts,
        marketingEmails,
      });

      if (response.success) {
        toast({
          title: "Notifications updated",
          description: "Your notification preferences have been saved",
        });
      }
    } catch (error) {
      toast({
        title: "Update failed",
        description: "Failed to update notification settings",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const response = await apiClient.delete("/api/v1/auth/account");

      if (response.success) {
        toast({
          title: "Account deleted",
          description: "Your account has been permanently deleted",
        });
        await logout();
      }
    } catch (error) {
      toast({
        title: "Deletion failed",
        description: "Failed to delete account. Please contact support.",
        variant: "destructive",
      });
    }
  };

  const handleSaveRevenueConsent = async () => {
    try {
      const response = await apiClient.put("/api/v1/settings/revenue-tracking", {
        consentAccepted: revenueTrackingConsent,
        acceptedAt: new Date().toISOString(),
      });

      if (response.success) {
        setHasAcceptedRevenue(true);
        setShowRevenueModal(false);
        toast({
          title: "Revenue tracking consent saved",
          description: "Your revenue tracking preferences have been updated",
        });
      }
    } catch (error) {
      toast({
        title: "Update failed",
        description: "Failed to save revenue tracking consent",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <section className="pt-32 pb-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 animate-fade-in">Settings</h1>
            <p className="text-muted-foreground animate-fade-in [animation-delay:100ms]">
              Manage your account settings and preferences
            </p>
          </div>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 lg:grid-cols-6 glass-panel">
              <TabsTrigger value="profile" className="gap-2">
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">Profile</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2">
                <Lock className="w-4 h-4" />
                <span className="hidden sm:inline">Security</span>
              </TabsTrigger>
              <TabsTrigger value="billing" className="gap-2">
                <CreditCard className="w-4 h-4" />
                <span className="hidden sm:inline">Billing</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2">
                <Bell className="w-4 h-4" />
                <span className="hidden sm:inline">Notifications</span>
              </TabsTrigger>
              <TabsTrigger value="appearance" className="gap-2">
                <Palette className="w-4 h-4" />
                <span className="hidden sm:inline">Appearance</span>
              </TabsTrigger>
              <TabsTrigger value="developer" className="gap-2">
                <Code className="w-4 h-4" />
                <span className="hidden sm:inline">Developer</span>
              </TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-6">
              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Update your personal information and email</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>

                  <Button onClick={handleSaveProfile} className="w-full sm:w-auto">
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </CardContent>
              </Card>

              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle>Connected Accounts</CardTitle>
                  <CardDescription>Manage your connected OAuth providers</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <Github className="w-5 h-5" />
                      <div>
                        <p className="font-medium">GitHub</p>
                        <p className="text-sm text-muted-foreground">Connected</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                      Active
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5" />
                      <div>
                        <p className="font-medium">Google</p>
                        <p className="text-sm text-muted-foreground">Not connected</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Connect</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-6">
              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle>Password</CardTitle>
                  <CardDescription>Change your password or reset it</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input id="current-password" type="password" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input id="new-password" type="password" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input id="confirm-password" type="password" />
                  </div>

                  <Button className="w-full sm:w-auto">
                    <Lock className="w-4 h-4 mr-2" />
                    Update Password
                  </Button>
                </CardContent>
              </Card>

              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle>Two-Factor Authentication</CardTitle>
                  <CardDescription>Add an extra layer of security to your account</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Authenticator App</p>
                      <p className="text-sm text-muted-foreground">Use an authenticator app for 2FA</p>
                    </div>
                    <Switch />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">SMS Authentication</p>
                      <p className="text-sm text-muted-foreground">Receive codes via SMS</p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-destructive">Danger Zone</CardTitle>
                  <CardDescription>Irreversible actions for your account</CardDescription>
                </CardHeader>
                <CardContent>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full sm:w-auto">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-destructive" />
                          </div>
                          <AlertDialogTitle>Delete Account</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete your account and remove all your
                          data from our servers, including all projects, files, and settings.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAccount}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Yes, Delete My Account
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Billing & Revenue Tab */}
            <TabsContent value="billing" className="space-y-6">
              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle>Revenue Sharing Agreement</CardTitle>
                  <CardDescription>
                    Commercial agreement for revenue sharing on successful apps built with PlusUltra
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Revenue Share Terms */}
                  <div className="p-6 rounded-lg border-2 border-accent/30 bg-accent/5 space-y-4">
                    <div className="flex items-start gap-3">
                      <CreditCard className="w-6 h-6 text-accent mt-1" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2">Revenue Share Terms</h3>
                        <div className="space-y-3 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">
                            PlusUltra receives a 2% revenue share ONLY if:
                          </p>
                          <ul className="list-disc list-inside space-y-2 ml-2">
                            <li>Your app generates <strong className="text-foreground">more than $100,000 USD</strong> in revenue (annually)</li>
                            <li>The app was <strong className="text-foreground">fully built using PlusUltra</strong> (not just partially)</li>
                            <li>The app was <strong className="text-foreground">shipped/published</strong> on the platform (app store, web, etc.)</li>
                          </ul>
                          <div className="mt-4 p-3 bg-background rounded border border-border">
                            <p className="text-xs">
                              <strong>Example:</strong> If your app earns $150,000/year, PlusUltra receives 2% = $3,000/year.
                              If your app earns $50,000/year, PlusUltra receives $0 (below threshold).
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Export Exemption Notice */}
                  <div className="p-6 rounded-lg border-2 border-green-500/30 bg-green-500/5 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-green-600 mt-1" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2 text-green-600">Export Exemption</h3>
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <p>
                            <strong className="text-foreground">You can export your project at ANY time</strong> and build it outside of PlusUltra.
                          </p>
                          <p>
                            If you export and deploy your app using your own infrastructure (not via PlusUltra's publishing tools),
                            <strong className="text-green-600"> NO revenue share applies</strong>, regardless of revenue.
                          </p>
                          <p className="mt-3 text-xs italic">
                            This agreement ONLY applies to apps built AND shipped using PlusUltra's integrated deployment/publishing features.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Terms */}
                  <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2 text-sm">
                    <h4 className="font-semibold">Additional Details:</h4>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
                      <li>This is a <strong className="text-foreground">commercial agreement</strong>, not a privacy/GDPR policy</li>
                      <li>Revenue share is calculated annually and billed quarterly</li>
                      <li>You maintain <strong className="text-foreground">100% ownership</strong> of your app and IP</li>
                      <li>You can revoke consent and export your project at any time (see exemption above)</li>
                      <li>Transparent reporting: you'll receive detailed revenue share breakdowns</li>
                    </ul>
                  </div>

                  <Separator />

                  {/* Consent Checkbox */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 rounded-lg border border-border">
                      <input
                        type="checkbox"
                        id="revenue-consent"
                        checked={revenueTrackingConsent}
                        onChange={(e) => setRevenueTrackingConsent(e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <label htmlFor="revenue-consent" className="text-sm flex-1 cursor-pointer">
                        <span className="font-medium">I agree to the revenue sharing terms</span>
                        <p className="text-muted-foreground mt-1">
                          By checking this box, I acknowledge that I have read and agree to the 2% revenue share
                          for apps earning over $100,000/year that are built and shipped using PlusUltra.
                          I understand I can export my project at any time to avoid this agreement.
                        </p>
                      </label>
                    </div>

                    {hasAcceptedRevenue && (
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span>Revenue sharing agreement accepted</span>
                      </div>
                    )}

                    <Button
                      onClick={handleSaveRevenueConsent}
                      disabled={!revenueTrackingConsent}
                      className="w-full sm:w-auto"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Revenue Preferences
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle>Billing Information</CardTitle>
                  <CardDescription>Manage your subscription and payment methods</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div>
                      <p className="font-medium">Current Plan</p>
                      <p className="text-sm text-muted-foreground">Free Tier</p>
                    </div>
                    <Badge variant="outline">Active</Badge>
                  </div>

                  <Button variant="outline" className="w-full">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Upgrade to Pro
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>Choose what notifications you want to receive</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Email Notifications</p>
                      <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                    </div>
                    <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Project Updates</p>
                      <p className="text-sm text-muted-foreground">Get notified about project changes</p>
                    </div>
                    <Switch checked={projectUpdates} onCheckedChange={setProjectUpdates} />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Collaboration Alerts</p>
                      <p className="text-sm text-muted-foreground">Notifications when team members collaborate</p>
                    </div>
                    <Switch checked={collaborationAlerts} onCheckedChange={setCollaborationAlerts} />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Marketing Emails</p>
                      <p className="text-sm text-muted-foreground">Receive product updates and promotions</p>
                    </div>
                    <Switch checked={marketingEmails} onCheckedChange={setMarketingEmails} />
                  </div>

                  <Button onClick={handleSaveNotifications} className="w-full sm:w-auto">
                    <Save className="w-4 h-4 mr-2" />
                    Save Preferences
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Appearance Tab */}
            <TabsContent value="appearance" className="space-y-6">
              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle>Theme</CardTitle>
                  <CardDescription>Customize how PlusUltra looks</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <Button
                      variant={theme === "light" ? "default" : "outline"}
                      onClick={() => setTheme("light")}
                      className="h-24 flex-col gap-2"
                    >
                      <div className="w-8 h-8 rounded-full bg-white border-2 border-border" />
                      Light
                    </Button>
                    <Button
                      variant={theme === "dark" ? "default" : "outline"}
                      onClick={() => setTheme("dark")}
                      className="h-24 flex-col gap-2"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-900 border-2 border-border" />
                      Dark
                    </Button>
                    <Button
                      variant={theme === "system" ? "default" : "outline"}
                      onClick={() => setTheme("system")}
                      className="h-24 flex-col gap-2"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-white to-gray-900 border-2 border-border" />
                      System
                    </Button>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Compact Mode</p>
                      <p className="text-sm text-muted-foreground">Reduce spacing and padding</p>
                    </div>
                    <Switch checked={compactMode} onCheckedChange={setCompactMode} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Developer Tab */}
            <TabsContent value="developer" className="space-y-6">
              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-accent" />
                    TCI Settings
                  </CardTitle>
                  <CardDescription>Temporal Code Intelligence configuration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Enable TCI</p>
                      <p className="text-sm text-muted-foreground">Use Temporal Code Intelligence features</p>
                    </div>
                    <Switch checked={enableTCI} onCheckedChange={setEnableTCI} />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Advanced Options</p>
                      <p className="text-sm text-muted-foreground">Show advanced developer features</p>
                    </div>
                    <Switch checked={showAdvancedOptions} onCheckedChange={setShowAdvancedOptions} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-primary/20">
                <CardHeader>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Manage your API keys for programmatic access</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full sm:w-auto">
                    <Shield className="w-4 h-4 mr-2" />
                    Generate New API Key
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
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

export default Settings;
