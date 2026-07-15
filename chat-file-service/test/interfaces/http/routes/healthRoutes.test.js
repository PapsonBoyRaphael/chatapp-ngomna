const express = require('express');
const request = require('supertest');
const createHealthRoutes = require('../../../../src/interfaces/http/routes/healthRoutes');

// Mock des middlewares
jest.mock('../../../../src/interfaces/http/middleware', () => ({
  rateLimitMiddleware: {
    healthLimit: (req, res, next) => next(),
  }
}));

describe('Health Routes', () => {
  let app;
  let mockController;

  beforeEach(() => {
    mockController = {
      getHealth: jest.fn((req, res) => res.json({ status: 'UP' })),
      checkMongoDB: jest.fn().mockResolvedValue({ status: 'connected' }),
      checkRedis: jest.fn().mockResolvedValue({ status: 'connected' }),
      checkKafka: jest.fn().mockResolvedValue({ status: 'connected' }),
      checkUserService: jest.fn().mockResolvedValue({ status: 'connected' }),
      getDetailedHealth: jest.fn((req, res) => res.json({ status: 'UP', details: {} })),
      redisClient: {
        keys: jest.fn().mockResolvedValue(['key1']),
        get: jest.fn().mockResolvedValue('val1'),
        flushDb: jest.fn().mockResolvedValue(true)
      }
    };

    app = express();
    app.use(express.json());
    app.use('/health', createHealthRoutes(mockController));
  });

  it('should call getHealth on GET /health', async () => {
    console.log("🧪 Test: should call getHealth on GET /health");
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(mockController.getHealth).toHaveBeenCalled();
  });

  it('should call checkMongoDB on GET /health/mongodb', async () => {
    console.log("🧪 Test: should call checkMongoDB on GET /health/mongodb");
    const response = await request(app).get('/health/mongodb');

    expect(response.status).toBe(200);
    expect(mockController.checkMongoDB).toHaveBeenCalled();
    expect(response.body.service).toBe('MongoDB');
  });

  it('should call checkRedis on GET /health/redis', async () => {
    console.log("🧪 Test: should call checkRedis on GET /health/redis");
    const response = await request(app).get('/health/redis');

    expect(response.status).toBe(200);
    expect(mockController.checkRedis).toHaveBeenCalled();
    expect(response.body.service).toBe('Redis');
  });

  it('should call checkKafka on GET /health/kafka', async () => {
    console.log("🧪 Test: should call checkKafka on GET /health/kafka");
    const response = await request(app).get('/health/kafka');

    expect(response.status).toBe(200);
    expect(mockController.checkKafka).toHaveBeenCalled();
    expect(response.body.service).toBe('Kafka');
  });

  it('should call getDetailedHealth on GET /health/detailed', async () => {
    console.log("🧪 Test: should call getDetailedHealth on GET /health/detailed");
    const response = await request(app).get('/health/detailed');

    expect(response.status).toBe(200);
    expect(mockController.getDetailedHealth).toHaveBeenCalled();
  });
});
