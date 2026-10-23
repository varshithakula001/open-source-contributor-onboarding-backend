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

  // If DB is connected or unconfigured in dev/test, the server is healthy/operational.
  // If DB was configured with MONGODB_URI but connection is failed/disconnected, status is degraded.
  const isHealthy = dbStatus.status === 'connected' || (env.NODE_ENV !== 'production' && dbStatus.status === 'unconfigured');

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
