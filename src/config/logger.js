// src/config/logger.js

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',

  fgGreen: '\x1b[32m',
  fgRed: '\x1b[31m',
  fgYellow: '\x1b[33m',
  fgBlue: '\x1b[34m',
  fgCyan: '\x1b[36m',
};

const getTimestamp = () => new Date().toISOString();

const logger = {
  info: (message) => {
    console.log(
      `${colors.fgGreen}${colors.bright}[INFO]${colors.reset} ` +
      `${colors.fgCyan}${getTimestamp()}${colors.reset} - ${message}`
    );
  },

  warn: (message) => {
    console.warn(
      `${colors.fgYellow}${colors.bright}[WARN]${colors.reset} ` +
      `${colors.fgCyan}${getTimestamp()}${colors.reset} - ${message}`
    );
  },

  error: (message, error = '') => {
    console.error(
      `${colors.fgRed}${colors.bright}[ERROR]${colors.reset} ` +
      `${colors.fgCyan}${getTimestamp()}${colors.reset} - ${message}`,
      error
    );
  },

  debug: (message) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `${colors.fgBlue}${colors.bright}[DEBUG]${colors.reset} ` +
        `${colors.fgCyan}${getTimestamp()}${colors.reset} - ${message}`
      );
    }
  },

  success: (message) => {
    console.log(
      `${colors.fgGreen}${colors.bright}[SUCCESS]${colors.reset} ` +
      `${colors.fgCyan}${getTimestamp()}${colors.reset} - ${message}`
    );
  },
};

module.exports = logger;