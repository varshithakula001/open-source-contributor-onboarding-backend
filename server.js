import app from './src/app.js';
import { env } from './src/config/env.js';
import { connectDB, disconnectDB } from './src/config/db.js';
import { initMongoStore } from './src/config/session.js';

let server;

async function startServer() {
  try {
    // Attempt database connection (gracefully continues in dev if unconfigured)
    await connectDB();

    // If database connected successfully, eagerly initialize persistent session store
    initMongoStore();

    server = app.listen(env.PORT, () => {
      console.log(`🚀 Server listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
      console.log(`🩺 Health check available at: http://localhost:${env.PORT}/api/health`);
    });
  } catch (error) {
    console.error(`💥 Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// Graceful shutdown handler
async function handleShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('🔒 HTTP server closed.');
      await disconnectDB();
      console.log('👋 Process exiting cleanly.');
      process.exit(0);
    });

    // Force exit if shutdown hangs beyond 10 seconds
    setTimeout(() => {
      console.error('⚠️ Forcefully terminating process after shutdown timeout.');
      process.exit(1);
    }, 10000).unref();
  } else {
    await disconnectDB();
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception thrown:', error);
  process.exit(1);
});

startServer();
