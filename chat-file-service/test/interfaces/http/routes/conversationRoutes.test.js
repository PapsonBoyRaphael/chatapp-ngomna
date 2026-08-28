const express = require('express');
const request = require('supertest');
const createConversationRoutes = require('../../../../src/interfaces/http/routes/conversationRoutes');

// Mock des middlewares
jest.mock('../../../../src/interfaces/http/middleware', () => ({
  authMiddleware: {
    authenticate: (req, res, next) => {
      req.user = { id: 'user-123' };
      next();
    },
    validateToken: (req, res, next) => {
      req.user = { id: 'user-123' };
      next();
    }
  },
  rateLimitMiddleware: {
    apiLimit: (req, res, next) => next(),
    createLimit: (req, res, next) => next(),
  },
  validationMiddleware: {
    sanitizeInput: (req, res, next) => next(),
    validateMongoId: (paramName) => (req, res, next) => next(),
    validateConversationCreation: (req, res, next) => next(),
  }
}));

describe('Conversation Routes', () => {
  let app;
  let mockController;

  beforeEach(() => {
    mockController = {
      getConversations: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getConversation: jest.fn((req, res) => res.json({ success: true, data: {} })),
      createConversation: jest.fn((req, res) => res.status(201).json({ success: true })),
      markAsRead: jest.fn((req, res) => res.json({ success: true })),
      archiveConversation: jest.fn((req, res) => res.json({ success: true })),
      unarchiveConversation: jest.fn((req, res) => res.json({ success: true })),
      getArchivedConversations: jest.fn((req, res) => res.json({ success: true, data: [] })),
    };

    app = express();
    app.use(express.json());
    app.use('/conversations', createConversationRoutes(mockController));
  });

  it('should call getConversations on GET /conversations', async () => {
    console.log("🧪 Test: should call getConversations on GET /conversations");
    const response = await request(app)
      .get('/conversations')
      .query({ limit: 10, page: 2 });

    expect(response.status).toBe(200);
    expect(mockController.getConversations).toHaveBeenCalled();
    // Le route handler ajoute req.pagination
    const reqArg = mockController.getConversations.mock.calls[0][0];
    expect(reqArg.pagination).toEqual({
      limit: 10,
      cursor: null,
      page: 2
    });
  });

  it('should call getConversation on GET /conversations/:id', async () => {
    console.log("🧪 Test: should call getConversation on GET /conversations/:id");
    const response = await request(app).get('/conversations/507f1f77bcf86cd799439011');

    expect(response.status).toBe(200);
    expect(mockController.getConversation).toHaveBeenCalled();
  });

  it('should call createConversation on POST /conversations', async () => {
    console.log("🧪 Test: should call createConversation on POST /conversations");
    const response = await request(app)
      .post('/conversations')
      .send({ participantId: 'user-456' });

    expect(response.status).toBe(201);
    expect(mockController.createConversation).toHaveBeenCalled();
  });

  it('should call archiveConversation on POST /conversations/:id/archive', async () => {
    console.log("🧪 Test: should call archiveConversation on POST /conversations/:id/archive");
    const response = await request(app).post('/conversations/507f1f77bcf86cd799439011/archive');

    expect(response.status).toBe(200);
    expect(mockController.archiveConversation).toHaveBeenCalled();
  });

  it('should return 503 if controller is missing', async () => {
    console.log("🧪 Test: should return 503 if controller is missing");
    const errorApp = express();
    errorApp.use('/conversations', createConversationRoutes(null));

    const response = await request(errorApp).get('/conversations');
    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
  });
});
