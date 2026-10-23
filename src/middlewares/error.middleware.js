import { env } from '../config/env.js';

/**
 * 404 Not Found Middleware
 * Intercepts requests to undefined routes and returns a consistent JSON response.
 */
export function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint '${req.method} ${req.originalUrl}' does not exist on this server.`,
    },
  });
}

/**
 * Centralized Error Handling Middleware
 * Ensures safe, predictable error responses without leaking sensitive system information.
 */
export function errorHandler(err, req, res, next) {
  // Determine appropriate HTTP status code
  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected internal error occurred.';

  // Handle standard JSON syntax error from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    errorCode = 'INVALID_JSON_BODY';
    message = 'Malformed JSON payload in request body.';
  }

  // Handle CSRF token validation failure from csrf-sync
  if (err.code === 'EBADCSRFTOKEN' || err.message === 'invalid csrf token') {
    statusCode = 403;
    errorCode = 'CSRF_INVALID';
    message = 'Invalid or missing CSRF token. Please supply a valid X-CSRF-Token header.';
  }

  // Handle CORS origin errors
  if (err.message && err.message.includes('Not allowed by CORS')) {
    statusCode = 403;
    errorCode = 'CORS_FORBIDDEN';
  }

  const response = {
    success: false,
    error: {
      code: errorCode,
      message,
    },
  };

  // Include sanitized debug information only in non-production environments when not a 500
  if (env.NODE_ENV === 'development' && statusCode !== 500 && err.details) {
    response.error.details = err.details;
  }

  // Log 500 errors to server logs for debugging, but never expose stack trace to client
  if (statusCode >= 500) {
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json(response);
}
