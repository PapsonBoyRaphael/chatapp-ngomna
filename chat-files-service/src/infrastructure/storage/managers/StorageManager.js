/**
 * Storage Manager - Infrastructure
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const S3StorageAdapter = require('../adapters/S3StorageAdapter');

const logger = createLogger('StorageManager');

class StorageManager {
  constructor(options = {}) {
    this.options = {
      defaultProvider: process.env.STORAGE_PROVIDER || 's3',
      enableFailover: true,
      enableLoadBalancing: false,
      healthCheckInterval: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      enableMetrics: true,
      ...options
    };

    this.providers = new Map();
    this.activeProvider = null;
    this.healthCheckInterval = null;
    this.metrics = this.initializeMetrics();
    
    logger.info('🗄️ StorageManager créé', {
      defaultProvider: this.options.defaultProvider,
      enableFailover: this.options.enableFailover
    });
  }

  // Initialisation
  async initialize() {
    try {
      logger.info('🔧 Initialisation StorageManager...');

      // Initialiser les providers de stockage
      await this.initializeProviders();

      // Sélectionner le provider actif
      await this.selectActiveProvider();

      // Démarrer le monitoring de santé
      if (this.options.healthCheckInterval > 0) {
        this.startHealthMonitoring();
      }

      logger.info('✅ StorageManager initialisé', {
        activeProvider: this.activeProvider?.constructor.name,
        providersCount: this.providers.size
      });

    } catch (error) {
      logger.error('❌ Erreur initialisation StorageManager:', { error: error.message });
      throw error;
    }
  }

  async initializeProviders() {
    // Provider S3 principal
    if (process.env.AWS_ACCESS_KEY_ID || process.env.S3_ENDPOINT) {
      const s3Provider = new S3StorageAdapter({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1',
        bucket: process.env.S3_BUCKET || 'chat-files-bucket',
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'
      });

      this.providers.set('s3', s3Provider);
      logger.info('📦 Provider S3 configuré');
    }

    // Provider S3 de failover (si configuré)
    if (process.env.S3_FAILOVER_BUCKET) {
      const s3FailoverProvider = new S3StorageAdapter({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1',
        bucket: process.env.S3_FAILOVER_BUCKET,
        endpoint: process.env.S3_FAILOVER_ENDPOINT
      });

      this.providers.set('s3-failover', s3FailoverProvider);
      logger.info('🔄 Provider S3 failover configuré');
    }

    // Autres providers (Azure, GCP, etc.) peuvent être ajoutés ici
    
    if (this.providers.size === 0) {
      throw new Error('Aucun provider de stockage configuré');
    }
  }

  async selectActiveProvider() {
    const preferredProvider = this.options.defaultProvider;
    
    if (this.providers.has(preferredProvider)) {
      const provider = this.providers.get(preferredProvider);
      
      try {
        await provider.connect();
        this.activeProvider = provider;
        logger.info('✅ Provider actif sélectionné:', { provider: preferredProvider });
        return;
      } catch (error) {
        logger.error('❌ Échec connexion provider préféré:', { 
          provider: preferredProvider, 
          error: error.message 
        });
      }
    }

    // Fallback sur le premier provider disponible
    for (const [name, provider] of this.providers) {
      try {
        await provider.connect();
        this.activeProvider = provider;
        logger.warn('⚠️ Fallback sur provider:', { provider: name });
        return;
      } catch (error) {
        logger.error('❌ Échec connexion provider fallback:', { 
          provider: name, 
          error: error.message 
        });
      }
    }

    throw new Error('Aucun provider de stockage disponible');
  }

  // Opérations de stockage

  async upload(fileBuffer, fileName, options = {}) {
    const startTime = Date.now();

    try {
      // Générer la clé de stockage
      const storageKey = this.generateStorageKey(fileName, options);
      
      logger.debug('📤 Upload fichier:', {
        fileName,
        storageKey,
        size: fileBuffer.length,
        provider: this.activeProvider.constructor.name
      });

      // Upload avec retry automatique
      const result = await this.executeWithRetry(
        () => this.activeProvider.upload(fileBuffer, storageKey, {
          originalName: fileName,
          mimeType: options.mimeType,
          metadata: options.metadata,
          ...options
        }),
        'upload'
      );

      const duration = Date.now() - startTime;
      this.updateMetrics('upload', duration, fileBuffer.length, true);

      logger.info('✅ Fichier uploadé:', {
        fileName,
        storageKey: result.key,
        size: fileBuffer.length,
        duration,
        etag: result.etag
      });

      return {
        storageKey: result.key,
        storageProvider: this.getActiveProviderName(),
        size: fileBuffer.length,
        etag: result.etag,
        location: result.location,
        metadata: result.metadata,
        uploadedAt: new Date().toISOString()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics('upload', duration, fileBuffer.length, false);

      logger.error('❌ Erreur upload fichier:', {
        fileName,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  async download(storageKey, options = {}) {
    const startTime = Date.now();

    try {
      logger.debug('📥 Download fichier:', {
        storageKey,
        provider: this.activeProvider.constructor.name
      });

      const fileBuffer = await this.executeWithRetry(
        () => this.activeProvider.download(storageKey, options),
        'download'
      );

      const duration = Date.now() - startTime;
      this.updateMetrics('download', duration, fileBuffer.length, true);

      logger.debug('✅ Fichier téléchargé:', {
        storageKey,
        size: fileBuffer.length,
        duration
      });

      return fileBuffer;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics('download', duration, 0, false);

      logger.error('❌ Erreur download fichier:', {
        storageKey,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  async delete(storageKey, options = {}) {
    const startTime = Date.now();

    try {
      logger.debug('🗑️ Suppression fichier:', {
        storageKey,
        provider: this.activeProvider.constructor.name
      });

      await this.executeWithRetry(
        () => this.activeProvider.delete(storageKey, options),
        'delete'
      );

      const duration = Date.now() - startTime;
      this.updateMetrics('delete', duration, 0, true);

      logger.info('✅ Fichier supprimé:', {
        storageKey,
        duration
      });

      return true;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics('delete', duration, 0, false);

      logger.error('❌ Erreur suppression fichier:', {
        storageKey,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  async exists(storageKey) {
    try {
      return await this.executeWithRetry(
        () => this.activeProvider.exists(storageKey),
        'exists'
      );
    } catch (error) {
      logger.error('❌ Erreur vérification existence:', {
        storageKey,
        error: error.message
      });
      return false;
    }
  }

  async getMetadata(storageKey) {
    try {
      return await this.executeWithRetry(
        () => this.activeProvider.getMetadata(storageKey),
        'getMetadata'
      );
    } catch (error) {
      logger.error('❌ Erreur récupération métadonnées:', {
        storageKey,
        error: error.message
      });
      throw error;
    }
  }

  async generatePresignedUrl(storageKey, operation = 'getObject', expiresIn = 3600) {
    try {
      return await this.executeWithRetry(
        () => this.activeProvider.generatePresignedUrl(storageKey, operation, expiresIn),
        'generatePresignedUrl'
      );
    } catch (error) {
      logger.error('❌ Erreur génération URL pré-signée:', {
        storageKey,
        operation,
        error: error.message
      });
      throw error;
    }
  }

  async copy(sourceKey, destinationKey, options = {}) {
    try {
      return await this.executeWithRetry(
        () => this.activeProvider.copy(sourceKey, destinationKey, options),
        'copy'
      );
    } catch (error) {
      logger.error('❌ Erreur copie fichier:', {
        sourceKey,
        destinationKey,
        error: error.message
      });
      throw error;
    }
  }

  async list(prefix = '', options = {}) {
    try {
      return await this.executeWithRetry(
        () => this.activeProvider.list(prefix, options),
        'list'
      );
    } catch (error) {
      logger.error('❌ Erreur listage fichiers:', {
        prefix,
        error: error.message
      });
      throw error;
    }
  }

  // Gestion des erreurs et retry

  async executeWithRetry(operation, operationType) {
    let lastError;

    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        logger.warn(`🔄 Tentative ${attempt}/${this.options.retryAttempts} échouée:`, {
          operation: operationType,
          error: error.message
        });

        // Vérifier si on doit faire un failover
        if (this.shouldFailover(error) && attempt === this.options.retryAttempts) {
          const failedProvider = this.activeProvider;
          
          if (await this.performFailover()) {
            logger.info('🔄 Failover effectué, nouvelle tentative');
            try {
              return await operation();
            } catch (failoverError) {
              logger.error('❌ Échec après failover:', { error: failoverError.message });
              // Remettre le provider original
              this.activeProvider = failedProvider;
            }
          }
        }

        // Attendre avant la prochaine tentative (sauf dernière)
        if (attempt < this.options.retryAttempts) {
          const delay = this.options.retryDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  shouldFailover(error) {
    if (!this.options.enableFailover) {
      return false;
    }

    // Critères de failover
    const failoverErrors = [
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'NetworkingError',
      'CredentialsError'
    ];

    return failoverErrors.some(errorType => 
      error.message.includes(errorType) || 
      error.code === errorType
    );
  }

  async performFailover() {
    const currentProviderName = this.getActiveProviderName();
    
    logger.warn('🔄 Tentative de failover depuis:', { provider: currentProviderName });

    // Chercher un provider alternatif
    for (const [name, provider] of this.providers) {
      if (provider === this.activeProvider) {
        continue; // Skip le provider actuel
      }

      try {
        await provider.connect();
        this.activeProvider = provider;
        
        logger.info('✅ Failover réussi vers:', { provider: name });
        this.updateMetrics('failover', 0, 0, true);
        
        return true;
      } catch (error) {
        logger.error('❌ Échec failover vers:', { 
          provider: name, 
          error: error.message 
        });
      }
    }

    this.updateMetrics('failover', 0, 0, false);
    return false;
  }

  // Monitoring de santé

  startHealthMonitoring() {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.healthCheckInterval);

    logger.info('🏥 Monitoring de santé démarré');
  }

  async performHealthCheck() {
    const results = new Map();

    for (const [name, provider] of this.providers) {
      try {
        const health = await provider.healthCheck();
        results.set(name, health);
        
        if (health.status === 'unhealthy' && provider === this.activeProvider) {
          logger.warn('⚠️ Provider actif non sain:', { provider: name });
          
          if (this.options.enableFailover) {
            await this.performFailover();
          }
        }
      } catch (error) {
        results.set(name, {
          status: 'unhealthy',
          error: error.message,
          lastCheck: new Date().toISOString()
        });
      }
    }

    this.healthResults = results;
  }

  // Utilitaires

  generateStorageKey(fileName, options = {}) {
    if (this.activeProvider && typeof this.activeProvider.generateStorageKey === 'function') {
      return this.activeProvider.generateStorageKey(fileName, options);
    }

    // Fallback si pas implémenté dans le provider
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const prefix = options.prefix || 'files';
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

    return `${prefix}/${year}/${month}/${day}/${timestamp}_${randomId}_${sanitizedFileName}`;
  }

  getActiveProviderName() {
    for (const [name, provider] of this.providers) {
      if (provider === this.activeProvider) {
        return name;
      }
    }
    return 'unknown';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Métriques

  initializeMetrics() {
    return {
      upload: { count: 0, totalSize: 0, totalDuration: 0, errors: 0 },
      download: { count: 0, totalSize: 0, totalDuration: 0, errors: 0 },
      delete: { count: 0, totalDuration: 0, errors: 0 },
      failover: { count: 0, errors: 0 },
      lastActivity: null
    };
  }

  updateMetrics(operation, duration = 0, size = 0, success = true) {
    if (!this.metrics[operation]) {
      this.metrics[operation] = { count: 0, totalSize: 0, totalDuration: 0, errors: 0 };
    }

    this.metrics[operation].count++;
    this.metrics[operation].totalDuration += duration;
    
    if (size > 0) {
      this.metrics[operation].totalSize += size;
    }

    if (!success) {
      this.metrics[operation].errors++;
    }

    this.metrics.lastActivity = new Date().toISOString();
  }

  getMetrics() {
    const summary = {
      overview: {
        activeProvider: this.getActiveProviderName(),
        providersCount: this.providers.size,
        lastActivity: this.metrics.lastActivity
      },
      operations: {}
    };

    Object.entries(this.metrics).forEach(([operation, metrics]) => {
      if (typeof metrics === 'object' && metrics.count !== undefined) {
        summary.operations[operation] = {
          total: metrics.count,
          errors: metrics.errors,
          successRate: metrics.count > 0 
            ? Math.round(((metrics.count - metrics.errors) / metrics.count) * 100) 
            : 0,
          averageDuration: metrics.count > 0 
            ? Math.round(metrics.totalDuration / metrics.count) 
            : 0,
          totalSize: metrics.totalSize || 0,
          averageSize: metrics.count > 0 && metrics.totalSize 
            ? Math.round(metrics.totalSize / metrics.count) 
            : 0
        };
      }
    });

    // Métriques des providers
    summary.providers = {};
    for (const [name, provider] of this.providers) {
      summary.providers[name] = {
        isActive: provider === this.activeProvider,
        isConnected: provider.isConnected,
        health: this.healthResults?.get(name) || null,
        metrics: provider.getMetrics ? provider.getMetrics().overview : null
      };
    }

    return summary;
  }

  // Santé globale

  async healthCheck() {
    try {
      const activeProviderHealth = this.activeProvider 
        ? await this.activeProvider.healthCheck()
        : { status: 'unhealthy', error: 'Aucun provider actif' };

      return {
        status: activeProviderHealth.status,
        activeProvider: this.getActiveProviderName(),
        providersCount: this.providers.size,
        metrics: this.getMetrics().overview,
        providers: this.healthResults ? Object.fromEntries(this.healthResults) : {},
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }

  // Nettoyage

  async shutdown() {
    logger.info('🛑 Arrêt StorageManager...');

    // Arrêter le monitoring de santé
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Déconnecter tous les providers
    for (const [name, provider] of this.providers) {
      try {
        if (provider.disconnect) {
          await provider.disconnect();
        }
        logger.info(`✅ Provider ${name} déconnecté`);
      } catch (error) {
        logger.error(`❌ Erreur déconnexion provider ${name}:`, { error: error.message });
      }
    }

    this.providers.clear();
    this.activeProvider = null;

    logger.info('✅ StorageManager arrêté');
  }
}

module.exports = StorageManager;
