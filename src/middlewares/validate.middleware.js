import { formatZodErrors } from '../schemas/common.js';

/**
 * Reusable Express middleware to validate request body using a Zod schema.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request payload validation failed.',
          details: formatZodErrors(result.error),
        },
      });
    }

    req.body = result.data;
    next();
  };
}
