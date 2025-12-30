/**
 * WorkerManager - Gestionnaire centralisé de tous les workers
 * ✅ Démarrage/arrêt coordonné
 * ✅ Métriques agrégées
 * ✅ Health check
 */

const RetryWorker = require("./RetryWorker");
const FallbackWorker = require("./FallbackWorker");
const WALRecoveryWorker = require("./WALRecoveryWorker");
const DLQMonitorWorker = require("./DLQMonitorWorker");
const MemoryMonitorWorker = require("./MemoryMonitorWorker");
const StreamMonitorWorker = require("./StreamMonitorWorker");

class WorkerManager {
  constructor(streamManager, redisClient, options = {}) {
    this.streamManager = streamManager;
    this.redis = redisClient;
    this.options = options;

    this.workers = {};
    this.isRunning = false;
    this.startedAt = null;
  }

  /**
   * Initialiser tous les workers
   */
  initialize(callbacks = {}) {
    // Retry Worker
    this.workers.retry = new RetryWorker(this.streamManager, {
      maxRetries: this.options.maxRetries || 5,
      batchSize: this.options.batchSize || 10,
      processingDelayMs: this.options.retryIntervalMs || 1000,
      saveCallback: callbacks.save,
      publishCallback: callbacks.publish,
      dlqCallback: callbacks.dlq,
      notifyCallback: callbacks.notify,
    });

    // Fallback Worker
    this.workers.fallback = new FallbackWorker(this.streamManager, {
      batchSize: this.options.batchSize || 10,
      processingDelayMs: this.options.fallbackIntervalMs || 2000,
      saveCallback: callbacks.save,
      publishCallback: callbacks.publish,
      dlqCallback: callbacks.dlq,
      notifyCallback: callbacks.notify,
    });

    // WAL Recovery Worker
    this.workers.walRecovery = new WALRecoveryWorker(this.streamManager, {
      walTimeout: this.options.walTimeout || 60000,
      processingDelayMs: this.options.walIntervalMs || 3000,
      findMessageCallback: callbacks.findMessage,
      dlqCallback: callbacks.dlq,
    });

    // DLQ Monitor Worker
    this.workers.dlqMonitor = new DLQMonitorWorker(this.streamManager, {
      checkIntervalMs: this.options.dlqCheckIntervalMs || 5000,
      alertThreshold: this.options.dlqAlertThreshold || 10,
      criticalThreshold: this.options.dlqCriticalThreshold || 100,
      notifyCallback: callbacks.notify,
    });

    // Memory Monitor Worker
    this.workers.memoryMonitor = new MemoryMonitorWorker(this.redis, {
      checkIntervalMs: this.options.memoryCheckIntervalMs || 60000,
      memoryLimitMB: this.options.memoryLimitMB || 512,
      alertCallback: callbacks.alert,
    });

    // Stream Monitor Worker
    this.workers.streamMonitor = new StreamMonitorWorker(this.streamManager, {
      checkIntervalMs: this.options.streamCheckIntervalMs || 60000,
      reportIntervalMs: this.options.streamReportIntervalMs || 300000,
    });

    console.log(
      "✅ WorkerManager initialisé avec",
      Object.keys(this.workers).length,
      "workers"
    );
  }

  /**
   * Démarrer tous les workers
   */
  startAll() {
    if (this.isRunning) {
      console.warn("⚠️ Workers déjà en cours");
      return;
    }

    console.log("🚀 Démarrage de tous les workers...");

    for (const [name, worker] of Object.entries(this.workers)) {
      try {
        worker.start();
      } catch (error) {
        console.error(`❌ Erreur démarrage ${name}:`, error.message);
      }
    }

    this.isRunning = true;
    this.startedAt = new Date();
    console.log("✅ Tous les workers démarrés");
  }

  /**
   * Arrêter tous les workers
   */
  stopAll() {
    if (!this.isRunning) return;

    console.log("🛑 Arrêt de tous les workers...");

    for (const [name, worker] of Object.entries(this.workers)) {
      try {
        worker.stop();
      } catch (error) {
        console.error(`❌ Erreur arrêt ${name}:`, error.message);
      }
    }

    this.isRunning = false;
    console.log("✅ Tous les workers arrêtés");
  }

  /**
   * Obtenir un worker spécifique
   */
  getWorker(name) {
    return this.workers[name];
  }

  /**
   * Obtenir les métriques de tous les workers
   */
  getAllMetrics() {
    const metrics = {
      isRunning: this.isRunning,
      startedAt: this.startedAt,
      uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
      workers: {},
    };

    for (const [name, worker] of Object.entries(this.workers)) {
      metrics.workers[name] = worker.getMetrics();
    }

    return metrics;
  }

  /**
   * Health check
   */
  getHealthStatus() {
    const workersHealth = {};
    let allHealthy = true;

    for (const [name, worker] of Object.entries(this.workers)) {
      const isRunning = worker.isRunning;
      workersHealth[name] = isRunning ? "healthy" : "stopped";
      if (this.isRunning && !isRunning) {
        allHealthy = false;
      }
    }

    return {
      status: this.isRunning
        ? allHealthy
          ? "healthy"
          : "degraded"
        : "stopped",
      workers: workersHealth,
      startedAt: this.startedAt,
    };
  }
}

module.exports = WorkerManager;
