const mongoose = require('mongoose');
const config = require('./env');
const logger = require('../utils/logger');

const connectDatabase = async (customUri = null) => {
  const primaryUri = customUri || config.mongoUri;
  const fallbackUri = 'mongodb://127.0.0.1:27017/football_portal';

  try {
    const conn = await mongoose.connect(primaryUri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000
    });

    logger.success(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    logger.warn(`Primary MongoDB connection failed (${error.message}). Checking fallback...`);

    // If primary was not the fallback, try local fallback
    if (primaryUri !== fallbackUri) {
      try {
        const fallbackConn = await mongoose.connect(fallbackUri, {
          autoIndex: true,
          serverSelectionTimeoutMS: 3000
        });
        logger.success(`Fallback MongoDB Connected: ${fallbackConn.connection.host}/${fallbackConn.connection.name}`);
        return fallbackConn;
      } catch (fallbackError) {
        logger.error(`Fallback MongoDB connection failed: ${fallbackError.message}`);
      }
    }

    logger.error(`Database connection failed: ${error.message}`);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
};

const disconnectDatabase = async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed gracefully');
  } catch (error) {
    logger.error(`Error closing MongoDB connection: ${error.message}`);
  }
};

module.exports = {
  connectDatabase,
  disconnectDatabase
};
