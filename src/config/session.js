import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { env } from './env.js';

let testStoreInstance = null;
let mongoStoreInstance = null;
let mongoSessionMiddleware = null;
let databaseSimulatedState = null; // null = use mongoose.connection.readyState, boolean = test override

/**
 * Returns an in-memory session store strictly isolated for automated test runs.
 * Never used in development or production.
 */
export function getTestStore() {
  if (!testStoreInstance) {
    testStoreInstance = new session.MemoryStore();
  }
  return testStoreInstance;
}

/**
 * Initializes and caches the MongoStore instance once Mongoose has connected.
 * Ensures connect-mongo receives a valid, connected MongoClient.
 */
export function initMongoStore() {
  if (mongoStoreInstance) {
    return mongoStoreInstance;
  }

  // Only initialize if Mongoose has established an active connection
  if (mongoose.connection.readyState !== 1) {
    return null;
  }

  try {
    const client = mongoose.connection.getClient();
    if (!client) {
      return null;
    }

    mongoStoreInstance = MongoStore.create({
      client,
      collectionName: 'sessions',
      ttl: (env.SESSION_MAX_AGE_MS || 604800000) / 1000,
      autoRemove: 'native',
      touchAfter: 24 * 3600,
    });

    mongoStoreInstance.on('error', (err) => {
      console.error('❌ MongoDB Session Store Error:', err.message);
    });

    console.log('✅ Persistent session store (connect-mongo) initialized with MongoDB Atlas.');
    return mongoStoreInstance;
  } catch (err) {
    console.error('❌ Failed to initialize MongoStore:', err.message);
    return null;
  }
}

/**
 * Creates and returns the express-session middleware.
 * - In test mode (env.NODE_ENV === 'test' or customStore): Uses an isolated test store (MemoryStore).
 * - In development/production: Uses connect-mongo backed by MongoDB Atlas when connected.
 *   If the database is not connected, avoids creating unhandled promises or accessing undefined clients.
 */
export function getSessionMiddleware(customStore = null) {
  // 1. Isolated test environment or explicitly injected custom store
  if (customStore || env.NODE_ENV === 'test') {
    const testStore = customStore || getTestStore();
    return session({
      name: 'osco.sid',
      secret: env.SESSION_SECRET || 'test_session_secret_min_32_characters_long_12345',
      resave: false,
      saveUninitialized: false,
      store: testStore,
      cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: env.SESSION_MAX_AGE_MS || 604800000,
      },
    });
  }

  // 2. Development and Production: Dynamic handler based on real database connection
  return function sessionHandler(req, res, next) {
    if (mongoose.connection.readyState === 1) {
      const store = initMongoStore();
      if (store) {
        if (!mongoSessionMiddleware) {
          mongoSessionMiddleware = session({
            name: 'osco.sid',
            secret: env.SESSION_SECRET || 'development_insecure_secret_only_when_unconfigured_32_chars_min',
            resave: false,
            saveUninitialized: false,
            store,
            cookie: {
              httpOnly: true,
              secure: env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: env.SESSION_MAX_AGE_MS || 604800000,
            },
          });
        }
        return mongoSessionMiddleware(req, res, next);
      }
    }

    // When MongoDB is disconnected or unconfigured in dev/production:
    // Do NOT fall back to in-memory sessions.
    // Database-backed auth routes will be intercepted by requireDatabase and return 503.
    next();
  };
}

/**
 * Allows automated tests to simulate connected or disconnected database states
 * independently of local .env configuration.
 */
export function setSimulatedDatabaseConnected(state) {
  databaseSimulatedState = state;
}

/**
 * Returns true if the database is actively connected (or simulated connected in tests).
 */
export function isDatabaseConnected() {
  if (databaseSimulatedState !== null) {
    return databaseSimulatedState;
  }
  return mongoose.connection.readyState === 1;
}

/**
 * Middleware ensuring MongoDB is actively connected before processing database-backed auth requests.
 * Fails safely with 503 Service Unavailable when the database is disconnected or unconfigured.
 */
export function requireDatabase(req, res, next) {
  if (!isDatabaseConnected()) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database service is unavailable because MongoDB Atlas is not connected.',
      },
    });
  }
  next();
}
