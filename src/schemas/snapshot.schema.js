import { z } from 'zod';

/**
 * Snapshot Import Schema
 * Applied to POST /api/projects/:id/imports
 */
export const importSnapshotSchema = z
  .object({
    version: z
      .string()
      .trim()
      .min(1, 'Snapshot version is required (e.g., v1.0.0)')
      .max(50, 'Version string cannot exceed 50 characters'),

    importSource: z
      .string()
      .trim()
      .min(1, 'Import source is required')
      .max(200, 'Import source cannot exceed 200 characters'),

    contentDigest: z
      .string()
      .trim()
      .optional(),
  })
  .strict();
