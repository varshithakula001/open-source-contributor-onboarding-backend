import express from 'express';
import * as chatController from '../controllers/chat.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { requireDatabase } from '../config/session.js';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import { chatRateLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { contributorChatSchema } from '../schemas/chat.schema.js';

const router = express.Router();

/**
 * POST /api/contributor-chat
 * Answers contributor questions grounded in repository documentation using Atlas Vector Search and Ollama.
 */
router.post(
  '/',
  requireDatabase,
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('contributor', 'maintainer', 'moderator'),
  chatRateLimiter,
  validateBody(contributorChatSchema),
  chatController.handleContributorChat
);

export default router;
