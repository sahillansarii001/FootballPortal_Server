const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Executes a callback within a MongoDB session/transaction if replica sets are active.
 * Falls back gracefully to direct execution on standalone MongoDB installations.
 */
const withTransaction = async (callback) => {
  let session = null;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } catch (error) {
    // If transactions are not supported by the current MongoDB deployment (e.g. standalone local)
    if (
      error.message &&
      (error.message.includes('Transaction numbers are only allowed') ||
        error.message.includes('replica set') ||
        error.message.includes('does not support transactions'))
    ) {
      logger.info('MongoDB deployment does not support transactions. Executing without transaction.');
      return await callback(null);
    }
    throw error;
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

module.exports = {
  withTransaction
};
