/**
 * Redis Configuration - Chat File Service
 * Configuration robuste avec fallback
 */

const redis = require("redis");

class RedisConfig {
  constructor() {
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
  }

  async connect() {
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      console.log(
        "⚠️ Limite de tentatives Redis atteinte, mode mémoire locale"
      );
      return false;
    }

    this.connectionAttempts++;

    try {
      console.log(
        `🔄 Connexion Redis - Tentative ${this.connectionAttempts}/${this.maxConnectionAttempts}...`
      );

      const clientConfig = {
        socket: {
          host: process.env.REDIS_HOST || "localhost",
          port: process.env.REDIS_PORT || 6379,
          connectTimeout: 5000,
          lazyConnect: true,
        },
        password: process.env.REDIS_PASSWORD || undefined,
        retry_strategy: (options) => {
          if (options.error && options.error.code === "ECONNREFUSED") {
            return new Error("Le serveur Redis refuse la connexion");
          }
          if (options.total_retry_time > 1000 * 10) {
            return new Error("Timeout de retry atteint");
          }
          if (options.attempt > 3) {
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        },
      };

      this.client = redis.createClient(clientConfig);
      this.pubClient = redis.createClient(clientConfig);
      this.subClient = redis.createClient(clientConfig);

      // Gestion des erreurs
      this.client.on("error", (err) => {
        if (err.code === "ECONNREFUSED") {
          console.warn("⚠️ Redis non disponible, mode mémoire locale activé");
        } else {
          console.error("Redis Client Error:", err);
        }
      });

      this.pubClient.on("error", (err) =>
        console.warn("Redis Pub Error:", err.message)
      );
      this.subClient.on("error", (err) =>
        console.warn("Redis Sub Error:", err.message)
      );

      // Connexion avec timeout
      await Promise.race([
        Promise.all([
          this.client.connect(),
          this.pubClient.connect(),
          this.subClient.connect(),
        ]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Redis connection timeout")), 5000)
        ),
      ]);

      this.isConnected = true;
      this.connectionAttempts = 0;
      console.log("✅ Redis connecté avec succès");
      return true;
    } catch (error) {
      console.warn(
        `⚠️ Redis indisponible (tentative ${this.connectionAttempts}):`,
        error.message
      );

      if (process.env.NODE_ENV === "development") {
        console.log("💡 Solutions pour Redis:");
        console.log("   1. Démarrer: sudo systemctl start redis-server");
        console.log("   2. Installer: sudo apt install redis-server");
        console.log("   3. Docker: docker run -d -p 6379:6379 redis");
      }

      return false;
    }
  }

  getClient() {
    return this.isConnected ? this.client : null;
  }

  getPubClient() {
    return this.isConnected ? this.pubClient : null;
  }

  getSubClient() {
    return this.isConnected ? this.subClient : null;
  }

  async getHealthStatus() {
    if (!this.isConnected) return { status: "disconnected" };

    try {
      await this.client.ping();
      return { status: "connected" };
    } catch (error) {
      return { status: "error", error: error.message };
    }
  }

  async disconnect() {
    try {
      if (this.client && this.client.isOpen) await this.client.quit();
      if (this.pubClient && this.pubClient.isOpen) await this.pubClient.quit();
      if (this.subClient && this.subClient.isOpen) await this.subClient.quit();
      this.isConnected = false;
      console.log("✅ Redis déconnecté");
    } catch (error) {
      console.error("❌ Erreur déconnexion Redis:", error);
    }
  }
}

module.exports = new RedisConfig();
