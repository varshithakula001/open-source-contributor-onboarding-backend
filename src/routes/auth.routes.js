import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { requireDatabase } from '../config/session.js';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import {
  signupRateLimiter,
  loginRateLimiter,
  verifyEmailRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
} from '../middlewares/rateLimiter.middleware.js';
import {
  userSignupSchema,
  userLoginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/auth.schema.js';

const router = Router();

// 1. Public CSRF Token generation endpoint (GET /api/auth/csrf)
router.get('/csrf', authController.csrf);

// 2. Authentication endpoints requiring database connection and CSRF protection
router.post(
  '/signup',
  requireDatabase,
  signupRateLimiter,
  csrfSynchronisedProtection,
  validateBody(userSignupSchema),
  authController.signup
);

router.post(
  '/verify-email',
  requireDatabase,
  verifyEmailRateLimiter,
  csrfSynchronisedProtection,
  validateBody(verifyEmailSchema),
  authController.verifyEmail
);

router.post(
  '/login',
  requireDatabase,
  loginRateLimiter,
  csrfSynchronisedProtection,
  validateBody(userLoginSchema),
  authController.login
);

router.post(
  '/logout',
  csrfSynchronisedProtection,
  authController.logout
);

router.post(
  '/forgot-password',
  requireDatabase,
  forgotPasswordRateLimiter,
  csrfSynchronisedProtection,
  validateBody(forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  requireDatabase,
  resetPasswordRateLimiter,
  csrfSynchronisedProtection,
  validateBody(resetPasswordSchema),
  authController.resetPassword
);

// 3. Authenticated user profile (GET /api/auth/me)
router.get(
  '/me',
  requireDatabase,
  requireAuth,
  authController.me
);

export default router;
