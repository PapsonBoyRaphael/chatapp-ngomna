// test/setupTests.js

// Mock des variables d'environnement globales pour les tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db';
process.env.KAFKA_BROKERS = 'localhost:9092';
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock de Mongoose
jest.mock('mongoose', () => {
  const mongoose = jest.requireActual('mongoose');
  return {
    ...mongoose,
    connect: jest.fn().mockResolvedValue(true),
    connection: {
      on: jest.fn(),
      once: jest.fn(),
      close: jest.fn(),
    },
  };
});

// Mock de KafkaJS
jest.mock('kafkajs', () => {
  const mProducer = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
  };
  const mConsumer = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    run: jest.fn(),
  };
  const mKafka = {
    producer: jest.fn(() => mProducer),
    consumer: jest.fn(() => mConsumer),
  };
  return { Kafka: jest.fn(() => mKafka) };
});

// Mock de Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(),
    disconnect: jest.fn().mockResolvedValue(),
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

// Mock Socket.io
jest.mock('socket.io', () => {
  return {
    Server: jest.fn(() => ({
      on: jest.fn(),
      emit: jest.fn(),
      to: jest.fn().mockReturnThis(),
      adapter: jest.fn(),
    })),
  };
});

// Optionnel: Nettoyage après chaque test
afterEach(() => {
  jest.clearAllMocks();
});
