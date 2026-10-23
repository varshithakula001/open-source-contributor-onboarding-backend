import mongoose from 'mongoose';
import { env } from './env.js';

const READY_STATE_MAP = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * Inspects and returns current Mongoose connection status.
 * Accurately indicates whether MongoDB Atlas is connected, disconnected, or unconfigured.
 */
export function getDatabaseStatus() {
  if (!env.MONGODB_URI) {
    return {
      status: 'unconfigured',
      connected: false,
      message: 'MONGODB_URI is not set. Database-backed features are unavailable.',
    };
  }

  const readyState = mongoose.connection.readyState;
  const statusName = READY_STATE_MAP[readyState] || 'unknown';

  return {
    status: statusName,
    connected: readyState === 1,
    readyState,
  };
}

/**
 * Connects to MongoDB Atlas using Mongoose.
 * Reusable, prevents duplicate connections, and handles errors cleanly.
 */
export async function connectDB() {
  if (!env.MONGODB_URI) {
    if (env.NODE_ENV === 'production') {
      throw new Error('Cannot start in production without a valid MONGODB_URI.');
    }
    console.warn('⚠️ MONGODB_URI is not configured. Running in development mode without active database connection.');
    return null;
  }

  // Avoid creating duplicate connections if already connected or connecting
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2) {
    console.log('🔄 MongoDB connection in progress, awaiting resolution...');
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      autoIndex: env.NODE_ENV !== 'production',
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅ MongoDB Atlas connected: ${conn.connection.host}`);
    return conn.connection;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    if (env.NODE_ENV === 'production') {
      process.exit(1);
    }
    // In development mode, log the failure and allow server to operate with 'disconnected' status
    return null;
  }
}

/**
 * Gracefully disconnects Mongoose on application shutdown.
 */
export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      console.log('🔌 MongoDB connection closed gracefully.');
    } catch (err) {
      console.error(`❌ Error during MongoDB disconnection: ${err.message}`);
    }
  }
}
