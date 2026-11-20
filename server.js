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
  // Bind HTTP & Socket.IO server to PORT first so frontend can communicate immediately
  server.listen(config.port, () => {
    logger.success(`🚀 Football Portal Server is running on http://localhost:${config.port}`);
    logger.info(`Environment: ${config.env}`);
    logger.info(`Socket.IO live updates enabled`);
  });

  const initializeConnectedServices = async () => {
    try {
      await AuthService.seedInitialSuperAdmin();

      const Tournament = require('./src/models/Tournament');
      const User = require('./src/models/User');
      const tournamentCount = await Tournament.countDocuments();
      if (tournamentCount === 0) {
        const admin = await User.findOne({ role: 'SuperAdmin' });
        await Tournament.create({
          name: 'Alliance Premier League - Season 9',
          description: 'Official APL Season 9 Championship Tournament',
          startDate: new Date(),
          endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          status: 'Ongoing',
          createdBy: admin ? admin._id : null
        });
        logger.success('Initialized default tournament: Alliance Premier League - Season 9');
      } else {
        await Tournament.updateMany(
          { name: { $in: ['2026 Inter-College Spring Cup', '2026 Inter-College Championship'] } },
          { $set: { name: 'Alliance Premier League - Season 9', description: 'Official APL Season 9 Championship Tournament' } }
        );
      }

      await TimerService.recoverActiveTimers();
      TimerService.startTicker(1000); // 1-second ticker (hardcoded)
      logger.success('Database initialized with admin and live timer engine ticker');
    } catch (err) {
      logger.warn(`Post-connect initialization pending: ${err.message}`);
    }
  };

  try {
    const conn = await connectDatabase();
    if (conn) {
      await initializeConnectedServices();
    } else {
      // Connect callback when mongoose connects on retry
      const mongoose = require('mongoose');
      mongoose.connection.once('connected', () => {
        initializeConnectedServices();
      });
    }
  } catch (error) {
    logger.warn(`Initial database connection pending: ${error.message}`);
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
