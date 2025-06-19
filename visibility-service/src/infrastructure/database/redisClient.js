const redis = require('redis');
const { redis: redisConfig } = require('../../config/settings');

const client = redis.createClient({
  url: `redis://${redisConfig.host}:${redisConfig.port}`,
});

client.on('error', (err) => {
  console.error('Redis Client Error:', err.message);
  // Avoid crashing the app
});

client.on('connect', () => {
  console.log('Connected to Redis');
});

client.connect().catch((err) => {
  console.error('Redis Connection Failed:', err.message);
});

module.exports = client;