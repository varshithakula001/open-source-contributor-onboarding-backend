import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { env } from './env.js';

let sessionMiddlewareInstance = null;

/**
 * Creates and returns the express-session middleware.
 * Backed by connect-mongo when MongoDB Atlas is connected.
 */
export function getSessionMiddleware(customStore = null) {
  if (sessionMiddlewareInstance && !customStore) {
    return sessionMiddlewareInstance;
  }

  const isProduction = env.NODE_ENV === 'production';
  let store = customStore;

  // If a custom store wasn't provided and MongoDB URI is available, configure MongoStore
  if (!store && env.MONGODB_URI) {
    store = MongoStore.create({
      clientPromise: mongoose.connection.asPromise().then((conn) => conn.getClient()),
      collectionName: 'sessions',
      ttl: (env.SESSION_MAX_AGE_MS || 604800000) / 1000,
      autoRemove: 'native',
      touchAfter: 24 * 3600, // Lazy session update every 24h unless session data changed
    });
  }

  const sessionConfig = {
    name: 'osco.sid',
    secret: env.SESSION_SECRET || 'development_insecure_secret_only_when_unconfigured_32_chars_min',
    resave: false,
    saveUninitialized: false,
    store: store || undefined,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: env.SESSION_MAX_AGE_MS || 604800000,
    },
  };

  const middleware = session(sessionConfig);

  if (!customStore) {
    sessionMiddlewareInstance = middleware;
  }

  return middleware;
}

/**
 * Middleware ensuring MongoDB is actively connected before processing database-backed auth requests.
 * Fails safely with 503 Service Unavailable when the database is disconnected or unconfigured.
 */
export function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Authentication service is unavailable because MongoDB Atlas is not connected.',
      },
    });
  }
  next();
}
