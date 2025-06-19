async function routes(fastify, options) {
  // Route racine
  fastify.get('/', async (request, reply) => {
    return {
      service: 'Chat-Files-Service',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/api/v1/health',
        messages: '/api/v1/messages',
        conversations: '/api/v1/conversations',
        files: '/api/v1/files'
      }
    };
  });

  // Enregistrer les sous-routes
  await fastify.register(require('./health'), { prefix: '/health' });
  await fastify.register(require('./messages'), { prefix: '/messages' });
  await fastify.register(require('./conversations'), { prefix: '/conversations' });
  await fastify.register(require('./files'), { prefix: '/files' });

  // 404 handler
  fastify.setNotFoundHandler(async (request, reply) => {
    reply.code(404);
    return {
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
      statusCode: 404
    };
  });
}

module.exports = routes;
