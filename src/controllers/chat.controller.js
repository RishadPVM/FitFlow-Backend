const prisma = require('../config/database');
const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const AppError = require('../utils/app-error');
const storageService = require('../services/storage.service');
const redisService = require('../services/redis.service');

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
              take: 1,
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
      const lastMsg = conv.messages[0] || null;

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
          senderName: lastMsgSenderName
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
          participants: {
            some: { userId: targetMemberId }
          },
          // Ensure it's not a User-to-User conversation
          NOT: {
            participants: {
              some: { gymId: null, userId: { not: targetMemberId } }
            }
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

    // Build paginated query
    const query = {
      where: { conversationId },
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

    const messagesWithSender = messages.map(msg => ({
      ...msg,
      senderName: senderMap.get(msg.senderId) || 'Unknown'
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

module.exports = {
  getConversations,
  createConversation,
  getMessages,
  getUploadTicket
};
