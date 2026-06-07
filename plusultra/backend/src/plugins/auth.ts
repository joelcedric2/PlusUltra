import { FastifyPluginAsync, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import { verifyToken, UserJwtPayload, UserRole, UserTier } from '../lib/auth';

// Extend FastifyInstance with the authenticate decorator
declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Authentication preHandler decorator.
     * Use as preHandler or preValidation to require authentication on routes.
     *
     * @example
     * fastify.get('/protected', { preHandler: [fastify.authenticate] }, handler)
     *
     * @todo Replace stub implementation with Clerk authentication
     */
    authenticate: preHandlerHookHandler;
  }

  interface FastifyRequest {
    /**
     * The authenticated user, populated by the authenticate decorator.
     * Will be undefined for unauthenticated requests.
     */
    user?: UserJwtPayload;
  }
}

/**
 * Auth plugin that provides the `authenticate` decorator for route protection.
 *
 * Current implementation: JWT-based authentication (stub for Clerk migration)
 * Future implementation: Clerk authentication
 *
 * Usage:
 * ```typescript
 * // Protect a single route
 * fastify.get('/api/protected', { preHandler: [fastify.authenticate] }, handler)
 *
 * // Protect with additional middleware
 * fastify.post('/api/admin', { preHandler: [fastify.authenticate, requireAdmin] }, handler)
 * ```
 */
const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate request with user property (must be done before the hook)
  fastify.decorateRequest('user', undefined);

  /**
   * Authenticate preHandler function.
   *
   * STUB IMPLEMENTATION: This is a placeholder for Clerk authentication.
   * Currently validates JWT tokens from Authorization header.
   *
   * When Clerk is integrated, this should:
   * 1. Validate the Clerk session token
   * 2. Fetch user data from Clerk
   * 3. Map Clerk user to UserJwtPayload format
   *
   * For development/testing, set BYPASS_AUTH=true to skip authentication.
   */
  const authenticate: preHandlerHookHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    // Development bypass for testing (remove in production)
    if (process.env.BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
      request.user = {
        id: 'dev-user-id',
        email: 'dev@plusultra.local',
        role: UserRole.ADMIN,
        tier: 'pro' as UserTier,
      };
      return;
    }

    try {
      const authHeader = request.headers.authorization;

      if (!authHeader) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'No authorization header provided',
          code: 'AUTH_MISSING_HEADER',
        });
      }

      // Extract token from "Bearer <token>" format
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;

      if (!token) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'No token provided',
          code: 'AUTH_MISSING_TOKEN',
        });
      }

      // TODO: Replace with Clerk token verification
      // const clerkUser = await clerkClient.verifyToken(token);
      // request.user = mapClerkUserToPayload(clerkUser);

      // Current JWT implementation (to be replaced by Clerk)
      const user = verifyToken(token);
      request.user = user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      return reply.code(401).send({
        error: 'Unauthorized',
        message,
        code: 'AUTH_INVALID_TOKEN',
      });
    }
  };

  // Register the authenticate decorator on FastifyInstance
  fastify.decorate('authenticate', authenticate);

  /**
   * Optional: Global preHandler to populate user from token if present.
   * This allows routes to optionally access user data without requiring auth.
   * The authenticate decorator is still needed for protected routes.
   */
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip if user is already set (e.g., by authenticate decorator)
    if (request.user) {
      return;
    }

    // Skip auth bypass check for global hook (only in authenticate)
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return;
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (token) {
      try {
        const user = verifyToken(token);
        request.user = user;
      } catch {
        // Silently ignore invalid tokens for optional auth
        // Protected routes will use the authenticate decorator
      }
    }
  });
};

export default fp(authPlugin, {
  name: 'auth-plugin',
  fastify: '5.x',
});
