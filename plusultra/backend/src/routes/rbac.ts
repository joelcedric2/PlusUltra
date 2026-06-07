import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import RBACService, {
  User,
  Role,
  AuditEvent,
  ComplianceReport,
  ComplianceFinding
} from '../services/rbac/RBACService';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createUserSchema, permissionCheckSchema, auditFiltersSchema } from '../schemas';

// Type definitions for request/response
type CreateUserRequest = {
  id: string;
  email: string;
  roles: string[];
  workspaceId?: string;
};

type UpdateUserRolesRequest = {
  roles: string[];
};

type PermissionCheckRequest = {
  userId: string;
  resource: string;
  action: string;
  context?: Record<string, any>;
};

type AuditFiltersRequest = {
  userId?: string;
  workspaceId?: string;
  eventType?: string;
  resource?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
};

type ComplianceReportRequest = {
  type: 'GDPR' | 'HIPAA' | 'SOX' | 'PCI-DSS' | 'CCPA';
  workspaceId?: string;
  period?: {
    start: string;
    end: string;
  };
};

type ExportAuditRequest = {
  format?: 'json' | 'csv';
};

type CleanupRequest = {
  maxAge?: number;
};

type AuditActionRequest = {
  userId?: string;
  workspaceId?: string;
  eventType: string;
  resource: string;
  action: string;
  details: Record<string, any>;
  success: boolean;
  errorMessage?: string;
  sessionId?: string;
};

// Error response type
interface ErrorResponse {
  error: string;
  code: string;
  requestId: string;
  timestamp: string;
  details?: any;
}

// Success response type
interface SuccessResponse<T = any> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

// Helper function to create consistent error responses
const createErrorResponse = (
  reply: FastifyReply,
  error: Error,
  statusCode: number = 500,
  code: string = 'INTERNAL_SERVER_ERROR'
) => {
  const requestId = uuidv4();
  const timestamp = new Date().toISOString();

  const errorResponse: ErrorResponse = {
    error: error.message || 'An unexpected error occurred',
    code,
    requestId,
    timestamp
  };

  // Log the error with request ID for debugging
  console.error(`[${timestamp}] [${requestId}] Error:`, error);

  return reply.status(statusCode).send(errorResponse);
};

// Helper function to create consistent success responses
const createSuccessResponse = <T>(
  reply: FastifyReply,
  data: T,
  statusCode: number = 200
) => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    requestId: uuidv4(),
    timestamp: new Date().toISOString()
  };

  return reply.status(statusCode).send(response);
};

// Create user
const createUser = async (
  request: FastifyRequest<{ Body: CreateUserRequest }>,
  reply: FastifyReply
) => {
  try {
    const userData = request.body;
    const rbacService = new RBACService();

    const user = await rbacService.createUser(userData);

    return createSuccessResponse(reply, {
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
        workspaceId: user.workspaceId,
        createdAt: user.createdAt,
        isActive: user.isActive
      }
    }, 201);
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('User creation failed'),
      400,
      'USER_CREATION_FAILED'
    );
  }
};

// Get user permissions
const getUserPermissions = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply
) => {
  try {
    const { userId } = request.params;
    const rbacService = new RBACService();

    const permissions = await rbacService.getUserPermissions(userId);

    return createSuccessResponse(reply, {
      permissions,
      userId
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('User not found'),
      404,
      'USER_NOT_FOUND'
    );
  }
};

// Update user roles
const updateUserRoles = async (
  request: FastifyRequest<{ Params: { userId: string }; Body: UpdateUserRolesRequest }>,
  reply: FastifyReply
) => {
  try {
    const { userId } = request.params;
    const { roles } = request.body;
    const rbacService = new RBACService();

    const user = await rbacService.updateUserRoles(userId, roles);

    return createSuccessResponse(reply, {
      user: {
        id: user.id,
        roles: user.roles,
        permissions: user.permissions,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Role update failed'),
      400,
      'ROLE_UPDATE_FAILED'
    );
  }
};

// Check permission
const checkPermission = async (
  request: FastifyRequest<{ Body: PermissionCheckRequest }>,
  reply: FastifyReply
) => {
  try {
    const { userId, resource, action, context } = request.body;
    const rbacService = new RBACService();

    const hasPermission = await rbacService.checkPermission(userId, resource, action, context);

    return createSuccessResponse(reply, {
      hasPermission,
      userId,
      resource,
      action,
      context
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Permission check failed'),
      400,
      'PERMISSION_CHECK_FAILED'
    );
  }
};

// Get audit events
const getAuditEvents = async (
  request: FastifyRequest<{ Querystring: AuditFiltersRequest }>,
  reply: FastifyReply
) => {
  try {
    const filters = request.query;
    const rbacService = new RBACService();

    // Convert date strings to Date objects
    const processedFilters = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined
    };

    const events = await rbacService.getAuditEvents(processedFilters);

    return createSuccessResponse(reply, {
      events,
      count: events.length,
      filters: filters
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get audit events'),
      400,
      'AUDIT_EVENTS_FETCH_FAILED'
    );
  }
};

// Generate compliance report
const generateComplianceReport = async (
  request: FastifyRequest<{ Body: ComplianceReportRequest }>,
  reply: FastifyReply
) => {
  try {
    const { type, workspaceId, period } = request.body;
    const rbacService = new RBACService();

    const report = await rbacService.generateComplianceReport(
      type,
      workspaceId,
      period ? {
        start: new Date(period.start),
        end: new Date(period.end)
      } : undefined
    );

    return createSuccessResponse(reply, {
      report: {
        id: report.id,
        type: report.type,
        workspaceId: report.workspaceId,
        period: report.period,
        findings: report.findings,
        score: report.score,
        status: report.status,
        generatedAt: report.generatedAt
      }
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Compliance report generation failed'),
      400,
      'COMPLIANCE_REPORT_FAILED'
    );
  }
};

// Get compliance reports
const getComplianceReports = async (
  request: FastifyRequest<{ Querystring: { type?: string; workspaceId?: string; status?: string } }>,
  reply: FastifyReply
) => {
  try {
    const filters = request.query as {
      type?: 'GDPR' | 'HIPAA' | 'SOX' | 'PCI-DSS' | 'CCPA';
      workspaceId?: string;
      status?: 'compliant' | 'non-compliant' | 'partial';
    };
    const rbacService = new RBACService();

    const reports = await rbacService.getComplianceReports(filters);

    return createSuccessResponse(reply, {
      reports,
      count: reports.length,
      filters: filters
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get compliance reports'),
      400,
      'COMPLIANCE_REPORTS_FETCH_FAILED'
    );
  }
};

// Export audit logs
const exportAuditLogs = async (
  request: FastifyRequest<{ Body: ExportAuditRequest }>,
  reply: FastifyReply
) => {
  try {
    const { format = 'json' } = request.body;
    const rbacService = new RBACService();

    const data = await rbacService.exportAuditLogs(format);

    return createSuccessResponse(reply, {
      format,
      data,
      timestamp: new Date().toISOString(),
      size: JSON.stringify(data).length
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Audit export failed'),
      400,
      'AUDIT_EXPORT_FAILED'
    );
  }
};

// Cleanup old audit events
const cleanupAuditEvents = async (
  request: FastifyRequest<{ Body: CleanupRequest }>,
  reply: FastifyReply
) => {
  try {
    const { maxAge = 90 * 24 * 60 * 60 * 1000 } = request.body; // 90 days default
    const rbacService = new RBACService();

    await rbacService.cleanupOldAuditEvents(maxAge);

    return createSuccessResponse(reply, {
      message: 'Cleanup completed successfully',
      maxAge: maxAge / (24 * 60 * 60 * 1000), // Convert to days for response
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Cleanup failed'),
      400,
      'CLEANUP_FAILED'
    );
  }
};

// Get system roles
const getSystemRoles = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const rbacService = new RBACService();

    // Get roles from the service (assuming it has a public method)
    // For now, we'll use a mock response based on the service structure
    const roles = [
      { id: 'admin', name: 'Administrator', permissions: ['*'] },
      { id: 'developer', name: 'Developer', permissions: ['read', 'write', 'execute'] },
      { id: 'viewer', name: 'Viewer', permissions: ['read'] }
    ];

    return createSuccessResponse(reply, {
      roles,
      count: roles.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get roles'),
      400,
      'ROLES_FETCH_FAILED'
    );
  }
};

// Audit action (for internal use)
const auditAction = async (
  request: FastifyRequest<{ Body: AuditActionRequest }>,
  reply: FastifyReply
) => {
  try {
    const event = request.body;
    const rbacService = new RBACService();

    const auditId = await rbacService.auditAction(event);

    return createSuccessResponse(reply, {
      auditId,
      message: 'Action audited successfully'
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Audit failed'),
      400,
      'AUDIT_FAILED'
    );
  }
};

export default async function rbacRoutes(fastify: FastifyInstance) {
  // Create user
  fastify.post('/api/v1/rbac/users', {
    schema: {
      body: createUserSchema,
      response: {
        201: z.object({
          success: z.literal(true),
          data: z.object({
            user: z.object({
              id: z.string(),
              email: z.string(),
              roles: z.array(z.string()),
              permissions: z.array(z.string()),
              workspaceId: z.string().optional(),
              createdAt: z.string(),
              isActive: z.boolean()
            })
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: createUser
  });

  // Get user permissions
  fastify.get('/api/v1/rbac/users/:userId/permissions', {
    schema: {
      params: z.object({
        userId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            permissions: z.array(z.string()),
            userId: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        404: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: getUserPermissions
  });

  // Update user roles
  fastify.patch('/api/v1/rbac/users/:userId/roles', {
    schema: {
      params: z.object({
        userId: z.string()
      }),
      body: z.object({
        roles: z.array(z.string())
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            user: z.object({
              id: z.string(),
              roles: z.array(z.string()),
              permissions: z.array(z.string()),
              updatedAt: z.string()
            })
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: updateUserRoles
  });

  // Check permission
  fastify.post('/api/v1/rbac/check-permission', {
    schema: {
      body: permissionCheckSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            hasPermission: z.boolean(),
            userId: z.string(),
            resource: z.string(),
            action: z.string(),
            context: z.any().optional()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: checkPermission
  });

  // Get audit events
  fastify.get('/api/v1/rbac/audit', {
    schema: {
      querystring: auditFiltersSchema.optional(),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            events: z.array(z.any()),
            count: z.number(),
            filters: z.any()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: getAuditEvents
  });

  // Generate compliance report
  fastify.post('/api/v1/rbac/compliance-report', {
    schema: {
      body: z.object({
        type: z.enum(['GDPR', 'HIPAA', 'SOX', 'PCI-DSS', 'CCPA']),
        workspaceId: z.string().optional(),
        period: z.object({
          start: z.string().datetime(),
          end: z.string().datetime()
        }).optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            report: z.object({
              id: z.string(),
              type: z.string(),
              workspaceId: z.string().optional(),
              period: z.any().optional(),
              findings: z.array(z.any()),
              score: z.number(),
              status: z.string(),
              generatedAt: z.string()
            })
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: generateComplianceReport
  });

  // Get compliance reports
  fastify.get('/api/v1/rbac/compliance-reports', {
    schema: {
      querystring: z.object({
        type: z.enum(['GDPR', 'HIPAA', 'SOX', 'PCI-DSS', 'CCPA']).optional(),
        workspaceId: z.string().optional(),
        status: z.enum(['compliant', 'non-compliant', 'partial']).optional()
      }).optional(),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            reports: z.array(z.any()),
            count: z.number(),
            filters: z.any()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: getComplianceReports
  });

  // Export audit logs
  fastify.post('/api/v1/rbac/export-audit', {
    schema: {
      body: z.object({
        format: z.enum(['json', 'csv']).optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            format: z.string(),
            data: z.any(),
            timestamp: z.string(),
            size: z.number()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: exportAuditLogs
  });

  // Cleanup old audit events
  fastify.post('/api/v1/rbac/cleanup', {
    schema: {
      body: z.object({
        maxAge: z.number().optional() // milliseconds
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            maxAge: z.number(),
            timestamp: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: cleanupAuditEvents
  });

  // Get system roles
  fastify.get('/api/v1/rbac/roles', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            roles: z.array(z.object({
              id: z.string(),
              name: z.string(),
              permissions: z.array(z.string())
            })),
            count: z.number(),
            timestamp: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: getSystemRoles
  });

  // Audit action (for internal use)
  fastify.post('/api/v1/rbac/audit', {
    schema: {
      body: z.object({
        userId: z.string().optional(),
        workspaceId: z.string().optional(),
        eventType: z.string(),
        resource: z.string(),
        action: z.string(),
        details: z.record(z.any()),
        success: z.boolean(),
        errorMessage: z.string().optional(),
        sessionId: z.string().optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            auditId: z.string(),
            message: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: auditAction
  });
}
