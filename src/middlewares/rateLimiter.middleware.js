import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Standard factory to construct JSON error responses for rate-limited requests.
 */
function createRateLimiter(options = {}) {
  const { _enableInTest = false, ...rateLimitOptions } = options;

  return rateLimit({
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false,  // Disable `X-RateLimit-*` headers
    handler: (req, res, next, opts) => {
      res.status(opts.statusCode).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: opts.message || 'Too many requests. Please try again later.',
        },
      });
    },
    // In test environment, skip limiting unless specifically testing rate limiter behavior
    skip: () => env.NODE_ENV === 'test' && !_enableInTest,
    ...rateLimitOptions,
  });
}

/**
 * Strict rate limiter for login attempts: 5 attempts per 15 minutes
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again after 15 minutes.',
});

/**
 * Rate limiter for account registration: 5 signups per hour per IP
 */
export const signupRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many accounts registered from this IP address. Please try again later.',
});

/**
 * Rate limiter for password reset requests: 3 attempts per 15 minutes per IP
 */
export const forgotPasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: 'Too many password recovery requests. Please try again after 15 minutes.',
});

/**
 * Rate limiter for email verification: 10 attempts per 15 minutes per IP
 */
export const verifyEmailRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many verification attempts. Please try again after 15 minutes.',
});

/**
 * Rate limiter for password reset execution: 5 attempts per 15 minutes per IP
 */
export const resetPasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset attempts. Please try again after 15 minutes.',
});

/**
 * Rate limiter for contributor documentation RAG questions: 30 requests per 15 minutes
 */
export const chatRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many documentation questions submitted. Please wait a few minutes before asking again.',
});

/**
 * Rate limiter for AI Onboarding Agent requests: 20 requests per 15 minutes
 */
export const agentRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many onboarding agent requests submitted. Please wait a few minutes before trying again.',
});

export { createRateLimiter };
