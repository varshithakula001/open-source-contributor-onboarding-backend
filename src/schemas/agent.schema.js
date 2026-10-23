import { z } from 'zod';
import { objectIdSchema } from './common.js';

/**
 * Onboarding Agent Request Schema
 * Applied to POST /api/onboarding-agent
 */
export const onboardingAgentSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(3, 'Agent query must be at least 3 characters long')
      .max(1000, 'Query cannot exceed 1000 characters'),

    projectId: objectIdSchema.optional(),

    declaredSkills: z
      .array(z.string().trim().toLowerCase())
      .optional()
      .default([]),

    availableHours: z
      .number()
      .min(1, 'Available hours must be at least 1')
      .max(168, 'Available hours cannot exceed 168')
      .optional()
      .default(10),
  })
  .strict();
