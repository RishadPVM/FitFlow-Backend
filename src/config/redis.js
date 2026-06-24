const Redis = require('ioredis');
const logger = require('./logger');
const env = require('./env');

// Construct Connection Target
const connectionTarget = env.redisUrl
  ? env.redisUrl
  : {
      host: env.redisHost,
      port: env.redisPort,
      username: env.redisUsername || undefined,
      password: env.redisPassword || undefined,
      db: env.redisDb,
    };

// Build ioredis Configuration Options
const redisOptions = {
  maxRetriesPerRequest: null, // Required by bull queues and socket.io redis-adapter
  enableReadyCheck: true,
  connectTimeout: 10000, // 10 seconds connection timeout
  retryStrategy(times) {
    // Exponential backoff retry strategy with jitter to prevent thundering herd
    const delay = Math.min(times * 100 + Math.random() * 100, 5000);
    logger.warn(`Redis connection retry attempt #${times} in ${Math.round(delay)}ms...`);
    return delay;
  },
};

// Create the Singleton Redis Client Instance
const redisClient = env.redisUrl
  ? new Redis(env.redisUrl, redisOptions)
  : new Redis(connectionTarget, redisOptions);

/**
 * Attaches production event handlers to a Redis client instance.
 * Ensures observability and prevents unhandled "error" exceptions.
 * 
 * @param {Redis} client - The Redis client instance
 * @param {string} name - Human-readable label for logs (e.g., Main, PubSub)
 */
const attachEventHandlers = (client, name = 'RedisClient') => {
  // Emitted when client starts connecting or reconnecting
  client.on('connect', () => {
    logger.info(`[${name}] TCP connection established. Performing ready check...`);
  });

  // Emitted when connection is fully established and commands can be processed
  client.on('ready', () => {
    logger.success(`[${name}] Redis is ready and accepting commands.`);
  });

  // Emitted when connection or protocol error occurs
  client.on('error', (err) => {
    logger.error(`[${name}] Connection error:`, {
      message: err.message,
      code: err.code,
      stack: err.stack,
    });
  });

  // Emitted when client begins reconnecting
  client.on('reconnecting', (delay) => {
    logger.warn(`[${name}] Client connection lost. Retrying in ${delay}ms...`);
  });

  // Emitted when connection is permanently closed
  client.on('end', () => {
    logger.warn(`[${name}] Redis connection permanently closed.`);
  });

  // Emitted when server reports a warning
  client.on('warning', (warning) => {
    logger.warn(`[${name}] Warning: ${warning}`);
  });
};

// Bind events to the primary client
attachEventHandlers(redisClient, 'RedisMain');

// Wrapper for duplicating clients (useful for Socket.IO horizontal scaling)
// Ensures duplicated clients inherit the necessary error and lifecycle handlers.
const originalDuplicate = redisClient.duplicate.bind(redisClient);
redisClient.duplicate = function (overrideOptions) {
  logger.info('[RedisMain] Duplicating Redis client...');
  const duplicatedClient = originalDuplicate(overrideOptions);
  attachEventHandlers(duplicatedClient, 'RedisDuplicated');
  return duplicatedClient;
};

/**
 * Health check function to verify Redis connection is alive and writable.
 * Uses PING command with a timeout mechanism.
 * 
 * @returns {Promise<boolean>} Resolves to true if healthy, false if unhealthy
 */
redisClient.checkHealth = async () => {
  if (redisClient.status !== 'ready') {
    logger.warn(`[RedisMain] Health check failed: status is '${redisClient.status}'`);
    return false;
  }
  
  try {
    // Send PING and wait for PONG
    const pong = await Promise.race([
      redisClient.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 3000))
    ]);
    
    if (pong === 'PONG') {
      return true;
    }
    
    logger.warn(`[RedisMain] Health check failed: unexpected ping reply '${pong}'`);
    return false;
  } catch (error) {
    logger.error('[RedisMain] Health check failed with error:', error.message);
    return false;
  }
};

/**
 * Gracefully shuts down the Redis connection.
 */
redisClient.gracefulShutdown = async () => {
  logger.info('[RedisMain] Initiating graceful shutdown of Redis client...');
  try {
    await redisClient.quit();
    logger.success('[RedisMain] Redis connection closed gracefully.');
  } catch (err) {
    logger.error('[RedisMain] Error during graceful shutdown:', err.message);
    // Force disconnect if quit fails
    redisClient.disconnect();
  }
};

module.exports = redisClient;
