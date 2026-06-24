const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const prisma = require('./config/database');
const redisClient = require('./config/redis');
const { initSocket } = require('./services/socket.service');

const server = http.createServer(app);

const waitForRedis = (client, timeoutMs = 5000) => {
  return new Promise((resolve) => {
    if (client.status === 'ready') {
      return resolve(true);
    }

    const onReady = () => {
      cleanup();
      resolve(true);
    };

    const onError = () => {
      // Don't reject immediately to allow retryStrategy to run and connectTimeout to hit
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const cleanup = () => {
      client.off('ready', onReady);
      client.off('error', onError);
      clearTimeout(timeout);
    };

    client.on('ready', onReady);
    client.on('error', onError);
  });
};

const startServer = async () => {
  try {
    // 1. Connect database (Prisma)
    logger.info('Connecting to the database...');
    await prisma.$connect();
    logger.success('Connected to the database successfully.');

    // 2. Connect Redis
    logger.info('Checking Redis connection status...');
    const isRedisReady = await waitForRedis(redisClient, 5000);
    let isRedisHealthy = false;

    if (isRedisReady) {
      isRedisHealthy = await redisClient.checkHealth();
    }

    if (isRedisHealthy) {
      logger.success('Redis connected and verified healthy.');
    } else {
      const errorMsg = `Redis connection failed (Status: ${redisClient.status})`;
      if (env.redisMandatory) {
        logger.error(`CRITICAL: ${errorMsg}. Exiting process because Redis is marked as mandatory.`);
        process.exit(1);
      } else {
        logger.warn(`WARNING: ${errorMsg}. Continuing server boot with degraded real-time/chat features.`);
      }
    }

    // 3. Initialize WebSockets
    initSocket(server);
    logger.info('Socket.IO initialized successfully.');

    server.listen(env.port, () => {
      logger.info('Server is running on port ' + env.port + ' in ' + env.nodeEnv + ' mode.');
    });
  } catch (error) {
    logger.error('Failed to start the server:', error);
    process.exit(1);
  }
};

startServer();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('SIGINT signal received. Starting graceful shutdown...');
  
  try {
    await prisma.$disconnect();
    logger.success('Prisma disconnected successfully.');
  } catch (err) {
    logger.error('Error disconnecting Prisma:', err.message);
  }

  try {
    await redisClient.gracefulShutdown();
  } catch (err) {
    logger.error('Error shutting down Redis client:', err.message);
  }

  logger.info('Graceful shutdown completed. Exiting.');
  process.exit(0);
});

