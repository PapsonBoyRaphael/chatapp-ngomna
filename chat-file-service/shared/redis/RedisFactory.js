/**
 * RedisFactory - LE SEUL FICHIER avec require("redis") dans tout le projet
 * ✅ Centralise la création des clients Redis
 * ✅ Les services n'ont pas besoin de require("redis")
 * ✅ Gestion unifiée des connexions, erreurs, reconnexions
 */

const { createClient } = require("redis");

// ========================================
// CONFIGURATION PAR DÉFAUT
// ========================================
const DEFAULT_CONFIG = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,
  family: parseInt(process.env.REDIS_FAMILY) || 4,
  keepAlive: process.env.REDIS_KEEP_ALIVE === "true",
  connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 5000,
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRY_ATTEMPTS) || 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxLoadingTimeout: 0,
};

// ========================================
// REDIS SERVICE - Instance par service
// ========================================
class RedisService {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.clients = new Map();
    this.isConnected = false;
    this._errorLogged = false;

    // Métriques par service
    this.metrics = {
      clientsCreated: 0,
      reconnections: 0,
      errors: 0,
      lastConnectedAt: null,
      lastErrorAt: null,
    };

    console.log(`📦 RedisService créé pour: ${serviceName}`);
  }

  // ========================================
  // CRÉATION DE CLIENT
  // ========================================

  /**
   * Créer les options de connexion Redis
   */
  _createClientOptions(clientName) {
    return {
      socket: {
        host: this.config.host,
        port: this.config.port,
        connectTimeout: this.config.connectTimeout,
        reconnectStrategy: (retries) => {
          if (retries > this.config.maxRetriesPerRequest) {
            console.warn(
              `⚠️ [${this.serviceName}] Redis ${clientName}: abandon après ${this.config.maxRetriesPerRequest} tentatives`,
            );
            return false;
          }

          const delay = Math.min(retries * 500, 3000);
          console.log(
            `🔄 [${this.serviceName}] Redis ${clientName}: reconnexion dans ${delay}ms (tentative ${retries})`,
          );
          return delay;
        },
      },
      password: this.config.password,
      database: this.config.db,
    };
  }

  /**
   * Créer un client Redis avec handlers d'événements
   */
  async _createClient(type) {
    const clientName = `${this.serviceName}-${type}`;
    const client = createClient(this._createClientOptions(clientName));

    client.on("error", (err) => {
      if (!this._errorLogged) {
        console.error(
          `❌ [${this.serviceName}] Erreur Redis (${type}):`,
          err.message,
        );
        this._errorLogged = true;
        this.metrics.errors++;
        this.metrics.lastErrorAt = new Date();
      }
      this.isConnected = false;
    });

    client.on("ready", () => {
      console.log(`✅ [${this.serviceName}] Redis client "${type}" prêt`);
      this.isConnected = true;
      this._errorLogged = false;
      this.metrics.lastConnectedAt = new Date();
    });

    client.on("reconnecting", () => {
      console.log(
        `🔄 [${this.serviceName}] Redis client "${type}" en reconnexion...`,
      );
      this.metrics.reconnections++;
    });

    client.on("end", () => {
      console.log(`🔌 [${this.serviceName}] Redis client "${type}" déconnecté`);
      this.isConnected = false;
    });

    this.metrics.clientsCreated++;
    return client;
  }

  // ========================================
  // GETTERS CLIENTS
  // ========================================

  /**
   * Obtenir ou créer un client par type
   */
  async getClient(type = "main") {
    if (!this.clients.has(type)) {
      const client = await this._createClient(type);
      await client.connect();
      this.clients.set(type, client);
      console.log(`✅ [${this.serviceName}] Redis ${type} créé et connecté`);
    }

    return this.clients.get(type);
  }

  /**
   * Obtenir le client principal (sans await si déjà connecté)
   */
  getMainClient() {
    return this.clients.get("main") || null;
  }

  /**
   * Obtenir le client pub (sans await si déjà connecté)
   */
  getPubClient() {
    return this.clients.get("pub") || null;
  }

  /**
   * Obtenir le client sub (sans await si déjà connecté)
   */
  getSubClient() {
    return this.clients.get("sub") || null;
  }

  /**
   * Obtenir le client stream (sans await si déjà connecté)
   */
  getStreamClient() {
    return this.clients.get("stream") || null;
  }

  /**
   * Obtenir le client cache (sans await si déjà connecté)
   */
  getCacheClient() {
    return this.clients.get("cache") || null;
  }

  // ========================================
  // CONNEXION / DÉCONNEXION
  // ========================================

  /**
   * Connecter tous les clients standards (main, pub, sub)
   */
  async connect() {
    if (this.isConnected && this.clients.size > 0) {
      console.log(`ℹ️ [${this.serviceName}] Redis déjà connecté`);
      return this.getMainClient();
    }

    try {
      console.log(`🔌 [${this.serviceName}] Connexion Redis...`);

      // Créer les clients de base
      await this.getClient("main");
      await this.getClient("pub");
      await this.getClient("sub");

      this.isConnected = true;
      console.log(`✅ [${this.serviceName}] Redis connecté (3 clients)`);

      return this.getMainClient();
    } catch (error) {
      console.error(
        `❌ [${this.serviceName}] Connexion Redis échouée:`,
        error.message,
      );
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Connecter tous les clients (incluant stream et cache)
   */
  async connectAll() {
    try {
      console.log(`🔌 [${this.serviceName}] Connexion complète Redis...`);

      await Promise.all([
        this.getClient("main"),
        this.getClient("pub"),
        this.getClient("sub"),
        this.getClient("stream"),
        this.getClient("cache"),
      ]);

      this.isConnected = true;
      console.log(`✅ [${this.serviceName}] Redis connecté (5 clients)`);

      return this.getMainClient();
    } catch (error) {
      console.error(
        `❌ [${this.serviceName}] Connexion complète échouée:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Déconnecter tous les clients
   */
  async disconnect() {
    try {
      console.log(`🔌 [${this.serviceName}] Déconnexion Redis...`);

      const disconnectPromises = [];

      for (const [type, client] of this.clients.entries()) {
        disconnectPromises.push(
          client
            .quit()
            .then(() => {
              console.log(
                `   ✅ [${this.serviceName}] Client "${type}" déconnecté`,
              );
            })
            .catch((err) => {
              console.warn(
                `   ⚠️ [${this.serviceName}] Erreur déconnexion "${type}":`,
                err.message,
              );
            }),
        );
      }

      await Promise.all(disconnectPromises);

      this.clients.clear();
      this.isConnected = false;

      console.log(`✅ [${this.serviceName}] Redis déconnecté`);
    } catch (error) {
      console.error(
        `❌ [${this.serviceName}] Erreur déconnexion:`,
        error.message,
      );
    }
  }

  // ========================================
  // MÉTHODES UTILITAIRES
  // ========================================

  /**
   * Publier un message sur un channel
   */
  async publish(channel, message) {
    const client = await this.getClient("pub");
    const payload =
      typeof message === "string" ? message : JSON.stringify(message);
    return client.publish(channel, payload);
  }

  /**
   * S'abonner à un channel
   */
  async subscribe(channel, callback) {
    const client = await this.getClient("sub");
    await client.subscribe(channel, (message) => {
      try {
        const parsed = JSON.parse(message);
        callback(parsed);
      } catch (e) {
        callback(message);
      }
    });
  }

  /**
   * Dupliquer un client (pour les consumers bloquants)
   */
  async duplicateClient(type = "main") {
    const originalClient = await this.getClient(type);
    const duplicatedClient = originalClient.duplicate();
    await duplicatedClient.connect();
    console.log(`🔄 [${this.serviceName}] Client "${type}" dupliqué`);
    return duplicatedClient;
  }

  // ========================================
  // HEALTH & STATS
  // ========================================

  /**
   * Vérifier l'état de santé
   */
  async getHealthStatus() {
    if (!this.isConnected || !this.clients.has("main")) {
      return "Déconnecté";
    }

    try {
      const mainClient = this.clients.get("main");
      await mainClient.ping();
      return "Connecté et opérationnel";
    } catch (error) {
      return `Erreur: ${error.message}`;
    }
  }

  /**
   * Obtenir les métriques
   */
  getMetrics() {
    return {
      serviceName: this.serviceName,
      isConnected: this.isConnected,
      clientsCount: this.clients.size,
      clients: Array.from(this.clients.keys()),
      ...this.metrics,
    };
  }

  /**
   * Vérifier si le service est disponible
   */
  isAvailable() {
    return this.isConnected && this.clients.has("main");
  }
}

// ========================================
// REDIS FACTORY - Point d'entrée unique
// ========================================
class RedisFactory {
  static instances = new Map();

  /**
   * Crée ou récupère un service Redis pour un service spécifique
   * @param {string} serviceName - Nom du service (ex: "chat-file", "auth-user")
   * @param {Object} options - Options de configuration
   * @returns {RedisService}
   */
  static createService(serviceName, options = {}) {
    if (!this.instances.has(serviceName)) {
      const service = new RedisService(serviceName, options);
      this.instances.set(serviceName, service);
      console.log(`🏭 RedisFactory: Service "${serviceName}" créé`);
    }

    return this.instances.get(serviceName);
  }

  /**
   * Récupérer un service existant
   */
  static getService(serviceName) {
    return this.instances.get(serviceName) || null;
  }

  /**
   * Déconnecter tous les services
   */
  static async disconnectAll() {
    console.log("🏭 RedisFactory: Déconnexion de tous les services...");

    const disconnectPromises = [];
    for (const [name, service] of this.instances.entries()) {
      disconnectPromises.push(
        service.disconnect().catch((err) => {
          console.warn(`⚠️ Erreur déconnexion ${name}:`, err.message);
        }),
      );
    }

    await Promise.all(disconnectPromises);
    this.instances.clear();

    console.log("✅ RedisFactory: Tous les services déconnectés");
  }

  /**
   * Obtenir les métriques de tous les services
   */
  static getAllMetrics() {
    const metrics = {};
    for (const [name, service] of this.instances.entries()) {
      metrics[name] = service.getMetrics();
    }
    return metrics;
  }

  /**
   * Obtenir la configuration par défaut
   */
  static getDefaultConfig() {
    return { ...DEFAULT_CONFIG };
  }
}

module.exports = RedisFactory;
module.exports.RedisService = RedisService;
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
