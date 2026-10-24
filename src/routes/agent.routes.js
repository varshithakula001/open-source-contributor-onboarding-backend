import express from 'express';
import * as agentController from '../controllers/agent.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { requireDatabase } from '../config/session.js';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import { agentRateLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { onboardingAgentSchema } from '../schemas/agent.schema.js';

const router = express.Router();

/**
 * POST /api/onboarding-agent
 * Executes the AI-Powered Onboarding Agent with bounded tools (findIssues, inspectPrerequisites, checkIssueAvailability).
 */
router.post(
  '/',
  requireDatabase,
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('contributor', 'maintainer', 'moderator'),
  agentRateLimiter,
  validateBody(onboardingAgentSchema),
  agentController.handleOnboardingAgent
);

export default router;
