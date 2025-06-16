const Message = require('../../../domain/entities/Message');
const { messageSchema } = require('../../../shared/utils/validator');

async function messageRoutes(fastify, options) {
  // Liste des messages d'une conversation
  fastify.get('/', async (request, reply) => {
    const { conversationId, page = 1, limit = 50, before, after } = request.query;
    
    if (!conversationId) {
      reply.code(400);
      return { 
        error: 'Bad Request',
        message: 'conversationId is required',
        statusCode: 400
      };
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    // Mock data
    const mockMessages = [
      {
        id: 'msg-001',
        conversationId,
        senderId: 'user-alice',
        content: 'Bonjour équipe ! Comment avance le projet ?',
        type: 'TEXT',
        status: 'read',
        createdAt: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 'msg-002',
        conversationId,
        senderId: 'user-bob',
        content: 'Salut Alice ! Tout va bien.',
        type: 'TEXT',
        status: 'read',
        replyToId: 'msg-001',
        createdAt: new Date(Date.now() - 3300000).toISOString()
      }
    ];

    return {
      success: true,
      data: {
        messages: mockMessages,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: mockMessages.length,
          hasNext: false,
          hasPrev: false
        }
      }
    };
  });

  // Envoyer un message
  fastify.post('/', async (request, reply) => {
    try {
      const { error, value } = messageSchema.validate(request.body);
      if (error) {
        reply.code(400);
        return {
          error: 'Validation Error',
          message: error.details[0].message,
          statusCode: 400
        };
      }

      const message = Message.create(value);
      const validationErrors = message.validate();
      
      if (validationErrors.length > 0) {
        reply.code(400);
        return {
          error: 'Business Validation Failed',
          details: validationErrors,
          statusCode: 400
        };
      }

      reply.code(201);
      return {
        success: true,
        data: { message: message.toJSON() },
        message: 'Message created successfully'
      };

    } catch (error) {
      fastify.log.error('Error creating message:', error);
      reply.code(500);
      return {
        error: 'Internal Server Error',
        message: 'Failed to create message',
        statusCode: 500
      };
    }
  });

  // Autres routes...
  fastify.get('/:id', async (request, reply) => {
    reply.code(404);
    return { error: 'Message not found', statusCode: 404 };
  });
}

module.exports = messageRoutes;
