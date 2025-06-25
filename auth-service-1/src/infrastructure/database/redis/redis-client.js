const { createClient } = require('redis');
const config = require('../../../../config/env');

const client = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
  },
});

client.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
  await client.connect();
})();

module.exports = client;