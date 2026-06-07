/**
 * Analytics Routes Index
 *
 * Register all analytics-related routes.
 */

import { FastifyInstance } from 'fastify';
import { analyticsTrackingRoutes } from './tracking';
import { analyticsDashboardRoutes } from './dashboard';

export async function analyticsRoutes(fastify: FastifyInstance) {
  // Register tracking routes (for frontend SDK)
  await fastify.register(analyticsTrackingRoutes);

  // Register dashboard routes (for analytics dashboard)
  await fastify.register(analyticsDashboardRoutes);
}

export { analyticsTrackingRoutes } from './tracking';
export { analyticsDashboardRoutes } from './dashboard';
export default analyticsRoutes;
