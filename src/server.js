const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const prisma = require('./config/database');
const { initSocket } = require('./services/socket.service');

const server = http.createServer(app);

const startServer = async () => {
  try {
    // Check database connection
    await prisma.$connect();
    logger.info('Connected to the database successfully.');

    // Initialize WebSockets
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
  await prisma.$disconnect();
  logger.info('Prisma disconnected on app termination');
  process.exit(0);
});
