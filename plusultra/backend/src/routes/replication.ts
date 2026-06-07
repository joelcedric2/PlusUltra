import { FastifyInstance } from 'fastify';
import { CrossRegionReplicationService } from '../services/replication/CrossRegionReplicationService';

export default async function replicationRoutes(fastify: FastifyInstance) {
  const service = new CrossRegionReplicationService(fastify.prisma);

  fastify.post('/api/v1/admin/replication/run', async (request, reply) => {
    const { sinceMinutes } = (request.body as any) || {};
    const res = await service.replicateDatabase(sinceMinutes || 10);
    return res;
  });

  fastify.post('/api/v1/admin/replication/asset', async (request, reply) => {
    const { key } = (request.body as any) || {};
    if (!key) return reply.code(400).send({ error: 'key required' });
    const res = await service.replicateAssetKey(key);
    return res;
  });
}



