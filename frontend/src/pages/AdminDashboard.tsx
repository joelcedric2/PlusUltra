/**
 * Admin Dashboard
 * Super-user dashboard for system analytics and monitoring
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ModelVotingAnalytics } from '@/components/admin/ModelVotingAnalytics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  TrendingUp,
  Users,
  Brain,
  DollarSign,
  Activity,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user has admin role
    const checkAdminRole = async () => {
      try {
        const hasAdminRole = user?.role === 'ADMIN';

        if (!hasAdminRole) {
          // User is not admin, redirect to dashboard
          navigate('/dashboard');
          return;
        }

        setIsAdmin(true);
      } catch (error) {
        console.error('Admin check failed:', error);
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      checkAdminRole();
    } else {
      navigate('/auth');
    }
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Activity className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Access Denied
            </CardTitle>
            <CardDescription>You do not have permission to access this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-16 bg-card/80 backdrop-blur-2xl flex items-center justify-between px-6 border-b border-border">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
          <div className="h-8 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Admin Dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 bg-primary/10 rounded-md border border-primary/20">
            <span className="text-xs font-medium text-primary">Super User</span>
          </div>
          <div className="text-sm text-muted-foreground">{user?.email}</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-7xl mx-auto py-8 px-6">
        {/* Warning Banner */}
        <Alert className="mb-6">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You are viewing system-wide analytics and metrics. This data is sensitive and should be
            handled with care.
          </AlertDescription>
        </Alert>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">2,847</div>
              <p className="text-xs text-muted-foreground">+12% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">8,421</div>
              <p className="text-xs text-muted-foreground">+23% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Requests</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">124.5K</div>
              <p className="text-xs text-muted-foreground">+34% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$42.3K</div>
              <p className="text-xs text-muted-foreground">+18% from last month</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Analytics */}
        <Tabs defaultValue="model-voting" className="space-y-4">
          <TabsList>
            <TabsTrigger value="model-voting">
              <Brain className="w-4 h-4 mr-2" />
              Model Voting
            </TabsTrigger>
            <TabsTrigger value="revenue">
              <DollarSign className="w-4 h-4 mr-2" />
              Revenue Tracking
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="w-4 h-4 mr-2" />
              User Analytics
            </TabsTrigger>
            <TabsTrigger value="system">
              <Activity className="w-4 h-4 mr-2" />
              System Health
            </TabsTrigger>
          </TabsList>

          {/* Model Voting Analytics Tab */}
          <TabsContent value="model-voting">
            <ModelVotingAnalytics />
          </TabsContent>

          {/* Revenue Tracking Tab */}
          <TabsContent value="revenue">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Tracking Analytics</CardTitle>
                <CardDescription>
                  Track revenue sharing agreements and payments for apps built on the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Revenue tracking analytics will be displayed here
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Shows 2% revenue share from apps earning &gt;$100K that were built and shipped on
                    the platform
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Analytics Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Analytics</CardTitle>
                <CardDescription>
                  User engagement metrics, project creation, and token usage patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">User analytics dashboard will be displayed here</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Track user growth, retention, and platform usage patterns
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Health Tab */}
          <TabsContent value="system">
            <Card>
              <CardHeader>
                <CardTitle>System Health Monitoring</CardTitle>
                <CardDescription>
                  Infrastructure metrics, API performance, and error tracking
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    System health dashboard will be displayed here
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Monitor API latency, error rates, sandbox uptime, and infrastructure costs
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
