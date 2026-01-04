# 🔄 Guide de Migration - Intégration du Service Redis Partagé

## Vue d'Ensemble

Ce guide explique comment les autres services de l'application peuvent être migrés vers l'utilisation du Service Redis Partagé, en suivant le modèle appliqué à `ResilientMessageService.js`.

---

## Principes de Migration

### 1. **Identifiez les Duplications**

Recherchez dans vos services :

- ❌ Configurations de streams locales (STREAMS, MULTI_STREAMS, STREAM_MAXLEN)
- ❌ Implémentations manuelles d'`addToStream()`, `readFromStream()`
- ❌ Monitoring manuels (intervalles pour mémoire, streams, métriques)
- ❌ Instanciations individuelles des workers (RetryWorker, FallbackWorker, etc.)

### 2. **Remplacez par des Services Partagés**

Importez depuis `@chatapp-ngomna/shared` :

```javascript
const {
  CircuitBreaker,
  StreamManager,
  WorkerManager,
} = require("@chatapp-ngomna/shared");
```

### 3. **Déléguez les Opérations**

Utilisez les wrappers du service partagé au lieu des implémentations locales.

---

## Étapes de Migration Détaillées

### Étape 1 : Audit du Service

```javascript
// ✅ Cherchez ces patterns dans votre code

// Pattern 1 : Configs dupliquées
this.STREAMS = { ... };
this.STREAM_MAXLEN = { ... };

// Pattern 2 : Monitoring manuel
this.memoryMonitorInterval = setInterval(() => { ... }, 60000);
this.metricsInterval = setInterval(() => { ... }, 3600000);

// Pattern 3 : Workers manuels
this.workers = {
  retryWorker: null,
  fallbackWorker: null,
};

// Pattern 4 : Initialisation manuelle
async addToStream(streamName, fields) {
  const streamId = await this.redis.xAdd(...);
  await this.redis.xTrim(...);
  return streamId;
}
```

### Étape 2 : Remplacez le Constructor

#### Avant

```javascript
constructor(redisClient, repo) {
  this.redis = redisClient;
  this.repo = repo;

  // ❌ Configurations dupliquées
  this.STREAMS = {
    MAIN: "stream:main",
    RETRY: "stream:retry",
    DLQ: "stream:dlq",
  };

  // ❌ Monitoring manuel
  if (this.redis) {
    this.startMemoryMonitor();
    this.startMetricsReporting();
  }
}
```

#### Après

```javascript
constructor(redisClient, repo) {
  this.redis = redisClient;
  this.repo = repo;

  // ✅ Importer le StreamManager
  const { StreamManager, WorkerManager } = require("@chatapp-ngomna/shared");

  // ✅ Instancier les composants partagés
  this.streamManager = new StreamManager(this.redis);

  // ✅ Utiliser les configs partagées
  this.STREAMS = this.streamManager.STREAMS;
  this.STREAM_MAXLEN = this.streamManager.STREAM_MAXLEN;

  // ✅ Instancier WorkerManager
  this.workerManager = new WorkerManager(this.streamManager, this.redis);

  // ✅ Initialiser les workers
  this.initializeWorkers();

  console.log("✅ Service initialisé avec les composants partagés");
}

initializeWorkers() {
  const callbacks = {
    save: this.saveData.bind(this),
    publish: this.publishEvent.bind(this),
    dlq: this.handleDLQ.bind(this),
  };
  this.workerManager.initialize(callbacks);
  this.workerManager.startAll();
}
```

### Étape 3 : Remplacez les Opérations Stream

#### Avant

```javascript
async addToStream(streamName, fields) {
  if (!this.redis) return null;

  try {
    const normalizedFields = {};
    for (const [key, value] of Object.entries(fields || {})) {
      normalizedFields[key] = String(value || "");
    }

    const streamId = await this.redis.xAdd(streamName, "*", normalizedFields);

    const maxLen = this.STREAM_MAXLEN[streamName];
    if (maxLen) {
      this.redis.xTrim(streamName, "~", maxLen).catch(() => {});
    }

    return streamId;
  } catch (err) {
    console.warn(`Erreur addToStream ${streamName}:`, err.message);
    return null;
  }
}

async readFromStream(streamName) {
  try {
    const messages = await this.redis.xRead([{ key: streamName, id: "0" }]);
    // ... parsing logic
    return messages;
  } catch (err) {
    console.error("Erreur readFromStream:", err.message);
    return [];
  }
}
```

#### Après

```javascript
async addToStream(streamName, fields) {
  return this.streamManager.addToStream(streamName, fields);
}

async readFromStream(streamName, options = {}) {
  const messages = await this.streamManager.readFromStream(streamName, options);
  return messages.map(entry => this.streamManager.parseStreamMessage(entry));
}

async deleteFromStream(streamName, messageId) {
  return this.streamManager.deleteFromStream(streamName, messageId);
}

async getStreamLength(streamName) {
  return this.streamManager.getStreamLength(streamName);
}
```

### Étape 4 : Supprimez les Monitoring Manuels

#### À Supprimer

```javascript
// ❌ À SUPPRIMER
async startMemoryMonitor() {
  this.memoryMonitorInterval = setInterval(async () => {
    const info = await this.redis.info("memory");
    // ... monitoring logic
  }, 60000);
}

async startStreamMonitoring() {
  this.monitoringInterval = setInterval(async () => {
    // ... stream monitoring logic
  }, 60000);
}

startMetricsReporting() {
  this.metricsInterval = setInterval(() => {
    // ... metrics logic
  }, 3600000);
}
```

**Raison** : Ces fonctionnalités sont maintenant fournies par les workers du `WorkerManager`.

### Étape 5 : Mettez à Jour le Cycle de Vie

#### Avant

```javascript
async startWorkers() {
  this.workerInterval = setInterval(() => this.processQueue(), 1000);
  this.dlqInterval = setInterval(() => this.processDLQ(), 5000);
}

stopWorkers() {
  clearInterval(this.workerInterval);
  clearInterval(this.dlqInterval);
  clearInterval(this.memoryMonitorInterval);
  clearInterval(this.metricsInterval);
}
```

#### Après

```javascript
async startWorkers() {
  this.workerManager.startAll();
}

stopWorkers() {
  this.workerManager.stopAll();
}

stopAll() {
  this.workerManager.stopAll();
  // Autres cleanups spécifiques
  console.log("✅ Service arrêté complètement");
}
```

### Étape 6 : Ajoutez les Méthodes de Santé

```javascript
getMetrics() {
  const workerMetrics = this.workerManager?.getAllMetrics() || {};
  return {
    service: {
      processedMessages: this.metrics.processedMessages || 0,
      errors: this.metrics.errors || 0,
      // ... autres métriques spécifiques
    },
    workers: workerMetrics.workers,
    uptime: workerMetrics.uptime,
    circuitBreakerState: this.circuitBreaker?.state,
  };
}

getHealthStatus() {
  return {
    status: this.isRunning ? "RUNNING" : "STOPPED",
    workers: this.workerManager?.getHealthStatus(),
    streams: this.getStreamStats(),
    redis: this.redis ? "CONNECTED" : "DISCONNECTED",
    timestamp: new Date().toISOString(),
  };
}
```

---

## Checklist de Migration

### Pour Chaque Service

- [ ] **Audit** : Identifiez les patterns à remplacer
- [ ] **Imports** : Importez les composants partagés
- [ ] **Constructor** : Instanciez `StreamManager` et `WorkerManager`
- [ ] **Configurations** : Utilisez les configs du `StreamManager`
- [ ] **Opérations Stream** : Remplacez par des wrappers
- [ ] **Monitoring** : Supprimez les monitoring manuels
- [ ] **Workers** : Utilisez `WorkerManager.startAll()` / `stopAll()`
- [ ] **Métriques** : Ajoutez `getMetrics()` et `getHealthStatus()`
- [ ] **Tests** : Vérifiez que la logique fonctionne
- [ ] **Validation** : Exécutez les tests d'intégration

---

## Services Candidats pour Migration

### 1. **MessageDeliveryService** 🔄

**Chemin** : `/chat-file-service/src/infrastructure/services/MessageDeliveryService.js`

**Duplications Identifiées** :

- Config streams locale
- Monitoring mémoire manuel
- processRetries() / processDLQ() manuels

**Estimé** : 2-3 heures

### 2. **MediaProcessingService** 📦

**Chemin** : `/chat-file-service/src/infrastructure/services/MediaProcessingService.js`

**Duplications Identifiées** :

- Config streams pour uploads
- Monitoring manuel

**Estimé** : 1-2 heures

### 3. **NotificationService** 🔔

**Chemin** : Si existe...

**Duplications Identifiées** :

- Gestion des événements via streams
- Monitoring des queues

**Estimé** : 1-2 heures

---

## Exemple Complet : ThumbnailService

### Avant

```javascript
class ThumbnailService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.STREAMS = {
      JOBS: "thumbnail:jobs",
      RESULTS: "thumbnail:results",
    };
    this.startWorkers();
  }

  async startWorkers() {
    this.jobInterval = setInterval(() => this.processJobs(), 1000);
  }

  stopWorkers() {
    clearInterval(this.jobInterval);
  }
}
```

### Après

```javascript
const { StreamManager, WorkerManager } = require("@chatapp-ngomna/shared");

class ThumbnailService {
  constructor(redisClient) {
    this.redis = redisClient;

    // ✅ Utiliser le StreamManager
    this.streamManager = new StreamManager(this.redis);
    this.STREAMS = this.streamManager.STREAMS;

    // ✅ Utiliser le WorkerManager
    this.workerManager = new WorkerManager(this.streamManager, this.redis);
    this.initializeWorkers();
  }

  initializeWorkers() {
    const callbacks = {
      process: this.generateThumbnail.bind(this),
      dlq: this.handleFailed.bind(this),
    };
    this.workerManager.initialize(callbacks);
    this.workerManager.startAll();
  }

  async startWorkers() {
    this.workerManager.startAll();
  }

  stopWorkers() {
    this.workerManager.stopAll();
  }

  async addJob(mediaId, options) {
    return this.streamManager.addToStream(this.STREAMS.JOBS, {
      mediaId,
      options: JSON.stringify(options),
      timestamp: Date.now().toString(),
    });
  }

  getMetrics() {
    const workerMetrics = this.workerManager?.getAllMetrics() || {};
    return {
      service: {
        jobsProcessed: this.metrics.jobsProcessed || 0,
      },
      workers: workerMetrics.workers,
      uptime: workerMetrics.uptime,
    };
  }
}
```

---

## Avantages de la Migration

### Immédiats

✅ Code plus propre (-200+ lignes)  
✅ Maintenance centralisée  
✅ Une source de vérité

### À Long Terme

✅ Mise à jour simple (un seul endroit)  
✅ Monitoring cohérent  
✅ Résilience garantie  
✅ Performance optimisée

---

## Ordre Recommandé de Migration

1. **ResilientMessageService** ✅ (FAIT)
2. **MessageDeliveryService** ⏳
3. **MediaProcessingService** ⏳
4. **ThumbnailService** ⏳
5. **Autres services** ⏳

---

## Troubleshooting Migration

### Problème : "StreamManager not found"

```javascript
// Vérifier l'import
const { StreamManager, WorkerManager } = require("@chatapp-ngomna/shared");
```

### Problème : "Callbacks not working"

```javascript
// Vérifier que initializeWorkers() utilise bind()
const callbacks = {
  save: this.saveData.bind(this), // ✅ bind() requis
};
```

### Problème : "Old methods still called"

```javascript
// Remplacer les appels directs
// ❌ await this.redis.xAdd(...)
// ✅ await this.streamManager.addToStream(...)
```

---

## Ressources

- **StreamManager** : `shared/resilience/StreamManager.js`
- **WorkerManager** : `shared/redis/workers/WorkerManager.js`
- **CircuitBreaker** : `shared/resilience/CircuitBreaker.js`
- **Exemple** : `ResilientMessageService.js` (modèle de référence)

---

**Dernière Mise à Jour** : 2026-01-04  
**Auteur** : GitHub Copilot  
**Statut** : Prêt pour Migration
