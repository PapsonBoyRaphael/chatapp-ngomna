const express = require('express');
const request = require('supertest');
const createFileRoutes = require('../../../../src/interfaces/http/routes/fileRoutes');

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

// Mock de music-metadata pour éviter l'erreur d'import transitif
jest.mock('music-metadata', () => ({ parseFile: jest.fn() }), { virtual: true });

describe('File Routes', () => {
  let app;
  let mockController;

  beforeEach(() => {
    mockController = {
      uploadFile: jest.fn((req, res) => res.status(201).json({ success: true })),
      getFile: jest.fn((req, res) => res.json({ success: true, data: {} })),
      getFiles: jest.fn((req, res) => res.json({ success: true, data: [] })),
      deleteFile: jest.fn((req, res) => res.json({ success: true })),
      getConversationFiles: jest.fn((req, res) => res.json({ success: true, data: [] })),
      getThumbnail: jest.fn((req, res) => res.json({ success: true })),
      downloadFile: jest.fn((req, res) => res.json({ success: true })),
      downloadMultipleFiles: jest.fn((req, res) => res.json({ success: true })),
      checkUploadStatus: jest.fn((req, res) => res.json({ success: true })),
      initChunkedUpload: jest.fn((req, res) => res.json({ success: true })),
      uploadChunk: jest.fn((req, res) => res.json({ success: true })),
      completeChunkedUpload: jest.fn((req, res) => res.json({ success: true })),
      searchOccurrences: jest.fn((req, res) => res.json({ success: true, data: [] })),
    };

    app = express();
    app.use(express.json());
    app.use('/files', createFileRoutes(mockController));
  });

  it('should call getFiles on GET /files', async () => {
    console.log("🧪 Test: should call getFiles on GET /files");
    const response = await request(app).get('/files');

    expect(response.status).toBe(200);
    expect(mockController.getFiles).toHaveBeenCalled();
  });

  it('should call getFile on GET /files/:id', async () => {
    console.log("🧪 Test: should call getFile on GET /files/:id");
    const response = await request(app).get('/files/uuid123');

    expect(response.status).toBe(200);
    expect(mockController.getFile).toHaveBeenCalled();
  });

  it('should call deleteFile on DELETE /files/:id', async () => {
    console.log("🧪 Test: should call deleteFile on DELETE /files/:id");
    const response = await request(app).delete('/files/uuid123');

    expect(response.status).toBe(200);
    expect(mockController.deleteFile).toHaveBeenCalled();
  });

  it('should call getConversationFiles on GET /files/conversation/:id', async () => {
    console.log("🧪 Test: should call getConversationFiles on GET /files/conversation/:id");
    const response = await request(app).get('/files/conversation/507f1f77bcf86cd799439011');

    expect(response.status).toBe(200);
    expect(mockController.getConversationFiles).toHaveBeenCalled();
  });

  it('should return 503 if controller is missing required methods', async () => {
    console.log("🧪 Test: should return 503 if controller is missing required methods");
    const incompleteController = {
      uploadFile: jest.fn(),
      // getFile est manquant
    };
    const errorApp = express();
    errorApp.use('/files', createFileRoutes(incompleteController));

    const response = await request(errorApp).get('/files');
    expect(response.status).toBe(503);
  });
});
