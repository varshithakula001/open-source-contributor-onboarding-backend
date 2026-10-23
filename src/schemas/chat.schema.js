import { z } from 'zod';
import { objectIdSchema } from './common.js';

/**
 * Contributor RAG Chat Request Schema
 * Applied to POST /api/contributor-chat
 * Supports either 'message' or 'query' as the input prompt.
 */
export const contributorChatSchema = z
  .object({
    projectId: objectIdSchema,

    snapshotVersion: z
      .string()
      .trim()
      .max(50, 'Snapshot version cannot exceed 50 characters')
      .optional(),

    message: z
      .string()
      .trim()
      .min(2, 'Message must be at least 2 characters long')
      .max(2000, 'Message cannot exceed 2000 characters')
      .optional(),

    query: z
      .string()
      .trim()
      .min(2, 'Query must be at least 2 characters long')
      .max(2000, 'Query cannot exceed 2000 characters')
      .optional(),
  })
  .strict()
  .refine(
    (data) => !!(data.message || data.query),
    {
      message: 'Either "message" or "query" must be provided (at least 2 characters long).',
      path: ['message'],
    }
  );
