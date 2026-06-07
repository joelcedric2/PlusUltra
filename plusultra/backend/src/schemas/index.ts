/**
 * Shared Zod schemas for API validation
 */

import { z } from 'zod';

// User and Authentication Schemas
export const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  role: z.enum(['admin', 'user', 'guest']).optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

// Collaboration Schemas
export const createSessionRequestSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string(),
  creatorId: z.string(),
  settings: z.object({
    allowComments: z.boolean().optional(),
    allowVideoChat: z.boolean().optional(),
    allowBranching: z.boolean().optional(),
    maxParticipants: z.number().optional()
  }).optional()
});

export const joinSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  username: z.string()
});

// Token Economy Schemas
export const estimateTokensSchema = z.object({
  model: z.string(),
  prompt: z.string(),
  maxTokens: z.number().optional()
});

export const recordUsageSchema = z.object({
  ownerId: z.string(),
  ownerType: z.enum(['user', 'workspace']),
  tokens: z.number(),
  agent: z.string().optional(),
  feature: z.string().optional(),
  workflowId: z.string().optional(),
  workflowType: z.string().optional()
});

export const topupSchema = z.object({
  ownerId: z.string(),
  ownerType: z.enum(['user', 'workspace']),
  tokenAmount: z.number().positive(),
  paymentMethodId: z.string().optional()
});

export const creditTokensSchema = z.object({
  ownerId: z.string(),
  ownerType: z.enum(['user', 'workspace']),
  tokens: z.number().positive(),
  reason: z.string(),
  adminId: z.string()
});

// RBAC Schemas
export const permissionCheckSchema = z.object({
  userId: z.string(),
  resource: z.string(),
  action: z.enum(['create', 'read', 'update', 'delete']),
  resourceId: z.string().optional()
});

export const auditFiltersSchema = z.object({
  userId: z.string().optional(),
  resource: z.string().optional(),
  action: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional()
});

// Store Schemas
export const appStoreConfigSchema = z.object({
  platform: z.enum(['ios', 'android']),
  bundleId: z.string(),
  appName: z.string(),
  version: z.string(),
  buildNumber: z.string(),
  autoSubmit: z.boolean().optional()
});

// Export Schemas
export const platformConfigSchema = z.object({
  platform: z.enum(['ios', 'android', 'web', 'desktop']),
  format: z.enum(['apk', 'aab', 'ipa', 'zip', 'dmg']),
  config: z.record(z.any()).optional()
});

export const exportRequestSchema = z.object({
  projectId: z.string(),
  platforms: z.array(z.enum(['ios', 'android', 'web', 'desktop'])),
  includeSource: z.boolean().optional(),
  includeAssets: z.boolean().optional()
});

// Learning Schemas
export const usagePatternSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  timestamp: z.string().transform(val => new Date(val)), // Transform string to Date
  feature: z.string(),
  action: z.string(),
  metadata: z.record(z.any()),
  outcome: z.enum(['success', 'error', 'partial']),
  duration: z.number(),
  tokensUsed: z.number()
});

export const modelPerformanceSchema = z.object({
  model: z.string(),
  taskType: z.string(),
  successRate: z.number(),
  averageTokens: z.number(),
  averageLatency: z.number(),
  errorRate: z.number(),
  userSatisfaction: z.number(),
  sampleSize: z.number()
});

// Supabase Schemas
export const supabaseConfigSchema = z.object({
  projectUrl: z.string().url(),
  anonKey: z.string(),
  serviceRoleKey: z.string().optional(),
  databaseUrl: z.string().optional()
});

// TCI Enterprise Schemas
export const ingestEnvelopeSchema = z.object({
  envelopeId: z.string(),
  actor: z.string(),
  intent: z.object({
    text: z.string(),
    category: z.string().optional()
  }),
  outputs: z.object({
    explanation: z.string().optional()
  }).optional()
});

export const simulationRequestSchema = z.object({
  scenario: z.string(),
  parameters: z.record(z.any()),
  duration: z.number().optional()
});

export const predictionRequestSchema = z.object({
  context: z.string(),
  horizon: z.number(),
  confidence: z.number().optional()
});

export const governancePolicySchema = z.object({
  policyType: z.enum(['data', 'access', 'usage', 'retention']),
  rules: z.array(z.object({
    condition: z.string(),
    action: z.string(),
    severity: z.enum(['low', 'medium', 'high'])
  }))
});

export const complianceReportSchema = z.object({
  reportType: z.enum(['audit', 'assessment', 'monitoring']),
  scope: z.string(),
  findings: z.array(z.object({
    category: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    description: z.string(),
    remediation: z.string().optional()
  }))
});

// Export all schemas
export default {
  // User and Authentication
  createUserSchema,
  loginSchema,

  // Collaboration
  createSessionRequestSchema,
  joinSessionSchema,

  // Token Economy
  estimateTokensSchema,
  recordUsageSchema,
  topupSchema,
  creditTokensSchema,

  // RBAC
  permissionCheckSchema,
  auditFiltersSchema,

  // Store
  appStoreConfigSchema,

  // Export
  platformConfigSchema,
  exportRequestSchema,

  // Learning
  usagePatternSchema,
  modelPerformanceSchema,

  // Supabase
  supabaseConfigSchema,

  // TCI Enterprise
  ingestEnvelopeSchema,
  simulationRequestSchema,
  predictionRequestSchema,
  governancePolicySchema,
  complianceReportSchema
};
