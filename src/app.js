import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { getSessionMiddleware } from './config/session.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
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

// JSON request body parser with 10kb limit to prevent payload flooding
app.use(express.json({ limit: '10kb' }));

// Persistent server-side session middleware
app.use(getSessionMiddleware());

// Mount API routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);

// Catch undefined routes (404)
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

export default app;
