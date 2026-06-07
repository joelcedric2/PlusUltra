import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  Users,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Package,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';

interface RevenueAnalyticsSummary {
  totalUsers: number;
  usersAccepted: number;
  usersDeclined: number;
  acceptanceRate: string;
}

interface AppsSummary {
  totalApps: number;
  appsAboveThreshold: number;
  totalRevenueShare: string;
}

interface ConsentRecord {
  userId: string;
  userEmail: string;
  userName: string;
  consentAccepted: boolean;
  acceptedAt: string;
}

interface RevenueApp {
  appName: string;
  userId: string;
  monthlyRevenue: number;
  annualRevenue: number;
  revenueShareAmount: number;
  builtWithPlusUltra: boolean;
  shippedViaPlatform: boolean;
}

interface RevenueAnalyticsData {
  summary: RevenueAnalyticsSummary;
  apps: AppsSummary;
  recentConsents: ConsentRecord[];
}

interface RevenueAppsData {
  apps: RevenueApp[];
  summary: {
    totalApps: number;
    totalRevenueShare: number;
    averageAppRevenue: number;
  };
}

export const RevenueAnalyticsDashboard: React.FC = () => {
  const api = useApi();
  const [analytics, setAnalytics] = useState<RevenueAnalyticsData | null>(null);
  const [apps, setApps] = useState<RevenueAppsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [analyticsRes, appsRes] = await Promise.all([
        api.get<{ success: true; data: RevenueAnalyticsData }>('/api/v1/admin/revenue/analytics'),
        api.get<{ success: true; data: RevenueAppsData }>('/api/v1/admin/revenue/apps'),
      ]);

      setAnalytics(analyticsRes.data);
      setApps(appsRes.data);
    } catch (error) {
      console.error('Failed to fetch revenue analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading || !analytics || !apps) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revenue Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Monitor revenue share agreements and app performance
          </p>
        </div>
        <Button onClick={fetchAnalytics} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.summary.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.summary.usersAccepted} accepted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Acceptance Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.summary.acceptanceRate}%</div>
            <p className="text-xs text-muted-foreground">
              {analytics.summary.usersDeclined} declined
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Apps Above Threshold</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.apps.appsAboveThreshold}</div>
            <p className="text-xs text-muted-foreground">
              of {analytics.apps.totalApps} total apps
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue Share</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(parseFloat(analytics.apps.totalRevenueShare))}</div>
            <p className="text-xs text-muted-foreground">
              2% of qualifying apps
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="consents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="consents">Consent Status</TabsTrigger>
          <TabsTrigger value="apps">Revenue Share Apps</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        {/* Consent Status Tab */}
        <TabsContent value="consents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Consent Agreements</CardTitle>
              <CardDescription>
                Latest 20 users who have interacted with the revenue share agreement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date Accepted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.recentConsents.length > 0 ? (
                    analytics.recentConsents.map((consent) => (
                      <TableRow key={consent.userId}>
                        <TableCell className="font-medium">{consent.userName}</TableCell>
                        <TableCell>{consent.userEmail}</TableCell>
                        <TableCell>
                          {consent.consentAccepted ? (
                            <Badge className="gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Accepted
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="w-3 h-3" />
                              Declined
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(consent.acceptedAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No consent records yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revenue Share Apps Tab */}
        <TabsContent value="apps" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Apps Subject to Revenue Share</CardTitle>
              <CardDescription>
                Apps earning {'>'} $100K annually, built and shipped with PlusUltra
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>App Name</TableHead>
                    <TableHead>Monthly Revenue</TableHead>
                    <TableHead>Annual Revenue</TableHead>
                    <TableHead>Revenue Share (2%)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apps.apps.length > 0 ? (
                    apps.apps.map((app, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{app.appName}</TableCell>
                        <TableCell>{formatCurrency(app.monthlyRevenue)}</TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(app.annualRevenue)}
                        </TableCell>
                        <TableCell className="text-green-600 font-semibold">
                          {formatCurrency(app.revenueShareAmount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {app.builtWithPlusUltra && (
                              <Badge variant="outline" className="text-xs">
                                Built
                              </Badge>
                            )}
                            {app.shippedViaPlatform && (
                              <Badge variant="outline" className="text-xs">
                                Shipped
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No apps above threshold yet</p>
                        <p className="text-sm mt-1">
                          Apps will appear here when they exceed $100K annual revenue
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {apps.apps.length > 0 && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">Summary</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Apps</p>
                      <p className="text-lg font-bold">{apps.summary.totalApps}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Revenue Share</p>
                      <p className="text-lg font-bold text-green-600">
                        {formatCurrency(apps.summary.totalRevenueShare)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Average App Revenue</p>
                      <p className="text-lg font-bold">
                        {formatCurrency(apps.summary.averageAppRevenue)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Share Agreement</CardTitle>
                <CardDescription>How the 2% revenue share works</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                  <DollarSign className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Only applies when:</p>
                    <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                      <li>• App revenue {'>'} $100,000/year</li>
                      <li>• Fully built with PlusUltra</li>
                      <li>• Shipped via platform</li>
                    </ul>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-600">Export Exemption</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      No revenue share if user exports and deploys elsewhere
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Commercial Agreement</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      This is a business agreement, not a privacy/GDPR policy
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Thresholds</CardTitle>
                <CardDescription>Understanding the $100K threshold</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Example calculations:</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 bg-muted rounded">
                      <span>$50,000/year revenue</span>
                      <span className="font-semibold">$0 share</span>
                    </div>
                    <div className="flex justify-between p-2 bg-muted rounded">
                      <span>$100,000/year revenue</span>
                      <span className="font-semibold">$0 share</span>
                    </div>
                    <div className="flex justify-between p-2 bg-green-500/10 rounded border border-green-500/30">
                      <span>$150,000/year revenue</span>
                      <span className="font-semibold text-green-600">$3,000 share</span>
                    </div>
                    <div className="flex justify-between p-2 bg-green-500/10 rounded border border-green-500/30">
                      <span>$500,000/year revenue</span>
                      <span className="font-semibold text-green-600">$10,000 share</span>
                    </div>
                    <div className="flex justify-between p-2 bg-green-500/10 rounded border border-green-500/30">
                      <span>$1,000,000/year revenue</span>
                      <span className="font-semibold text-green-600">$20,000 share</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-primary/10 rounded-lg text-sm">
                  <p className="font-medium">Note:</p>
                  <p className="text-muted-foreground mt-1">
                    Revenue share only triggers when revenue EXCEEDS $100,000
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RevenueAnalyticsDashboard;
