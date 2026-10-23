import { z } from 'zod';
import { objectIdSchema } from './common.js';

/**
 * Issue Creation Schema
 */
export const createIssueSchema = z
  .object({
    issueNumber: z
      .number()
      .int('Issue number must be an integer')
      .positive('Issue number must be positive'),

    title: z
      .string()
      .trim()
      .min(3, 'Issue title must be at least 3 characters long')
      .max(200, 'Issue title cannot exceed 200 characters'),

    description: z
      .string()
      .trim()
      .min(10, 'Issue description must be at least 10 characters long'),

    requiredSkills: z
      .array(z.string().trim().toLowerCase())
      .optional()
      .default([]),

    prerequisites: z
      .array(z.string().trim())
      .optional()
      .default([]),

    setupSteps: z
      .array(z.string().trim())
      .optional()
      .default([]),

    contributionRequirements: z
      .string()
      .trim()
      .optional(),

    labels: z
      .array(z.string().trim().toLowerCase())
      .optional()
      .default([]),

    estimatedEffort: z
      .enum(['hours', 'weekend', 'few_days', 'week_plus'])
      .optional()
      .default('weekend'),
  })
  .strict();

/**
 * Issue Update Schema
 * Applied to PATCH /api/issues/:id
 */
export const updateIssueSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Issue title must be at least 3 characters long')
      .max(200, 'Issue title cannot exceed 200 characters')
      .optional(),

    description: z
      .string()
      .trim()
      .min(10, 'Issue description must be at least 10 characters long')
      .optional(),

    status: z
      .enum(['open', 'taken', 'closed'])
      .optional(),

    requiredSkills: z
      .array(z.string().trim().toLowerCase())
      .optional(),

    prerequisites: z
      .array(z.string().trim())
      .optional(),

    setupSteps: z
      .array(z.string().trim())
      .optional(),

    contributionRequirements: z
      .string()
      .trim()
      .optional(),

    labels: z
      .array(z.string().trim().toLowerCase())
      .optional(),

    estimatedEffort: z
      .enum(['hours', 'weekend', 'few_days', 'week_plus'])
      .optional(),

    isStaleSetup: z
      .boolean()
      .optional(),

    staleSetupNotes: z
      .string()
      .trim()
      .max(1000, 'Notes cannot exceed 1000 characters')
      .optional(),

    assignedContributorId: objectIdSchema
      .nullable()
      .optional(),
  })
  .strict();

/**
 * Public Project Issues Browser Query Schema
 * Validates query parameters for GET /api/projects/:id/issues
 */
export const projectIssuesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
    limit: z.coerce.number().int().min(1).max(50, 'Limit cannot exceed 50 items per page').optional().default(10),
    skill: z.string().trim().toLowerCase().max(50, 'Skill filter cannot exceed 50 characters').optional(),
    effort: z.enum(['hours', 'weekend', 'few_days', 'week_plus']).optional(),
  })
  .strict();
