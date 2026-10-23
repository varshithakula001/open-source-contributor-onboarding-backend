import { z } from 'zod';

/**
 * Document item schema within a snapshot import payload.
 * SECURITY: All document content is treated strictly as UNTRUSTED third-party text.
 */
export const importDocumentItemSchema = z
  .object({
    filePath: z
      .string()
      .trim()
      .min(1, 'File path is required')
      .max(500, 'File path cannot exceed 500 characters'),

    title: z
      .string()
      .trim()
      .min(1, 'Document title is required')
      .max(200, 'Document title cannot exceed 200 characters'),

    content: z
      .string()
      .min(1, 'Document content cannot be empty')
      .max(500000, 'Individual document content cannot exceed 500KB'),

    docType: z
      .enum(['guide', 'setup', 'architecture', 'readme', 'other'])
      .optional()
      .default('other'),

    visibility: z
      .enum(['public', 'private'])
      .optional()
      .default('public'),
  })
  .strict();

/**
 * Issue item schema within a snapshot import payload.
 */
export const importIssueItemSchema = z
  .object({
    issueNumber: z
      .number()
      .int('Issue number must be an integer')
      .positive('Issue number must be a positive integer'),

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
 * Snapshot Import Schema
 * Applied to POST /api/projects/:id/imports
 * Enforces bounded limits on document counts, issue counts, and uniqueness.
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

    documents: z
      .array(importDocumentItemSchema)
      .max(50, 'Cannot import more than 50 documents in a single snapshot')
      .optional()
      .default([]),

    issues: z
      .array(importIssueItemSchema)
      .max(100, 'Cannot import more than 100 curated issues in a single snapshot')
      .optional()
      .default([]),
  })
  .strict()
  .refine(
    (data) => {
      if (!data.documents || data.documents.length <= 1) return true;
      const paths = new Set();
      for (const doc of data.documents) {
        const normalized = doc.filePath.toLowerCase();
        if (paths.has(normalized)) return false;
        paths.add(normalized);
      }
      return true;
    },
    {
      message: 'Duplicate document file paths detected within the import payload.',
      path: ['documents'],
    }
  )
  .refine(
    (data) => {
      if (!data.issues || data.issues.length <= 1) return true;
      const numbers = new Set();
      for (const iss of data.issues) {
        if (numbers.has(iss.issueNumber)) return false;
        numbers.add(iss.issueNumber);
      }
      return true;
    },
    {
      message: 'Duplicate issue numbers detected within the import payload.',
      path: ['issues'],
    }
  );
