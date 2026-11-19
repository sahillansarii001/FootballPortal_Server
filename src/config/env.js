const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/football_portal',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_football_jwt_key_2026_production_grade_token',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4173'],
  rateLimitWindowMs: 900000, // 15 minutes (hardcoded)
  rateLimitMax: 1000, // 1000 requests per 15 minutes (hardcoded)
  timerTickIntervalMs: 1000 // 1 second ticker interval (hardcoded)
};

module.exports = config;
