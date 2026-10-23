import express from 'express';
import * as projectController from '../controllers/project.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole, requireProjectMaintainer } from '../middlewares/rbac.middleware.js';
import { requireDatabase } from '../config/session.js';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.middleware.js';
import { idParamSchema } from '../schemas/common.js';
import { projectDiscoveryQuerySchema, verifyProjectSchema } from '../schemas/project.schema.js';
import { projectIssuesQuerySchema } from '../schemas/issue.schema.js';
import { reviewInboxQuerySchema } from '../schemas/plan.schema.js';
import { importSnapshotSchema } from '../schemas/snapshot.schema.js';

const router = express.Router();

/**
 * GET /api/projects
 * Public project discovery
 * Returns approved, public projects with pagination and filtering.
 */
router.get(
  '/',
  requireDatabase,
  validateQuery(projectDiscoveryQuerySchema),
  projectController.getProjects
);

/**
 * GET /api/projects/:id/issues
 * Public issue browser for an approved public project
 * Returns only eligible open issues.
 */
router.get(
  '/:id/issues',
  requireDatabase,
  validateParams(idParamSchema),
  validateQuery(projectIssuesQuerySchema),
  projectController.getProjectIssues
);

/**
 * PATCH /api/projects/:id/verification
 * Moderator project verification
 * Approves or rejects a project. Only moderators may perform verification.
 */
router.patch(
  '/:id/verification',
  requireDatabase,
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('moderator'),
  validateParams(idParamSchema),
  validateBody(verifyProjectSchema),
  projectController.verifyProject
);

/**
 * GET /api/projects/:id/contribution-plans
 * Supplementary Maintainer Review Inbox
 * Returns contribution plans awaiting review for an authorized project.
 */
router.get(
  '/:id/contribution-plans',
  requireDatabase,
  requireAuth,
  requireRole('maintainer', 'moderator'),
  requireProjectMaintainer((req) => req.params.id),
  validateParams(idParamSchema),
  validateQuery(reviewInboxQuerySchema),
  projectController.getProjectContributionPlans
);

/**
 * POST /api/projects/:id/imports
 * Maintainer repository snapshot import
 * Ingests vetted documentation files and curated issues.
 */
router.post(
  '/:id/imports',
  requireDatabase,
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('maintainer', 'moderator'),
  requireProjectMaintainer((req) => req.params.id),
  validateParams(idParamSchema),
  validateBody(importSnapshotSchema),
  projectController.importSnapshot
);

export default router;
