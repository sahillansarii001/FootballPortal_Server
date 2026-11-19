const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const TimerService = require('../src/services/timerService');

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/football_portal_test';

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
