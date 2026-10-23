import { z } from 'zod';

/**
 * Contribution Plan Review Schema
 * Applied to POST /api/contribution-plans/:id/review
 * Only verified maintainers of the target project may invoke this.
 */
export const createReviewSchema = z
  .object({
    decision: z.enum(['approved', 'request_changes', 'rejected'], {
      errorMap: () => ({ message: 'Decision must be one of: approved, request_changes, rejected' }),
    }),

    feedback: z
      .string()
      .trim()
      .min(10, 'Review feedback must be at least 10 characters long')
      .max(5000, 'Review feedback cannot exceed 5000 characters'),
  })
  .strict();
