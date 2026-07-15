const express = require('express');
const request = require('supertest');
const createGroupRoutes = require('../../../../src/interfaces/http/routes/groupRoutes');

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
  }
}));

describe('Group Routes', () => {
  let app;
  let mockController;

  beforeEach(() => {
    mockController = {
      createGroup: jest.fn((req, res) => res.status(201).json({ success: true })),
      getGroup: jest.fn((req, res) => res.json({ success: true })),
      addParticipant: jest.fn((req, res) => res.json({ success: true })),
      removeParticipant: jest.fn((req, res) => res.json({ success: true })),
      addAdmin: jest.fn((req, res) => res.json({ success: true })),
      leaveGroup: jest.fn((req, res) => res.json({ success: true })),
      searchOccurrences: jest.fn((req, res) => res.json({ success: true, data: [] })),
    };

    app = express();
    app.use(express.json());
    app.use('/groups', createGroupRoutes(mockController));
  });

  it('should call createGroup on POST /groups', async () => {
    console.log("🧪 Test: should call createGroup on POST /groups");
    const response = await request(app)
      .post('/groups')
      .send({ name: 'Group A', adminId: 'user-123', members: ['user-456'] });

    expect(response.status).toBe(201);
    expect(mockController.createGroup).toHaveBeenCalled();
  });

  it('should call getGroup on GET /groups/:id', async () => {
    console.log("🧪 Test: should call getGroup on GET /groups/:id");
    const response = await request(app).get('/groups/507f1f77bcf86cd799439011');

    expect(response.status).toBe(200);
    expect(mockController.getGroup).toHaveBeenCalled();
  });

  it('should call addParticipant on POST /groups/:id/participants', async () => {
    console.log("🧪 Test: should call addParticipant on POST /groups/:id/participants");
    const response = await request(app)
      .post('/groups/507f1f77bcf86cd799439011/participants')
      .send({ participantId: 'user-789' });

    expect(response.status).toBe(200);
    expect(mockController.addParticipant).toHaveBeenCalled();
  });

  it('should call removeParticipant on DELETE /groups/:id/participants/:pid', async () => {
    console.log("🧪 Test: should call removeParticipant on DELETE /groups/:id/participants/:pid");
    const response = await request(app).delete('/groups/507f1f77bcf86cd799439011/participants/user-789');

    expect(response.status).toBe(200);
    expect(mockController.removeParticipant).toHaveBeenCalled();
  });

  it('should return 503 if controller is missing', async () => {
    console.log("🧪 Test: should return 503 if controller is missing");
    const errorApp = express();
    errorApp.use('/groups', createGroupRoutes(null));

    const response = await request(errorApp).get('/groups');
    expect(response.status).toBe(503);
  });
});
