import express from 'express';
import * as planController from '../controllers/plan.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { requireDatabase } from '../config/session.js';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import { validateBody, validateParams } from '../middlewares/validate.middleware.js';
import { idParamSchema } from '../schemas/common.js';
import { createContributionPlanSchema } from '../schemas/plan.schema.js';
import { createReviewSchema } from '../schemas/review.schema.js';

const router = express.Router();

/**
 * POST /api/contribution-plans
 * Contributor contribution plan submission
 */
router.post(
  '/',
  requireDatabase,
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('contributor'),
  validateBody(createContributionPlanSchema),
  planController.submitPlan
);

/**
 * GET /api/contribution-plans/:id
 * Authorized plan retrieval (Author or Project Maintainer)
 */
router.get(
  '/:id',
  requireDatabase,
  requireAuth,
  validateParams(idParamSchema),
  planController.getPlan
);

/**
 * POST /api/contribution-plans/:id/review
 * Maintainer review and status transition
 */
router.post(
  '/:id/review',
  requireDatabase,
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('maintainer', 'moderator'),
  validateParams(idParamSchema),
  validateBody(createReviewSchema),
  planController.reviewPlan
);

export default router;
