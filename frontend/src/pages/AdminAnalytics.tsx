import { LandingHeader } from '@/components/landing/LandingHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAnalytics } from '@/hooks/use-analytics';
import { Sparkles, BarChart3, PieChart as PieIcon, LineChart as LineIcon } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';

const COLORS = ['#16a34a', '#f59e0b', '#ef4444', '#8b5cf6'];

const AdminAnalytics = () => {
  const { overview, usage, projectStats, plans, isLoadingOverview, isLoadingUsage, isLoadingProjectStats, isLoadingPlans } = useAnalytics();

  const usageData = usage || [];
  const projectData = projectStats || [];
  const planData = plans || [];

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      {/* Hero */}
      <section className="pt-28 pb-10 px-6">
        <div className="max-w-7xl mx-auto">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20 animate-fade-in">
            <Sparkles className="w-3 h-3 mr-1" />
            Admin • Analytics
          </Badge>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-2 animate-fade-in [animation-delay:100ms]">
              <h1 className="text-3xl md:text-5xl font-bold">Insights Dashboard</h1>
              <p className="text-muted-foreground">Track usage, adoption, and performance across PlusUltra</p>
            </div>
            <div className="flex items-center gap-3 animate-scale-in [animation-delay:150ms]">
              <Select defaultValue="30d">
                <SelectTrigger className="w-[140px] glass-panel">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent className="glass-panel">
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button className="bg-gradient-to-r from-accent to-purple text-white border-0">Refresh</Button>
              <Badge className="bg-accent/10 text-accent border-accent/20">Live</Badge>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-8 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="glass-panel border-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 animate-fade-in [animation-delay:50ms]">
            <CardHeader>
              <CardDescription>Total Users</CardDescription>
              <CardTitle>{isLoadingOverview ? '—' : overview?.totalUsers ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-panel border-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 animate-fade-in [animation-delay:100ms]">
            <CardHeader>
              <CardDescription>Total Projects</CardDescription>
              <CardTitle>{isLoadingOverview ? '—' : overview?.totalProjects ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-panel border-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 animate-fade-in [animation-delay:150ms]">
            <CardHeader>
              <CardDescription>MAU</CardDescription>
              <CardTitle>{isLoadingOverview ? '—' : overview?.monthlyActiveUsers ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="glass-panel border-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 animate-fade-in [animation-delay:200ms]">
            <CardHeader>
              <CardDescription>Monthly Tokens</CardDescription>
              <CardTitle>{isLoadingOverview ? '—' : (overview?.monthlyTokenUsage ?? 0).toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      </section>

      <section className="pb-8 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-panel border-primary/20 hover:shadow-2xl transition-all duration-300 animate-fade-in [animation-delay:100ms]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <LineIcon className="w-5 h-5 text-accent" />
                <CardTitle>Usage (Last 30 Days)</CardTitle>
              </div>
              <CardDescription>Tokens, requests, builds</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={usageData} margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="tokensUsed" stroke="#8b5cf6" dot={false} name="Tokens" />
                  <Line type="monotone" dataKey="requests" stroke="#16a34a" dot={false} name="Requests" />
                  <Line type="monotone" dataKey="buildsTriggered" stroke="#f59e0b" dot={false} name="Builds" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="glass-panel border-primary/20 hover:shadow-2xl transition-all duration-300 animate-fade-in [animation-delay:150ms]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-accent" />
                <CardTitle>Token Usage Trend</CardTitle>
              </div>
              <CardDescription>Smoothed area trend</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={usageData} margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="tokensUsed" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorTokens)" name="Tokens" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="pb-12 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-panel border-primary/20 hover:shadow-2xl transition-all duration-300 animate-fade-in [animation-delay:200ms]">
            <CardHeader>
              <CardTitle>Projects by Status</CardTitle>
              <CardDescription>Active, paused, archived</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectData} margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {projectData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="glass-panel border-primary/20 hover:shadow-2xl transition-all duration-300 animate-fade-in [animation-delay:250ms]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <PieIcon className="w-5 h-5 text-accent" />
                <CardTitle>User Plans</CardTitle>
              </div>
              <CardDescription>Distribution by tier</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={planData} dataKey="users" nameKey="tier" innerRadius={60} outerRadius={90} paddingAngle={4}>
                    {planData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default AdminAnalytics;


