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
