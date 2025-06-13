async function routes(fastify, options) {
  // Route de base
  fastify.get('/', async (request, reply) => {
    return {
      service: 'chat-files-service',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        messages: '/messages',
        conversations: '/conversations',
        files: '/files'
      }
    };
  });

  // Health check
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      service: 'chat-files-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version
    };
  });

  // Routes pour les messages
  fastify.register(async function messageRoutes(fastify) {
    fastify.get('/messages', async (request, reply) => {
      return { message: 'Messages endpoint - TODO: implement' };
    });

    fastify.post('/messages', async (request, reply) => {
      return { message: 'Send message - TODO: implement' };
    });
  }, { prefix: '/messages' });

  // Routes pour les conversations
  fastify.register(async function conversationRoutes(fastify) {
    fastify.get('/conversations', async (request, reply) => {
      return { message: 'Conversations endpoint - TODO: implement' };
    });

    fastify.post('/conversations', async (request, reply) => {
      return { message: 'Create conversation - TODO: implement' };
    });
  }, { prefix: '/conversations' });

  // Routes pour les fichiers
  fastify.register(async function fileRoutes(fastify) {
    fastify.get('/files', async (request, reply) => {
      return { message: 'Files endpoint - TODO: implement' };
    });

    fastify.post('/files/upload', async (request, reply) => {
      return { message: 'File upload - TODO: implement' };
    });
  }, { prefix: '/files' });
}

module.exports = routes;
