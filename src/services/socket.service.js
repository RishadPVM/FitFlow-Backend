const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const redisClient = require('../config/redis');
const jwtService = require('./jwt.service');
const redisService = require('./redis.service');
const prisma = require('../config/database');
const logger = require('../config/logger');

let io = null;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Setup Redis Adapter for Horizontal Scaling (pub/sub client duplication)
  const pubClient = redisClient;
  const subClient = redisClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Connection authentication middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwtService.verifyToken(token);
      socket.userId = decoded.userId;
      socket.role = decoded.role;
      socket.isGym = decoded.role === 'GYM_OWNER';

      next();
    } catch (err) {
      logger.error('Socket authentication failed:', err.message);
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const clientId = socket.userId;
    const isGym = socket.isGym;
    
    logger.info(`Socket connected: ${socket.id} (User: ${clientId}, isGym: ${isGym})`);

    // ==========================================
    // Register Socket Event Listeners Synchronously
    // ==========================================

    /**
     * Join conversation room
     */
    socket.on('join_room', async ({ conversationId }, callback) => {
      try {
        // Validate participant authorization
        const isParticipant = await prisma.participant.findFirst({
          where: {
            conversationId,
            OR: isGym ? [{ gymId: clientId }] : [{ userId: clientId }]
          }
        });

        if (!isParticipant) {
          if (callback) callback({ success: false, error: 'Unauthorized room access' });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        logger.info(`Client ${clientId} joined conversation room: ${conversationId}`);
        
        if (callback) callback({ success: true });
      } catch (error) {
        logger.error('Error joining room:', error);
        if (callback) callback({ success: false, error: 'Internal server error' });
      }
    });

    /**
     * Leave conversation room
     */
    socket.on('leave_room', ({ conversationId }, callback) => {
      socket.leave(`conversation:${conversationId}`);
      logger.info(`Client ${clientId} left conversation room: ${conversationId}`);
      if (callback) callback({ success: true });
    });

    /**
     * Handle incoming real-time message
     */
    socket.on('send_message', async (payload, callback) => {
      const { conversationId, text, type, duration, attachments } = payload;
      
      try {
        // Check room authorization
        const participant = await prisma.participant.findFirst({
          where: {
            conversationId,
            OR: isGym ? [{ gymId: clientId }] : [{ userId: clientId }]
          }
        });

        if (!participant) {
          if (callback) callback({ success: false, error: 'Unauthorized to send messages in this conversation' });
          return;
        }

        // Create message transaction
        const savedMessage = await prisma.$transaction(async (tx) => {
          // 1. Create message
          const msg = await tx.message.create({
            data: {
              conversationId,
              senderType: isGym ? 'GYM' : 'USER',
              senderId: clientId,
              text: text || null,
              type: type || 'TEXT',
              duration: duration || null,
              attachments: attachments && attachments.length > 0 ? {
                create: attachments.map(att => ({
                  url: att.url,
                  fileName: att.fileName,
                  fileSize: parseInt(att.fileSize),
                  mimeType: att.mimeType,
                  duration: att.duration || null,
                  thumbnailUrl: att.thumbnailUrl || null
                }))
              } : undefined
            },
            include: {
              attachments: true
            }
          });

          // 2. Touch conversation updatedAt
          await tx.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() }
          });

          // 3. Increment unread count for other participants
          await tx.participant.updateMany({
            where: {
              conversationId,
              NOT: isGym ? { gymId: clientId } : { userId: clientId }
            },
            data: {
              unreadCount: { increment: 1 }
            }
          });

          return msg;
        });

        // Broadcast message to room
        io.to(`conversation:${conversationId}`).emit('new_message', savedMessage);

        // Fetch other participants to notify unread counts
        const otherParticipants = await prisma.participant.findMany({
          where: {
            conversationId,
            NOT: isGym ? { gymId: clientId } : { userId: clientId }
          }
        });

        for (const p of otherParticipants) {
          const targetRoom = p.userId ? `user:${p.userId}` : `gym:${p.gymId}`;
          io.to(targetRoom).emit('unread_count_update', {
            conversationId,
            unreadCount: p.unreadCount
          });
        }

        if (callback) callback({ success: true, data: savedMessage });
      } catch (error) {
        logger.error('Error sending message:', error);
        if (callback) callback({ success: false, error: 'Failed to send message' });
      }
    });

    /**
     * Handle typing indicators
     */
    socket.on('typing_start', async ({ conversationId }) => {
      await redisService.setTypingStatus(conversationId, clientId, isGym ? 'GYM' : 'USER', true);
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        conversationId,
        senderId: clientId,
        senderType: isGym ? 'GYM' : 'USER',
        isTyping: true
      });
    });

    socket.on('typing_stop', async ({ conversationId }) => {
      await redisService.setTypingStatus(conversationId, clientId, isGym ? 'GYM' : 'USER', false);
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        conversationId,
        senderId: clientId,
        senderType: isGym ? 'GYM' : 'USER',
        isTyping: false
      });
    });

    /**
     * Read/Delivery Receipts
     */
    socket.on('message_read', async ({ conversationId, messageId }) => {
      try {
        // Update Participant's lastReadMessageId
        const participant = await prisma.participant.update({
          where: isGym 
            ? { conversationId_gymId: { conversationId, gymId: clientId } }
            : { conversationId_userId: { conversationId, userId: clientId } },
          data: {
            lastReadMessageId: messageId,
            unreadCount: 0 // Reset unread count since they read the messages
          }
        });

        // Notify room of read update
        socket.to(`conversation:${conversationId}`).emit('message_status_update', {
          conversationId,
          messageId,
          status: 'READ',
          userId: clientId,
          isGym
        });

        // Notify client of their reset unread count
        socket.emit('unread_count_update', {
          conversationId,
          unreadCount: 0
        });
      } catch (error) {
        logger.error('Error marking message as read:', error);
      }
    });

    socket.on('message_delivered', async ({ conversationId, messageId }) => {
      try {
        await prisma.participant.update({
          where: isGym 
            ? { conversationId_gymId: { conversationId, gymId: clientId } }
            : { conversationId_userId: { conversationId, userId: clientId } },
          data: {
            lastDeliveredMessageId: messageId
          }
        });

        socket.to(`conversation:${conversationId}`).emit('message_status_update', {
          conversationId,
          messageId,
          status: 'DELIVERED',
          userId: clientId,
          isGym
        });
      } catch (error) {
        logger.error('Error marking message as delivered:', error);
      }
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', async () => {
      const presenceState = await redisService.setOffline(clientId, isGym, socket.id);
      
      // If user is fully offline (no sockets remaining), notify other clients
      if (!presenceState.isOnline) {
        socket.broadcast.emit('presence_update', {
          id: clientId,
          isOnline: false,
          lastSeen: presenceState.lastSeen
        });
      }
      logger.info(`Socket disconnected: ${socket.id} (User: ${clientId})`);
    });

    // ==========================================
    // Perform Asynchronous Connection Setup Tasks
    // ==========================================
    try {
      // 1. Join user-specific channel (for targeted pushes)
      const personalRoom = isGym ? `gym:${clientId}` : `user:${clientId}`;
      socket.join(personalRoom);

      // 2. Set online state in Redis & notify active connections
      await redisService.setOnline(clientId, isGym, socket.id);
      socket.broadcast.emit('presence_update', {
        id: clientId,
        isOnline: true,
        lastSeen: null
      });

      // 3. Automatically join Gym Group Room if user belongs to one
      if (!isGym) {
        const user = await prisma.user.findUnique({
          where: { id: clientId },
          select: { gymId: true }
        });
        if (user && user.gymId) {
          socket.join(`gym_group:${user.gymId}`);
        }
      } else {
        // If Gym Owner, join their own group channel
        socket.join(`gym_group:${clientId}`);
      }
    } catch (err) {
      logger.error('Error in socket async setup tasks:', err);
    }
  });
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO is not initialized!');
  return io;
};

module.exports = {
  initSocket,
  getIO
};
