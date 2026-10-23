import { z } from 'zod';

/**
 * 24-character hex MongoDB ObjectId schema validator
 */
export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId string format (must be 24 hex characters)');

/**
 * Normalizes and formats Zod validation errors into a clean array of field error messages.
 */
export function formatZodErrors(error) {
  if (!(error instanceof z.ZodError)) {
    return [{ path: 'unknown', message: error.message || 'Validation error' }];
  }

  return error.errors.map((err) => ({
    field: err.path.join('.') || 'root',
    message: err.message,
    code: err.code,
  }));
}
