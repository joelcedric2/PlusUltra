// Fastify plugin type declarations
// This file extends Fastify types with custom declarations.
// It is automatically loaded via the typeRoots configuration in tsconfig.json
// and through reference in server.ts.

import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { Redis } from 'ioredis';
import { preHandlerHookHandler, FastifySchema } from 'fastify';
import { UserJwtPayload } from '../lib/auth';

declare module 'fastify' {
  /**
   * Extend FastifySchema to support OpenAPI/Swagger-style documentation fields.
   * These fields are used for API documentation even without @fastify/swagger installed.
   * If @fastify/swagger is added later, these fields will be automatically used.
   */
  interface FastifySchema {
    /** Description of the route for API documentation */
    description?: string;
    /** Tags for grouping routes in API documentation */
    tags?: string[];
    /** Summary of the route (shorter than description) */
    summary?: string;
    /** Marks the route as deprecated */
    deprecated?: boolean;
    /** Security requirements for the route */
    security?: Array<{ [key: string]: string[] }>;
    /** External documentation link */
    externalDocs?: {
      description?: string;
      url: string;
    };
    /** Operation ID for code generation */
    operationId?: string;
    /** Request body content types */
    consumes?: string[];
    /** Response content types */
    produces?: string[];
  }

  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    stripe: Stripe;
    websocketServer?: {
      clients: Set<any>;
    };
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
    user?: UserJwtPayload;
    workspace?: {
      id: string;
      name?: string;
      [key: string]: any;
    };
  }
}
