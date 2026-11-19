/**
 * Lightweight structured console logger
 */

const logLevels = {
  info: '\x1b[36m[INFO]\x1b[0m',
  success: '\x1b[32m[SUCCESS]\x1b[0m',
  warn: '\x1b[33m[WARN]\x1b[0m',
  error: '\x1b[31m[ERROR]\x1b[0m'
};

const logger = {
  info: (msg, ...meta) => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`${new Date().toISOString()} ${logLevels.info} ${msg}`, ...meta);
    }
  },
  success: (msg, ...meta) => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`${new Date().toISOString()} ${logLevels.success} ${msg}`, ...meta);
    }
  },
  warn: (msg, ...meta) => {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`${new Date().toISOString()} ${logLevels.warn} ${msg}`, ...meta);
    }
  },
  error: (msg, ...meta) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`${new Date().toISOString()} ${logLevels.error} ${msg}`, ...meta);
    }
  }
};

module.exports = logger;
