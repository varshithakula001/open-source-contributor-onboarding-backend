import express from 'express';
import * as issueController from '../controllers/issue.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { requireDatabase } from '../config/session.js';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import { validateBody, validateParams } from '../middlewares/validate.middleware.js';
import { idParamSchema } from '../schemas/common.js';
import { submitInterestSchema } from '../schemas/interest.schema.js';
import { updateIssueSchema } from '../schemas/issue.schema.js';

const router = express.Router();

/**
 * POST /api/issues/:id/interest
 * Contributor expression of interest in an open issue
 */
router.post(
  '/:id/interest',
  requireDatabase,
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('contributor'),
  validateParams(idParamSchema),
  validateBody(submitInterestSchema),
  issueController.expressInterest
);

/**
 * PATCH /api/issues/:id
 * Maintainer issue curation and status updates
 */
router.patch(
  '/:id',
  requireDatabase,
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('maintainer', 'moderator'),
  validateParams(idParamSchema),
  validateBody(updateIssueSchema),
  issueController.updateIssue
);

export default router;
