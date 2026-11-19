const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const TimerService = require('../src/services/timerService');
require('dotenv').config();

const getTestUri = () => {
  if (process.env.MONGODB_TEST_URI) return process.env.MONGODB_TEST_URI;
  if (process.env.MONGODB_URI) {
    // Append /football_portal_test or replace database name with test
    return process.env.MONGODB_URI.replace(/\/[^/?]+(\?|$)/, '/football_portal_test$1');
  }
  return 'mongodb://127.0.0.1:27017/football_portal_test';
};

const TEST_DB_URI = getTestUri();

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await connectDatabase(TEST_DB_URI);
});

afterAll(async () => {
  TimerService.stopTicker();
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.dropDatabase();
    } catch (e) {
      // Ignore drop errors if already dropped
    }
    await disconnectDatabase();
  }
});
