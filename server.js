const http = require('http');
const app = require('./src/app');
const config = require('./src/config/env');
const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const { initSocket } = require('./src/sockets/socketManager');
const AuthService = require('./src/services/authService');
const TimerService = require('./src/services/timerService');
const logger = require('./src/utils/logger');

const server = http.createServer(app);

// Initialize Socket.IO
const io = initSocket(server);

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Auto-seed default Super Admin
    await AuthService.seedInitialSuperAdmin();

    // Recover active timers after server restart (recalculates timestamps and processes expired stages)
    await TimerService.recoverActiveTimers();

    // Start live match timer engine ticker
    TimerService.startTicker(config.timerTickIntervalMs);

    // Listen on port
    server.listen(config.port, () => {
      logger.success(`🚀 Football Portal Server is running on http://localhost:${config.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Socket.IO live updates enabled`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.warn(`Received ${signal}. Shutting down gracefully...`);
  TimerService.stopTicker();

  server.close(async () => {
    logger.info('HTTP server closed');
    await disconnectDatabase();
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = { app, server, io };
