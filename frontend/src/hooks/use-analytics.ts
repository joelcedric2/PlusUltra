import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/lib/analytics';

export const useAnalytics = () => {
  const overview = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => analyticsService.getOverview(),
    refetchInterval: 60000,
  });

  const usage30d = useQuery({
    queryKey: ['analytics', 'usage', '30d'],
    queryFn: () => analyticsService.getUsageSeries('30d'),
    refetchInterval: 60000,
  });

  const projectStats = useQuery({
    queryKey: ['analytics', 'projects'],
    queryFn: () => analyticsService.getProjectStats(),
    refetchInterval: 120000,
  });

  const plans = useQuery({
    queryKey: ['analytics', 'plans'],
    queryFn: () => analyticsService.getPlanDistribution(),
    refetchInterval: 120000,
  });

  return {
    overview: overview.data,
    isLoadingOverview: overview.isLoading,
    usage: usage30d.data,
    isLoadingUsage: usage30d.isLoading,
    projectStats: projectStats.data,
    isLoadingProjectStats: projectStats.isLoading,
    plans: plans.data,
    isLoadingPlans: plans.isLoading,
  };
};


