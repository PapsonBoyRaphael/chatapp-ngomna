const Conversation = require('../../../domain/entities/Conversation');

async function conversationRoutes(fastify, options) {
  // Liste des conversations
  fastify.get('/', async (request, reply) => {
    const { userId, page = 1, limit = 20 } = request.query;

    if (!userId) {
      reply.code(400);
      return { error: 'userId is required' };
    }

    const mockConversations = [
      {
        id: 'conv-1',
        title: 'Équipe Développement',
        type: 'GROUP',
        participants: ['user-1', 'user-2', 'user-3'],
        participantCount: 3,
        lastMessage: {
          content: 'Dernière mise à jour du projet',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          senderId: 'user-2'
        },
        unreadCount: 2,
        isPinned: true,
        createdAt: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 'conv-2',
        title: null,
        type: 'PRIVATE',
        participants: ['user-1', 'user-4'],
        participantCount: 2,
        lastMessage: {
          content: 'À bientôt !',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          senderId: 'user-4'
        },
        unreadCount: 0,
        isPinned: false,
        createdAt: new Date(Date.now() - 172800000).toISOString()
      }
    ];

    return {
      conversations: mockConversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: mockConversations.length
      }
    };
  });

  // Créer une conversation
  fastify.post('/', async (request, reply) => {
    try {
      const { title, type = 'PRIVATE', participants, createdBy } = request.body;

      if (!participants || !Array.isArray(participants) || participants.length === 0) {
        reply.code(400);
        return { error: 'participants array is required' };
      }

      if (!createdBy) {
        reply.code(400);
        return { error: 'createdBy is required' };
      }

      const conversation = Conversation.create({
        title,
        type,
        participants,
        createdBy
      });

      const errors = conversation.validate();
      if (errors.length > 0) {
        reply.code(400);
        return { error: 'Validation failed', details: errors };
      }

      reply.code(201);
      return {
        success: true,
        conversation: conversation.toJSON()
      };

    } catch (error) {
      fastify.log.error('Error creating conversation:', error);
      reply.code(500);
      return { error: 'Internal server error' };
    }
  });
}

module.exports = conversationRoutes;
