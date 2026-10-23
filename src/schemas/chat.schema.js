import { z } from 'zod';
import { objectIdSchema } from './common.js';

/**
 * Contributor RAG Chat Request Schema
 * Applied to POST /api/contributor-chat
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
      .max(2000, 'Message cannot exceed 2000 characters'),
  })
  .strict();
