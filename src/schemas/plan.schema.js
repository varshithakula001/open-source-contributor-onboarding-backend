import { z } from 'zod';
import { objectIdSchema } from './common.js';

const implementationStepSchema = z.object({
  stepNumber: z.number().int().min(1, 'Step number must be >= 1'),
  description: z.string().trim().min(5, 'Step description must be at least 5 characters long'),
  targetFiles: z.array(z.string().trim()).optional().default([]),
});

const supportingEvidenceSchema = z.object({
  snapshotVersion: z.string().trim().min(1, 'Snapshot version is required'),
  filePath: z.string().trim().min(1, 'File path citation is required'),
  chunkId: objectIdSchema.optional(),
  quoteOrExplanation: z.string().trim().optional(),
});

/**
 * Contribution Plan Creation Schema
 * Applied to POST /api/contribution-plans
 * Note: contributorId is derived securely from the authenticated session.
 */
export const createContributionPlanSchema = z
  .object({
    projectId: objectIdSchema,
    issueId: objectIdSchema,
    snapshotId: objectIdSchema,

    planObjective: z
      .string()
      .trim()
      .min(10, 'Plan objective must be at least 10 characters long')
      .max(500, 'Plan objective cannot exceed 500 characters'),

    proposedApproach: z
      .string()
      .trim()
      .min(20, 'Proposed approach must be at least 20 characters long'),

    orderedImplementationSteps: z
      .array(implementationStepSchema)
      .min(1, 'Plan must contain at least 1 implementation step'),

    supportingEvidence: z
      .array(supportingEvidenceSchema)
      .optional()
      .default([]),

    prerequisitesChecked: z
      .boolean()
      .optional()
      .default(false),
  })
  .strict();

/**
 * Contribution Plan Update Schema
 * Contributors can update drafts or submit their plan for review.
 * SECURITY: Contributors CANNOT self-approve plans.
 */
export const updateContributionPlanSchema = z
  .object({
    planObjective: z
      .string()
      .trim()
      .min(10, 'Plan objective must be at least 10 characters long')
      .max(500, 'Plan objective cannot exceed 500 characters')
      .optional(),

    proposedApproach: z
      .string()
      .trim()
      .min(20, 'Proposed approach must be at least 20 characters long')
      .optional(),

    orderedImplementationSteps: z
      .array(implementationStepSchema)
      .min(1, 'Plan must contain at least 1 implementation step')
      .optional(),

    supportingEvidence: z
      .array(supportingEvidenceSchema)
      .optional(),

    status: z
      .enum(['draft', 'submitted'], {
        errorMap: () => ({ message: 'Contributors may only transition status to "draft" or "submitted"' }),
      })
      .optional(),

    prerequisitesChecked: z
      .boolean()
      .optional(),
  })
  .strict();

/**
 * Maintainer Review Inbox Query Schema
 * Validates query parameters for GET /api/projects/:id/contribution-plans
 */
export const reviewInboxQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
    limit: z.coerce.number().int().min(1).max(50, 'Limit cannot exceed 50 items per page').optional().default(10),
    status: z
      .enum(['draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected'])
      .optional()
      .default('submitted'),
  })
  .strict();
