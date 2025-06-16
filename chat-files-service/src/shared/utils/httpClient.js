/**
 * HTTP Client Utility - Chat Files Service
 * CENADI Chat-Files-Service
 * Client HTTP pour communication avec services externes
 */

const axios = require('axios');
const { getConfigSection } = require('../config');
const { createLogger } = require('./logger');
const DateHelper = require('./dateHelper');

const logger = createLogger('HTTPClient');

class HTTPClient {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 5000,
      retries: options.retries || 3,
      retryDelay: options.retryDelay || 1000,
      maxRetryDelay: options.maxRetryDelay || 10000,
      ...options
    };

    this.services = getConfigSection('services') || {};
    this.clients = new Map();
    
    this.initializeClients();
  }

  // Initialiser les clients pour chaque service
  initializeClients() {
    // Client pour le service de visibilité
    if (this.services.visibilityService) {
      this.clients.set('visibility', this.createClient('visibility', {
        baseURL: this.services.visibilityService.url,
        timeout: this.services.visibilityService.timeout || this.options.timeout
      }));
    }

    // Client pour le service de chat
    if (this.services.chatService) {
      this.clients.set('chat', this.createClient('chat', {
        baseURL: this.services.chatService.url,
        timeout: this.services.chatService.timeout || this.options.timeout
      }));
    }

    logger.info('🌐 Clients HTTP initialisés:', {
      services: Array.from(this.clients.keys()),
      timeout: this.options.timeout
    });
  }

  // Créer un client Axios configuré
  createClient(serviceName, config = {}) {
    const client = axios.create({
      timeout: this.options.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'chat-files-service/1.0.0',
        'X-Service-Name': 'chat-files-service'
      },
      ...config
    });

    // Intercepteur de requête
    client.interceptors.request.use(
      (config) => {
        const startTime = Date.now();
        config.metadata = { startTime, serviceName };
        
        logger.debug(`🌐 → ${serviceName.toUpperCase()}:`, {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
          timeout: config.timeout
        });

        return config;
      },
      (error) => {
        logger.error(`❌ Erreur requête ${serviceName}:`, error);
        return Promise.reject(error);
      }
    );

    // Intercepteur de réponse
    client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        
        logger.info(`🌐 ← ${serviceName.toUpperCase()}:`, {
          status: response.status,
          duration: `${duration}ms`,
          url: response.config.url
        });

        return response;
      },
      (error) => {
        const duration = error.config?.metadata ? 
          Date.now() - error.config.metadata.startTime : 0;

        logger.error(`❌ ${serviceName.toUpperCase()} erreur:`, {
          status: error.response?.status,
          message: error.message,
          duration: `${duration}ms`,
          url: error.config?.url
        });

        return Promise.reject(error);
      }
    );

    return client;
  }

  // === MÉTHODES GÉNÉRIQUES ===

  // Exécuter une requête avec retry
  async executeWithRetry(requestFn, maxRetries = this.options.retries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        if (attempt <= maxRetries && this.isRetryableError(error)) {
          const delay = this.calculateRetryDelay(attempt);
          
          logger.warn(`⚠️ Tentative ${attempt}/${maxRetries + 1} échouée, retry dans ${delay}ms:`, {
            error: error.message,
            status: error.response?.status
          });
          
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  // Vérifier si une erreur est retriable
  isRetryableError(error) {
    // Erreurs réseau
    if (!error.response) return true;
    
    // Codes HTTP retriables
    const retryableCodes = [408, 429, 500, 502, 503, 504];
    return retryableCodes.includes(error.response.status);
  }

  // Calculer le délai de retry (exponential backoff)
  calculateRetryDelay(attempt) {
    const baseDelay = this.options.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // Ajouter du jitter
    
    return Math.min(exponentialDelay + jitter, this.options.maxRetryDelay);
  }

  // Utilitaire sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // === COMMUNICATION AVEC SERVICES ===

  // Vérifier les permissions d'accès (Visibility Service)
  async checkAccess(userId, chatId, action = 'read') {
    try {
      const client = this.clients.get('visibility');
      if (!client) {
        throw new Error('Service de visibilité non configuré');
      }

      const response = await this.executeWithRetry(() =>
        client.get('/access/check', {
          params: { userId, chatId, action },
          headers: { 'X-Request-ID': this.generateRequestId() }
        })
      );

      return response.data;
    } catch (error) {
      logger.error('❌ Erreur vérification accès:', {
        userId,
        chatId,
        action,
        error: error.message
      });
      
      // En cas d'erreur du service, on refuse l'accès par sécurité
      return { hasAccess: false, reason: 'Service indisponible' };
    }
  }

  // Obtenir les informations d'un chat
  async getChatInfo(chatId, userId) {
    try {
      const client = this.clients.get('chat');
      if (!client) {
        throw new Error('Service de chat non configuré');
      }

      const response = await this.executeWithRetry(() =>
        client.get(`/chats/${chatId}`, {
          headers: { 
            'X-Request-ID': this.generateRequestId(),
            'X-User-ID': userId
          }
        })
      );

      return response.data;
    } catch (error) {
      logger.error('❌ Erreur récupération chat:', {
        chatId,
        userId,
        error: error.message
      });
      
      if (error.response?.status === 404) {
        return null;
      }
      
      throw error;
    }
  }

  // Notifier d'un événement de fichier
  async notifyFileEvent(eventType, fileData, chatId) {
    try {
      const client = this.clients.get('chat');
      if (!client) {
        logger.warn('⚠️ Service de chat non configuré, notification ignorée');
        return;
      }

      await this.executeWithRetry(() =>
        client.post('/events/file', {
          type: eventType,
          file: fileData,
          chatId,
          timestamp: DateHelper.toISOString()
        }, {
          headers: { 'X-Request-ID': this.generateRequestId() }
        })
      );

      logger.info('�� Événement notifié:', {
        eventType,
        fileId: fileData.fileId,
        chatId
      });

    } catch (error) {
      logger.error('❌ Erreur notification événement:', {
        eventType,
        fileId: fileData.fileId,
        chatId,
        error: error.message
      });
      
      // Ne pas faire échouer l'opération principale
    }
  }

  // === HEALTH CHECKS ===

  // Vérifier la santé d'un service
  async checkServiceHealth(serviceName) {
    try {
      const client = this.clients.get(serviceName);
      if (!client) {
        return { healthy: false, reason: 'Service non configuré' };
      }

      const startTime = Date.now();
      
      const response = await client.get('/health', {
        timeout: 3000 // Timeout réduit pour health check
      });

      const responseTime = Date.now() - startTime;

      return {
        healthy: response.status === 200,
        responseTime,
        status: response.data
      };

    } catch (error) {
      return {
        healthy: false,
        reason: error.message,
        responseTime: null
      };
    }
  }

  // Vérifier la santé de tous les services
  async checkAllServicesHealth() {
    const results = {};
    
    for (const serviceName of this.clients.keys()) {
      results[serviceName] = await this.checkServiceHealth(serviceName);
    }

    return results;
  }

  // === UTILITAIRES ===

  // Générer un ID de requête unique
  generateRequestId() {
    return require('crypto').randomUUID();
  }

  // Obtenir les statistiques des clients
  getStats() {
    return {
      configuredServices: Array.from(this.clients.keys()),
      timeout: this.options.timeout,
      retries: this.options.retries,
      retryDelay: this.options.retryDelay
    };
  }

  // Fermer tous les clients
  close() {
    // Axios ne nécessite pas de fermeture explicite
    this.clients.clear();
    logger.info('🌐 Clients HTTP fermés');
  }

  // === MÉTHODES SPÉCIALISÉES ===

  // Upload vers un service externe (si nécessaire)
  async uploadToExternalService(fileData, serviceUrl, options = {}) {
    try {
      const formData = new FormData();
      formData.append('file', fileData.buffer, fileData.originalname);
      formData.append('metadata', JSON.stringify(fileData.metadata || {}));

      const response = await axios.post(serviceUrl, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...options.headers
        },
        timeout: options.timeout || 30000, // Timeout plus long pour uploads
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      return response.data;
    } catch (error) {
      logger.error('❌ Erreur upload externe:', error);
      throw error;
    }
  }

  // Télécharger depuis un service externe
  async downloadFromExternalService(url, options = {}) {
    try {
      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: options.timeout || 30000,
        ...options
      });

      return response.data;
    } catch (error) {
      logger.error('❌ Erreur download externe:', error);
      throw error;
    }
  }
}

// Export singleton
const httpClient = new HTTPClient();

module.exports = {
  HTTPClient,
  httpClient
};
