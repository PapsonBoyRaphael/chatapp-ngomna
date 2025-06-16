const redis = require('redis');
const { REDIS_HOST, REDIS_PORT } = require('../../config/settings');

const client = redis.createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
});

client.on('error', (err) => console.error('Redis Client Error', err));

client.connect();

module.exports = client;