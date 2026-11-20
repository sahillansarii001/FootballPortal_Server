const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/football_portal',
  jwtSecret: process.env.JWT_SECRET || 'development_only_secret_key_never_for_production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: (() => {
    const allowed = ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4173', 'https://football.mediaiofficial.in', 'https://api.football.mediaiofficial.in'];
    if (process.env.CORS_ORIGIN) {
      process.env.CORS_ORIGIN.split(',').forEach((o) => {
        const trimmed = o.trim();
        if (trimmed && !allowed.includes(trimmed)) {
          allowed.push(trimmed);
        }
      });
    }
    return allowed;
  })(),
  rateLimitWindowMs: 900000, // 15 minutes (hardcoded)
  rateLimitMax: 1000, // 1000 requests per 15 minutes (hardcoded)
  timerTickIntervalMs: 1000 // 1 second ticker interval (hardcoded)
};

module.exports = config;
