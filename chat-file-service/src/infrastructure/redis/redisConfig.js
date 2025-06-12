const redis = require('redis');

class RedisConfig {
  constructor() {
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
  }

  async connect() {
    try {
      const clientConfig = {
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
        },
        password: process.env.REDIS_PASSWORD || undefined,
      };

      this.client = redis.createClient(clientConfig);
      this.pubClient = redis.createClient(clientConfig);
      this.subClient = redis.createClient(clientConfig);

      this.client.on('error', (err) => console.error('Redis Client Error:', err));
      this.pubClient.on('error', (err) => console.error('Redis Pub Error:', err));
      this.subClient.on('error', (err) => console.error('Redis Sub Error:', err));

      await this.client.connect();
      await this.pubClient.connect();
      await this.subClient.connect();

      console.log('✅ Redis connecté avec succès');
      return true;
    } catch (error) {
      console.error('❌ Erreur connexion Redis:', error);
      return false;
    }
  }

  getClient() { return this.client; }
  getPubClient() { return this.pubClient; }
  getSubClient() { return this.subClient; }

  async disconnect() {
    try {
      if (this.client && this.client.isOpen) await this.client.quit();
      if (this.pubClient && this.pubClient.isOpen) await this.pubClient.quit();
      if (this.subClient && this.subClient.isOpen) await this.subClient.quit();
      console.log('Redis déconnecté');
    } catch (error) {
      console.error('Erreur déconnexion Redis:', error);
    }
  }
}

module.exports = new RedisConfig();
