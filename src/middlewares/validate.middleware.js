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

/**
 * Reusable Express middleware to validate URL route parameters using a Zod schema.
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: 'URL parameter validation failed.',
          details: formatZodErrors(result.error),
        },
      });
    }

    req.params = result.data;
    next();
  };
}

/**
 * Reusable Express middleware to validate query parameters using a Zod schema.
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUERY',
          message: 'Query parameter validation failed.',
          details: formatZodErrors(result.error),
        },
      });
    }

    req.query = result.data;
    next();
  };
}
