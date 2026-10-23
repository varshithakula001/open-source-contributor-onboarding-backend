import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { getSessionMiddleware } from './config/session.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/project.routes.js';
import issueRoutes from './routes/issue.routes.js';
import planRoutes from './routes/plan.routes.js';
import chatRoutes from './routes/chat.routes.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';

const app = express();

// Security headers
app.use(helmet());

// Cross-Origin Resource Sharing (CORS) restricted to explicit allowed origin
const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser agents (e.g., curl, supertest, server-to-server) or matched frontend origin
    if (!origin || origin === env.CLIENT_ORIGIN) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
};
app.use(cors(corsOptions));

// Bounded JSON parser for snapshot repository imports (up to 2MB)
app.use('/api/projects/:id/imports', express.json({ limit: '2mb' }));

// Restrictive default 10kb JSON body parser for general API requests to prevent payload flooding
app.use(express.json({ limit: '10kb' }));

// Mount public health check BEFORE session middleware so /api/health is completely independent
// of session store operations, cookies, and CSRF requirements
app.use('/api', healthRoutes);

// Persistent server-side session middleware
app.use(getSessionMiddleware());

// Mount authentication and session management routes
app.use('/api/auth', authRoutes);

// Mount Phase 4 Core Business API routes
app.use('/api/projects', projectRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/contribution-plans', planRoutes);

// Mount Phase 5 Contributor Documentation Q&A RAG route
app.use('/api/contributor-chat', chatRoutes);

// Isolated testing helper route: strictly enabled only in test environment
if (env.NODE_ENV === 'test') {
  app.post('/api/test-session', (req, res) => {
    req.session.userId = req.body.userId;
    req.session.sessionVersion = req.body.sessionVersion || 1;
    res.json({ success: true, userId: req.session.userId });
  });
}

// Catch undefined routes (404)
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

export default app;
