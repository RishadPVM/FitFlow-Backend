const redisClient = require('../config/redis');
const prisma = require('../config/database');
const logger = require('../config/logger');

/**
 * Manage User Presence and Socket Mapping in Redis
 */

const PRESENCE_PREFIX = 'presence:';
const SOCKET_PREFIX = 'sockets:';
const TYPING_PREFIX = 'typing:';

/**
 * Mark a user or gym owner as online and map their socket ID
 */
const setOnline = async (id, isGym, socketId) => {
  const presenceKey = `${PRESENCE_PREFIX}${id}`;
  const socketKey = `${SOCKET_PREFIX}${id}`;

  try {
    // Add socket ID to the user's active socket set
    await redisClient.sadd(socketKey, socketId);
    
    // Set presence status
    await redisClient.set(presenceKey, 'online');

    // Update database lastSeen timestamp
    if (isGym) {
      await prisma.gym.update({
        where: { id },
        data: { lastSeen: new Date() }
      });
    } else {
      await prisma.user.update({
        where: { id },
        data: { lastSeen: new Date() }
      });
    }
  } catch (error) {
    logger.error(`Error setting presence online for ${id}:`, error);
  }
};

/**
 * Remove a socket ID, check if user is completely offline, and update state
 */
const setOffline = async (id, isGym, socketId) => {
  const presenceKey = `${PRESENCE_PREFIX}${id}`;
  const socketKey = `${SOCKET_PREFIX}${id}`;

  try {
    // Remove specific socket
    await redisClient.srem(socketKey, socketId);

    // Check if any active connections remain
    const activeConnections = await redisClient.scard(socketKey);
    if (activeConnections === 0) {
      await redisClient.set(presenceKey, 'offline');
      
      const now = new Date();
      // Persist offline status and lastSeen to DB
      if (isGym) {
        await prisma.gym.update({
          where: { id },
          data: { lastSeen: now }
        });
      } else {
        await prisma.user.update({
          where: { id },
          data: { lastSeen: now }
        });
      }
      return { isOnline: false, lastSeen: now };
    }
    
    return { isOnline: true, lastSeen: null };
  } catch (error) {
    logger.error(`Error setting presence offline for ${id}:`, error);
    return { isOnline: false, lastSeen: new Date() };
  }
};

/**
 * Get the current presence status of a user or gym owner
 */
const getPresenceStatus = async (id) => {
  try {
    const presenceKey = `${PRESENCE_PREFIX}${id}`;
    const status = await redisClient.get(presenceKey);
    
    if (status) {
      return status === 'online';
    }

    // Fallback: If not in cache, assume offline
    return false;
  } catch (error) {
    logger.error(`Error fetching presence status for ${id}:`, error);
    return false;
  }
};

/**
 * Manage Typing Indicator states with automatic 3s timeout
 */
const setTypingStatus = async (conversationId, senderId, senderType, isTyping) => {
  const typingKey = `${TYPING_PREFIX}${conversationId}:${senderId}`;

  try {
    if (isTyping) {
      // Cache typing state with a 3-second TTL
      await redisClient.set(typingKey, senderType, 'EX', 3);
    } else {
      await redisClient.del(typingKey);
    }
  } catch (error) {
    logger.error(`Error setting typing status for ${senderId} in ${conversationId}:`, error);
  }
};

/**
 * Retrieve socket IDs of online user connections (for targeted server pushes)
 */
const getUserSockets = async (id) => {
  const socketKey = `${SOCKET_PREFIX}${id}`;
  try {
    return await redisClient.smembers(socketKey);
  } catch (error) {
    logger.error(`Error retrieving sockets for ${id}:`, error);
    return [];
  }
};

module.exports = {
  setOnline,
  setOffline,
  getPresenceStatus,
  setTypingStatus,
  getUserSockets
};
