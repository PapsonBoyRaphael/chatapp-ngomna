/**
 * Redis Configuration - Shared (Legacy Wrapper)
 * ✅ Wrapper de compatibilité qui utilise RedisFactory
 * ✅ Permet aux services existants de continuer à fonctionner
 */

const RedisFactory = require("./RedisFactory");

class RedisConfig {
  constructor() {
    this.serviceName = "shared-legacy";
    this.service = null;
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      // Utiliser RedisFactory
      this.service = RedisFactory.createService(this.serviceName);
      await this.service.connect();

      // Exposer les clients pour compatibilité
      this.client = this.service.getMainClient();
      this.pubClient = this.service.getPubClient();
      this.subClient = this.service.getSubClient();
      this.isConnected = true;

      return this.client;
    } catch (error) {
      console.error("❌ Impossible de se connecter à Redis:", error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.service) {
        await this.service.disconnect();
      }
      this.client = null;
      this.pubClient = null;
      this.subClient = null;
      this.isConnected = false;
    } catch (error) {
      console.error("❌ Erreur déconnexion Redis:", error);
    }
  }

  getClient() {
    return this.client;
  }

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
    if (this.service) {
      return await this.service.getHealthStatus();
    }
    return "Déconnecté";
  }
}

module.exports = new RedisConfig();
