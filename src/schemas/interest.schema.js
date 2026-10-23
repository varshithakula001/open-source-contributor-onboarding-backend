import { z } from 'zod';

/**
 * Issue Interest Submission Schema
 * Applied to POST /api/issues/:id/interest
 * Note: contributorId is derived from the authenticated session, issueId from URL params.
 */
export const submitInterestSchema = z
  .object({
    declaredAvailableHours: z
      .number()
      .min(1, 'Must declare at least 1 available hour')
      .max(168, 'Available hours cannot exceed 168 hours per week'),

    message: z
      .string()
      .trim()
      .max(1000, 'Message cannot exceed 1000 characters')
      .optional()
      .default(''),

    contributorId: z
      .string()
      .optional(), // Safely ignored: contributorId is always derived from authenticated session
  });
