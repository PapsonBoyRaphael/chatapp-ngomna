const express = require('express');
const request = require('supertest');
const createMessageRoutes = require('../../../../src/interfaces/http/routes/messageRoutes');

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
    reactionLimit: (req, res, next) => next(),
  },
  validationMiddleware: {
    sanitizeInput: (req, res, next) => next(),
    validateMongoId: (paramName) => (req, res, next) => next(),
    validateMessageSend: (req, res, next) => next(),
    validateMessageStatus: (req, res, next) => next(),
  }
}));

describe('Message Routes', () => {
  let app;
  let mockController;

  beforeEach(() => {
    mockController = {
      sendMessage: jest.fn((req, res) => res.status(201).json({ success: true })),
      getMessages: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getMessage: jest.fn((req, res) => res.json({ success: true, data: {} })),
      updateMessageStatus: jest.fn((req, res) => res.json({ success: true })),
      deleteMessage: jest.fn((req, res) => res.json({ success: true })),
      addReaction: jest.fn((req, res) => res.json({ success: true })),
      searchOccurrences: jest.fn((req, res) => res.json({ success: true, data: [] })),
    };

    app = express();
    app.use(express.json());
    app.use('/messages', createMessageRoutes(mockController));
  });

  it('should call sendMessage on POST /messages', async () => {
    console.log("🧪 Test: should call sendMessage on POST /messages");
    const response = await request(app)
      .post('/messages')
      .send({ content: 'Hello', conversationId: '507f1f77bcf86cd799439011' });

    expect(response.status).toBe(201);
    expect(mockController.sendMessage).toHaveBeenCalled();
  });

  it('should call getMessages on GET /messages', async () => {
    console.log("🧪 Test: should call getMessages on GET /messages");
    const response = await request(app).get('/messages');

    expect(response.status).toBe(200);
    expect(mockController.getMessages).toHaveBeenCalled();
  });

  it('should call getMessage on GET /messages/:id', async () => {
    console.log("🧪 Test: should call getMessage on GET /messages/:id");
    const response = await request(app).get('/messages/507f1f77bcf86cd799439011');

    expect(response.status).toBe(200);
    expect(mockController.getMessage).toHaveBeenCalled();
  });

  it('should call deleteMessage on DELETE /messages/:id', async () => {
    console.log("🧪 Test: should call deleteMessage on DELETE /messages/:id");
    const response = await request(app).delete('/messages/507f1f77bcf86cd799439011');

    expect(response.status).toBe(200);
    expect(mockController.deleteMessage).toHaveBeenCalled();
  });

  it('should return 503 if controller is missing', async () => {
    console.log("🧪 Test: should return 503 if controller is missing");
    const errorApp = express();
    errorApp.use('/messages', createMessageRoutes(null));

    const response = await request(errorApp).get('/messages');
    expect(response.status).toBe(503);
  });
});
