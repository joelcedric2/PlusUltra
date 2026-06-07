import { FastifyInstance } from 'fastify';

export async function analyticsRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  fastify.get('/api/v1/analytics/overview', async (request, reply) => {
    try {
      const [totalUsers, totalProjects, monthlyActiveUsers, monthlyTokenUsage] = await Promise.all([
        prisma.user.count().catch(() => 0 as any),
        prisma.project.count().catch(() => 0 as any),
        prisma.$queryRawUnsafe<any>(
          `SELECT COUNT(DISTINCT user_id) as mau
           FROM audit_logs
           WHERE created_at > NOW() - INTERVAL '30 days';`
        ).then((rows) => Number(rows?.[0]?.mau || 0)).catch(() => 0),
        prisma.$queryRawUnsafe<any>(
          `SELECT COALESCE(SUM(tokens_used), 0) as total
           FROM token_usage
           WHERE created_at > NOW() - INTERVAL '30 days';`
        ).then((rows) => Number(rows?.[0]?.total || 0)).catch(() => 0),
      ]);

      return { totalUsers, totalProjects, monthlyActiveUsers, monthlyTokenUsage };
    } catch (err) {
      return { totalUsers: 0, totalProjects: 0, monthlyActiveUsers: 0, monthlyTokenUsage: 0 };
    }
  });

  fastify.get('/api/v1/analytics/usage', async (request, reply) => {
    const { range = '30d' } = request.query as { range?: '7d' | '30d' | '90d' };
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `WITH dates AS (
         SELECT generate_series::date AS d
         FROM generate_series(NOW()::date - INTERVAL '${days} days', NOW()::date, '1 day')
       )
       SELECT to_char(d, 'YYYY-MM-DD') AS date,
              COALESCE((SELECT SUM(tokens_used) FROM token_usage tu WHERE tu.created_at::date = d), 0) AS tokensUsed,
              COALESCE((SELECT COUNT(*) FROM audit_logs al WHERE al.created_at::date = d), 0) AS requests,
              COALESCE((SELECT COUNT(*) FROM build_jobs bj WHERE bj.created_at::date = d), 0) AS buildsTriggered
       FROM dates
       ORDER BY date ASC;`
    ).catch(() => []);
    return rows;
  });

  fastify.get('/api/v1/analytics/projects', async (request, reply) => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT status, COUNT(*) as count
       FROM projects
       GROUP BY status;`
    ).catch(() => []);

    // Normalize statuses
    const map: Record<string, number> = { active: 0, paused: 0, archived: 0 };
    for (const r of rows) {
      const status = String(r.status || '').toLowerCase();
      if (map[status] !== undefined) map[status] += Number(r.count || 0);
    }
    return Object.entries(map).map(([status, count]) => ({ status, count }));
  });

  fastify.get('/api/v1/analytics/plans', async (request, reply) => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(plan, 'free') as tier, COUNT(*) as users
       FROM users
       GROUP BY COALESCE(plan, 'free');`
    ).catch(() => []);

    const tiers: Array<'free' | 'starter' | 'pro' | 'enterprise'> = ['free', 'starter', 'pro', 'enterprise'];
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(String(r.tier), Number(r.users)));
    return tiers.map((t) => ({ tier: t, users: map.get(t) || 0 }));
  });
}

export default analyticsRoutes;



