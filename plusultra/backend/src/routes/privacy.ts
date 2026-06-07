import { FastifyInstance } from 'fastify';
import { DataRetentionService } from '../services/privacy/DataRetentionService';

export default async function privacyRoutes(fastify: FastifyInstance) {
  const retentionService = new DataRetentionService(fastify.prisma);

  // Manual trigger
  fastify.post('/api/v1/admin/privacy/run-retention', async (request, reply) => {
    const result = await retentionService.runCleanup();
    return result;
  });

  // Scheduled interval (simple timer, configurable)
  const hours = parseInt(process.env.RETENTION_INTERVAL_HOURS || '24', 10);
  const enabled = (process.env.RETENTION_ENABLED || 'true').toLowerCase() === 'true';
  if (enabled && hours > 0) {
    setInterval(() => {
      retentionService.runCleanup().catch(() => void 0);
    }, hours * 60 * 60 * 1000);
  }
}



