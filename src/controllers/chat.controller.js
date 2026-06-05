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

    // Find all participants matching user or gym
    const participants = await prisma.participant.findMany({
      where: isGym ? { gymId: clientId } : { userId: clientId },
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { attachments: true }
            },
            participants: {
              include: {
                user: {
                  select: { id: true, name: true, profileImage: true, lastSeen: true }
                },
                gym: {
                  select: { id: true, gymName: true, logoUrl: true, lastSeen: true }
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

      // Extract private chat counterpart contact profile
      const otherParticipant = conv.participants.find(cp => 
        isGym ? cp.userId !== null : cp.gymId !== null
      );

      let contact = null;
      if (otherParticipant) {
        const profile = otherParticipant.user || otherParticipant.gym;
        if (profile) {
          const isOnline = await redisService.getPresenceStatus(profile.id);
          contact = {
            id: profile.id,
            name: otherParticipant.user ? profile.name : profile.gymName,
            profileImage: otherParticipant.user ? profile.profileImage : profile.logoUrl,
            isOnline,
            lastSeen: profile.lastSeen
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
          senderId: lastMsg.senderId,
          senderType: lastMsg.senderType
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
 * Admin creates new private chat with a gym member
 */
const createConversation = asyncHandler(async (req, res, next) => {
  try {
    const isGymOwner = req.user.role === 'GYM_OWNER';
    let targetGymId;
    let targetMemberId;

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
      targetMemberId = memberId;
    } else {
      const { gymId } = req.body;
      if (!gymId) {
        throw new AppError(400, null, 'Gym ID is required');
      }
      // Verify gym exists
      const gym = await prisma.gym.findUnique({
        where: { id: gymId }
      });
      if (!gym) {
        throw new AppError(404, null, 'Gym not found');
      }
      targetGymId = gymId;
      targetMemberId = req.user.userId;
    }

    // Check if conversation already exists
    let conversation = await prisma.conversation.findFirst({
      where: {
        type: 'PRIVATE',
        gymId: targetGymId,
        participants: {
          some: { userId: targetMemberId }
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

    if (conversation) {
      return res.status(200).json(
        new ApiResponse(200, conversation, 'Conversation already exists')
      );
    }

    // Create a new private conversation
    conversation = await prisma.conversation.create({
      data: {
        type: 'PRIVATE',
        gymId: targetGymId,
        participants: {
          create: [
            { gymId: targetGymId },
            { userId: targetMemberId }
          ]
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
      orderBy: { createdAt: 'desc' },
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

    // Sort to chronological order for client consumption
    const sortedMessages = messages.reverse();

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
