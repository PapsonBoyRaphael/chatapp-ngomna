/**
 * Redis Configuration - Chat File Service
 * Configuration robuste avec fallback
 */

// Utiliser les nouvelles variables d'environnement

const redis = require("redis");

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,
  family: parseInt(process.env.REDIS_FAMILY) || 4,
  keepAlive: process.env.REDIS_KEEP_ALIVE === "true",
  connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 5000,
  lazyConnect: true,
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRY_ATTEMPTS) || 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxLoadingTimeout: 0,
};

class RedisConfig {
  constructor() {
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = redis.createClient(redisConfig);
      this.pubClient = redis.createClient(redisConfig);
      this.subClient = redis.createClient(redisConfig);

      this.client.on("error", (err) => {
        console.error("❌ Erreur Redis:", err);
        this.isConnected = false;
      });

      this.client.on("ready", () => {
        this.isConnected = true;
      });

      await this.client.connect();
      await this.pubClient.connect();
      await this.subClient.connect();

      return this.client;
    } catch (error) {
      console.error("❌ Impossible de se connecter à Redis:", error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) await this.client.quit();
      if (this.pubClient) await this.pubClient.quit();
      if (this.subClient) await this.subClient.quit();
      this.isConnected = false;
    } catch (error) {
      console.error("❌ Erreur déconnexion Redis:", error);
    }
  }

  getClient() {
    return this.client;
  }

  // ✅ AJOUT DES MÉTHODES MANQUANTES
  createPubClient() {
    return this.pubClient;
  }

  createSubClient() {
    return this.subClient;
  }

  getPubClient() {
    return this.pubClient;
  }

  getSubClient() {
    return this.subClient;
  }

  async getHealthStatus() {
    if (!this.isConnected || !this.client) {
      return "Déconnecté";
    }

    try {
      await this.client.ping();
      return "Connecté et opérationnel";
    } catch (error) {
      return `Erreur: ${error.message}`;
    }
  }
}

module.exports = new RedisConfig();
