import { z } from 'zod';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Project Creation Schema
 * Validates request payload to register a new project.
 * Note: ownerId is derived securely from the authenticated session, not from this client payload.
 */
export const createProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Project name must be at least 2 characters long')
      .max(100, 'Project name cannot exceed 100 characters'),

    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(slugRegex, 'Project slug must be URL-safe (lowercase letters, numbers, and hyphens)')
      .optional(),

    description: z
      .string()
      .trim()
      .min(10, 'Description must be at least 10 characters long')
      .max(2000, 'Description cannot exceed 2000 characters'),

    repositoryUrl: z
      .string()
      .trim()
      .url('Must be a valid repository URL (e.g., https://github.com/org/repo)'),

    visibility: z
      .enum(['public', 'private'])
      .optional()
      .default('public'),

    topics: z
      .array(z.string().trim().toLowerCase())
      .optional()
      .default([]),

    languages: z
      .array(z.string().trim().toLowerCase())
      .optional()
      .default([]),
  })
  .strict();

/**
 * Project Update Schema
 */
export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Project name must be at least 2 characters long')
      .max(100, 'Project name cannot exceed 100 characters')
      .optional(),

    description: z
      .string()
      .trim()
      .min(10, 'Description must be at least 10 characters long')
      .max(2000, 'Description cannot exceed 2000 characters')
      .optional(),

    repositoryUrl: z
      .string()
      .trim()
      .url('Must be a valid repository URL')
      .optional(),

    visibility: z
      .enum(['public', 'private'])
      .optional(),

    topics: z
      .array(z.string().trim().toLowerCase())
      .optional(),

    languages: z
      .array(z.string().trim().toLowerCase())
      .optional(),
  })
  .strict();

/**
 * Moderator Project Verification Schema
 * Applied to PATCH /api/projects/:id/verification
 */
export const verifyProjectSchema = z
  .object({
    verificationStatus: z.enum(['approved', 'rejected'], {
      errorMap: () => ({ message: 'verificationStatus must be either "approved" or "rejected"' }),
    }),

    rejectionReason: z
      .string()
      .trim()
      .max(1000, 'Rejection reason cannot exceed 1000 characters')
      .optional(),
  })
  .strict()
  .refine(
    (data) => data.verificationStatus !== 'rejected' || (data.rejectionReason && data.rejectionReason.length >= 5),
    {
      message: 'A rejection reason of at least 5 characters is required when rejecting a project.',
      path: ['rejectionReason'],
    }
  );

/**
 * Public Project Discovery Query Schema
 * Validates query parameters for GET /api/projects
 */
export const projectDiscoveryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
    limit: z.coerce.number().int().min(1).max(50, 'Limit cannot exceed 50 items per page').optional().default(10),
    search: z.string().trim().max(100, 'Search query cannot exceed 100 characters').optional(),
    topic: z.string().trim().toLowerCase().max(50, 'Topic filter cannot exceed 50 characters').optional(),
    language: z.string().trim().toLowerCase().max(50, 'Language filter cannot exceed 50 characters').optional(),
  })
  .strict();
