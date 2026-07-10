const prisma = require('../config/database');
const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const AppError = require('../utils/app-error');
const storageService = require('../services/storage.service');
const redisService = require('../services/redis.service');
const socketService = require('../services/socket.service');

/**
 * Fetch active chat list for authenticated client (User or Gym Admin)
 */
const getConversations = asyncHandler(async (req, res, next) => {
  try {
    const clientId = req.user.userId;
    const isGym = req.user.role === 'GYM_OWNER';
    const { gymId } = req.query;

    const whereClause = {
      ...(isGym ? { gymId: clientId } : { userId: clientId }),
      ...(gymId ? { conversation: { gymId } } : {})
    };

    // Find all participants matching user or gym
    const participants = await prisma.participant.findMany({
      where: whereClause,
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { timestamp: 'desc' },
              take: 10,
              include: { attachments: true }
            },
            participants: {
              include: {
                user: {
                  select: { id: true, name: true, profileImage: true, lastSeen: true, isOnline: true }
                },
                gym: {
                  select: { id: true, gymName: true, logoUrl: true, lastSeen: true, isOnline: true }
                }
              }
            }
          }
        }
      },
      orderBy: {
        conversation: {
          updatedAt: 'desc'
        }
      }
    });

    const conversationsList = await Promise.all(participants.map(async (p) => {
      const conv = p.conversation;
      const lastMsg = conv.messages.find(msg => !(p.deletedMessageIds || []).includes(msg.id)) || null;

      let lastMsgSenderName = null;
      if (lastMsg) {
        if (lastMsg.senderType === 'USER') {
          const user = await prisma.user.findUnique({
            where: { id: lastMsg.senderId },
            select: { name: true }
          });
          lastMsgSenderName = user ? user.name : 'Unknown';
        } else if (lastMsg.senderType === 'GYM') {
          const gym = await prisma.gym.findUnique({
            where: { id: lastMsg.senderId },
            select: { gymName: true }
          });
          lastMsgSenderName = gym ? gym.gymName : 'Unknown';
        }
      }

      // Extract private chat counterpart contact profile
      const otherParticipant = conv.participants.find(cp => {
        if (isGym) {
          // Gym caller: counterpart is User/Member
          return cp.userId !== null;
        } else {
          // User caller: counterpart is either a Gym or another User
          if (cp.gymId !== null) return true;
          return cp.userId !== null && cp.userId !== clientId;
        }
      });

      let contact = null;
      if (otherParticipant) {
        const profile = otherParticipant.user || otherParticipant.gym;
        if (profile) {
          const isOnline = (await redisService.getPresenceStatus(profile.id)) || profile.isOnline || false;
          contact = {
            id: profile.id,
            name: otherParticipant.user ? profile.name : profile.gymName,
            profileImage: otherParticipant.user ? profile.profileImage : profile.logoUrl,
            isOnline,
            lastSeen: profile.lastSeen,
            role: otherParticipant.user ? 'USER' : 'GYM'
          };
        }
      }

      // Format default group chat title if needed
      let title = conv.title;
      if (conv.type === 'GROUP' && conv.isDefaultGroup) {
        const gym = await prisma.gym.findUnique({
          where: { id: conv.gymId },
          select: { gymName: true }
        });
        title = gym ? `${gym.gymName} Group` : 'Gym Group';
      }

      return {
        id: conv.id,
        type: conv.type,
        isDefaultGroup: conv.isDefaultGroup,
        title,
        unreadCount: p.unreadCount,
        lastMessage: lastMsg ? {
          id: lastMsg.id,
          text: lastMsg.text,
          type: lastMsg.type,
          createdAt: lastMsg.createdAt,
          timestamp: lastMsg.timestamp,
          senderId: lastMsg.senderId,
          senderType: lastMsg.senderType,
          senderName: lastMsgSenderName,
          isDeleted: lastMsg.isDeleted,
          deletedBy: lastMsg.deletedBy
        } : null,
        contact
      };
    }));

    return res.status(200).json(
      new ApiResponse(200, conversationsList, 'Conversations retrieved successfully')
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * Admin creates new private chat with a gym member, or User starts chat with Gym / User
 */
const createConversation = asyncHandler(async (req, res, next) => {
  try {
    const isGymOwner = req.user.role === 'GYM_OWNER';
    let targetGymId;
    let targetMemberId;
    let isUserToUser = false;
    let userAId;
    let userBId;

    if (isGymOwner) {
      const { memberId } = req.body;
      if (!memberId) {
        throw new AppError(400, null, 'Member ID is required');
      }
      // Verify member exists
      const member = await prisma.user.findUnique({
        where: { id: memberId }
      });
      if (!member) {
        throw new AppError(404, null, 'Gym member not found');
      }
      targetGymId = req.user.userId;
      if (member.gymId !== targetGymId) {
        throw new AppError(403, null, 'User is not registered in this gym');
      }
      targetMemberId = memberId;
    } else {
      // It's a USER. They can start chat with a gym (gymId) OR another user (userId)
      const { gymId, userId } = req.body;
      if (!gymId && !userId) {
        throw new AppError(400, null, 'Either Gym ID or User ID is required');
      }

      if (userId) {
        isUserToUser = true;
        userAId = req.user.userId;
        userBId = userId;

        // Verify other user exists
        const otherUser = await prisma.user.findUnique({
          where: { id: userId }
        });
        if (!otherUser) {
          throw new AppError(404, null, 'Other user not found');
        }

        // Both users must belong to a gym
        const me = await prisma.user.findUnique({
          where: { id: req.user.userId }
        });
        if (!me.gymId || me.gymId !== otherUser.gymId) {
          throw new AppError(400, null, 'Both users must belong to the same gym');
        }
        targetGymId = me.gymId;
      } else {
        // User-to-Gym chat (existing flow)
        const gym = await prisma.gym.findUnique({
          where: { id: gymId }
        });
        if (!gym) {
          throw new AppError(404, null, 'Gym not found');
        }
        // Verify user belongs to this gym
        const me = await prisma.user.findUnique({
          where: { id: req.user.userId }
        });
        if (me.gymId !== gymId) {
          throw new AppError(403, null, 'You can only start a chat with your registered gym');
        }
        targetGymId = gymId;
        targetMemberId = req.user.userId;
      }
    }

    // Check if conversation already exists
    let conversation;
    if (isUserToUser) {
      conversation = await prisma.conversation.findFirst({
        where: {
          type: 'PRIVATE',
          gymId: targetGymId,
          AND: [
            { participants: { some: { userId: userAId } } },
            { participants: { some: { userId: userBId } } }
          ]
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, name: true, profileImage: true } },
              gym: { select: { id: true, gymName: true, logoUrl: true } }
            }
          }
        }
      });
    } else {
      conversation = await prisma.conversation.findFirst({
        where: {
          type: 'PRIVATE',
          gymId: targetGymId,
          AND: [
            { participants: { some: { gymId: targetGymId } } },
            { participants: { some: { userId: targetMemberId } } }
          ]
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, name: true, profileImage: true } },
              gym: { select: { id: true, gymName: true, logoUrl: true } }
            }
          }
        }
      });
    }

    if (conversation) {
      return res.status(200).json(
        new ApiResponse(200, conversation, 'Conversation already exists')
      );
    }

    // Create a new private conversation
    const createParticipants = isUserToUser
      ? [ { userId: userAId }, { userId: userBId } ]
      : [ { gymId: targetGymId }, { userId: targetMemberId } ];

    conversation = await prisma.conversation.create({
      data: {
        type: 'PRIVATE',
        gymId: targetGymId,
        participants: {
          create: createParticipants
        }
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, profileImage: true } },
            gym: { select: { id: true, gymName: true, logoUrl: true } }
          }
        }
      }
    });

    return res.status(201).json(
      new ApiResponse(201, conversation, 'Conversation initiated successfully')
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * Fetch messages in conversation using backward cursor pagination
 */
const getMessages = asyncHandler(async (req, res, next) => {
  try {
    const { id: conversationId } = req.params;
    const { limit = 50, cursor } = req.query;
    const clientId = req.user.userId;
    const isGym = req.user.role === 'GYM_OWNER';

    const parsedLimit = parseInt(limit);

    // Verify room authorization
    const participant = await prisma.participant.findFirst({
      where: {
        conversationId,
        OR: isGym ? [{ gymId: clientId }] : [{ userId: clientId }]
      }
    });

    if (!participant) {
      throw new AppError(403, null, 'Unauthorized access to conversation history');
    }

    // Reset unread count for the caller
    await prisma.participant.update({
      where: { id: participant.id },
      data: { unreadCount: 0 }
    });

    // Build paginated query
    const query = {
      where: {
        conversationId,
        NOT: {
          id: { in: participant.deletedMessageIds || [] }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: parsedLimit + 1,
      include: { attachments: true }
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1; // Skip original cursor item
    }

    const messages = await prisma.message.findMany(query);

    let nextCursor = null;
    if (messages.length > parsedLimit) {
      const nextItem = messages.pop();
      nextCursor = nextItem.id;
    }

    // Resolve sender names using high-performance batch query
    const userIds = [...new Set(messages.filter(m => m.senderType === 'USER').map(m => m.senderId))];
    const gymIds = [...new Set(messages.filter(m => m.senderType === 'GYM').map(m => m.senderId))];

    const [users, gyms] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true }
      }),
      prisma.gym.findMany({
        where: { id: { in: gymIds } },
        select: { id: true, gymName: true }
      })
    ]);

    const senderMap = new Map();
    users.forEach(u => senderMap.set(u.id, u.name));
    gyms.forEach(g => senderMap.set(g.id, g.gymName));

    const messagesWithSender = await Promise.all(messages.map(async (msg) => {
      // Sign attachment URLs if they exist
      if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments = await Promise.all(msg.attachments.map(async (att) => {
          if (att.key) {
            const signedUrl = await storageService.getSignedDownloadUrl(att.key);
            if (signedUrl) {
              att.url = signedUrl;
            }
          }
          return att;
        }));
      }
      return {
        ...msg,
        senderName: senderMap.get(msg.senderId) || 'Unknown'
      };
    }));

    // Sort to chronological order for client consumption
    const sortedMessages = messagesWithSender.reverse();

    return res.status(200).json(
      new ApiResponse(200, {
        messages: sortedMessages,
        nextCursor
      }, 'Messages retrieved successfully')
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * Get S3 Presigned URL for direct media upload
 */
const getUploadTicket = asyncHandler(async (req, res, next) => {
  try {
    const { fileName, fileSize, mimeType, conversationId } = req.body;
    const clientId = req.user.userId;
    const isGym = req.user.role === 'GYM_OWNER';

    if (!fileName || !fileSize || !mimeType || !conversationId) {
      throw new AppError(400, null, 'fileName, fileSize, mimeType, and conversationId are required');
    }

    // Validate room participation
    const participant = await prisma.participant.findFirst({
      where: {
        conversationId,
        OR: isGym ? [{ gymId: clientId }] : [{ userId: clientId }]
      },
      include: {
        conversation: { select: { gymId: true } }
      }
    });

    if (!participant) {
      throw new AppError(403, null, 'Unauthorized room access');
    }

    const targetGymId = participant.conversation.gymId;
    const requestBaseUrl = `${req.protocol}://${req.get('host')}`;

    const ticket = await storageService.getPresignedUploadUrl(
      targetGymId,
      conversationId,
      fileName,
      fileSize,
      mimeType,
      requestBaseUrl
    );

    return res.status(200).json(
      new ApiResponse(200, ticket, 'Presigned URL ticket generated successfully')
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * Delete a message (delete for me or delete for everyone)
 */
const deleteMessage = asyncHandler(async (req, res, next) => {
  try {
    const { conversationId, messageId } = req.params;
    const deleteType = req.body.deleteType || req.query.deleteType; // 'me' or 'everyone'
    const clientId = req.user.userId;
    const isGym = req.user.role === 'GYM_OWNER';

    if (!deleteType || !['me', 'everyone'].includes(deleteType)) {
      throw new AppError(400, null, 'deleteType must be either "me" or "everyone"');
    }

    // 1. Verify caller room authorization
    const participant = await prisma.participant.findFirst({
      where: {
        conversationId,
        OR: isGym ? [{ gymId: clientId }] : [{ userId: clientId }]
      }
    });

    if (!participant) {
      throw new AppError(403, null, 'Unauthorized access to this conversation');
    }

    // 2. Verify message exists
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { attachments: true }
    });

    if (!message || message.conversationId !== conversationId) {
      throw new AppError(404, null, 'Message not found');
    }

    if (message.isDeleted) {
      return res.status(200).json(
        new ApiResponse(200, null, 'Message already deleted')
      );
    }

    if (deleteType === 'everyone') {
      // 3. Authorization check for everyone deletion:
      // Must be the sender of the message OR the Gym Owner in their gym's conversation.
      const isSender = message.senderId === clientId;
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });
      const isGymAdmin = isGym && conversation && conversation.gymId === clientId;

      if (!isSender && !isGymAdmin) {
        throw new AppError(403, null, 'Unauthorized to delete this message for everyone');
      }

      // 4. Delete attachments from S3 if they exist
      if (message.attachments && message.attachments.length > 0) {
        const keys = message.attachments.map(att => att.key).filter(Boolean);
        if (keys.length > 0) {
          await storageService.deleteFiles(keys);
        }
      }

      // 5. Soft delete message (Delete attachments from DB and set Message status)
      await prisma.$transaction([
        prisma.attachment.deleteMany({
          where: { messageId }
        }),
        prisma.message.update({
          where: { id: messageId },
          data: {
            isDeleted: true,
            deletedBy: clientId,
            text: null,
            type: 'TEXT',
            duration: null
          }
        })
      ]);

      // 6. Broadcast delete notification via Socket.IO
      try {
        const io = socketService.getIO();
        const roomParticipants = await prisma.participant.findMany({
          where: { conversationId }
        });
        for (const p of roomParticipants) {
          const personalRoom = p.userId ? `user:${p.userId}` : `gym:${p.gymId}`;
          io.to(personalRoom).emit('message_deleted', {
            conversationId,
            messageId,
            deleteType: 'everyone',
            deletedBy: clientId
          });
        }
      } catch (ioErr) {
        logger.error('Error broadcasting message deletion:', ioErr);
      }

      return res.status(200).json(
        new ApiResponse(200, null, 'Message deleted for everyone successfully')
      );
    } else {
      // deleteType === 'me'
      // 3. Append to deletedMessageIds for this participant
      if (!participant.deletedMessageIds.includes(messageId)) {
        await prisma.participant.update({
          where: { id: participant.id },
          data: {
            deletedMessageIds: {
              push: messageId
            }
          }
        });
      }

      return res.status(200).json(
        new ApiResponse(200, null, 'Message deleted for me successfully')
      );
    }
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  getConversations,
  createConversation,
  getMessages,
  getUploadTicket,
  deleteMessage
};
