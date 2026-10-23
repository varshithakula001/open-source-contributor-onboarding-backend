import { Router } from 'express';
import { getDatabaseStatus } from '../config/db.js';
import { env } from '../config/env.js';

const router = Router();

/**
 * GET /api/health
 * Public health check endpoint reporting server and database readiness.
 */
router.get('/health', (req, res) => {
  const dbStatus = getDatabaseStatus();

  // In development and test mode, the application health endpoint returns 200 (healthy)
  // while accurately reporting the real database connection state (connected, disconnected, or unconfigured).
  // In production mode, an unavailable/disconnected database returns 503 (degraded).
  const isHealthy = env.NODE_ENV === 'production' ? dbStatus.status === 'connected' : true;

  res.status(isHealthy ? 200 : 503).json({
    success: true,
    data: {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      uptimeSeconds: Math.floor(process.uptime()),
      services: {
        database: {
          status: dbStatus.status,
          connected: dbStatus.connected,
          ...(dbStatus.message ? { message: dbStatus.message } : {}),
        },
      },
    },
  });
});

export default router;
