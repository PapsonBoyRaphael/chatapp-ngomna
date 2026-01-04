# Guide de Validation - ResilientMessageService.js

## Checklist de Vérification

### ✅ Code Cleanup

- [x] Imports bien structurés (CircuitBreaker, StreamManager, WorkerManager)
- [x] Constructor simplifié (plus de code dupliqué pour configs)
- [x] Méthodes de monitoring supprimées (startMemoryMonitor, startStreamMonitoring, startMetricsReporting)
- [x] isIoRedis() supprimée
- [x] addToStream() est un simple wrapper vers StreamManager

### ✅ WorkerManager Integration

- [x] WorkerManager initialisé dans constructor
- [x] initializeWorkers() crée les callbacks personnalisés
- [x] startWorkers() utilise workerManager.startAll()
- [x] stopWorkers() utilise workerManager.stopAll()
- [x] stopAll() s'appuie sur WorkerManager pour cleanup

### ✅ Méthodes Critiques

- [x] logPreWrite() → utilise this.addToStream()
- [x] logPostWrite() → utilise this.addToStream()
- [x] addRetry() → utilise this.addToStream()
- [x] addToDLQ() → utilise this.addToStream()
- [x] redisFallback() → utilise this.addToStream()
- [x] publishToMessageStream() → utilise this.addToStream()

### ✅ Nouvelles Méthodes

- [x] getMetrics() → retourne les métriques du service + workers
- [x] getHealthStatus() → retourne l'état du service

---

## Tests Unitaires Recommandés

### 1. Test d'Initialisation

```javascript
describe("ResilientMessageService Initialization", () => {
  it("should initialize with StreamManager and WorkerManager", async () => {
    const service = new ResilientMessageService(redis, repo);
    expect(service.streamManager).toBeDefined();
    expect(service.workerManager).toBeDefined();
    expect(service.STREAMS).toBeDefined();
    expect(service.STREAMS).toBe(service.streamManager.STREAMS);
  });

  it("should initialize workers on construction", async () => {
    const service = new ResilientMessageService(redis, repo);
    expect(service.workerManager.getAllMetrics).toBeDefined();
  });
});
```

### 2. Test des Opérations Stream

```javascript
describe("Stream Operations via StreamManager", () => {
  it("should delegate addToStream to StreamManager", async () => {
    const spy = jest.spyOn(service.streamManager, "addToStream");
    await service.addToStream("test:stream", { data: "test" });
    expect(spy).toHaveBeenCalled();
  });

  it("should delegate readFromStream to StreamManager", async () => {
    const spy = jest.spyOn(service.streamManager, "readFromStream");
    await service.readFromStream("test:stream");
    expect(spy).toHaveBeenCalled();
  });
});
```

### 3. Test des Métriques

```javascript
describe("Metrics and Health", () => {
  it("should return combined metrics from service and workers", () => {
    const metrics = service.getMetrics();
    expect(metrics.service).toBeDefined();
    expect(metrics.workers).toBeDefined();
    expect(metrics.circuitBreakerState).toBeDefined();
  });

  it("should return health status", () => {
    const health = service.getHealthStatus();
    expect(health.status).toMatch(/RUNNING|STOPPED|ERROR/);
    expect(health.circuitBreaker).toBeDefined();
    expect(health.workers).toBeDefined();
  });
});
```

### 4. Test du Cycle de Vie

```javascript
describe("Service Lifecycle", () => {
  it("should start workers via WorkerManager", async () => {
    const spy = jest.spyOn(service.workerManager, "startAll");
    await service.startWorkers();
    expect(spy).toHaveBeenCalled();
  });

  it("should stop workers via WorkerManager", () => {
    const spy = jest.spyOn(service.workerManager, "stopAll");
    service.stopWorkers();
    expect(spy).toHaveBeenCalled();
  });

  it("should stop all components cleanly", () => {
    const spyWorkers = jest.spyOn(service.workerManager, "stopAll");
    service.stopAll();
    expect(spyWorkers).toHaveBeenCalled();
  });
});
```

---

## Tests d'Intégration

### Test 1 : Flux Complet de Résilience

```javascript
it("should handle message failure and fallback", async () => {
  // 1. Envoyer un message (Mongo échoue)
  const result = await service.receiveMessage({
    _id: "msg-123",
    conversationId: "conv-456",
    senderId: "user-789",
    content: "Test message",
  });

  // 2. Vérifier que le fallback a été activé
  expect(result.success).toBe(true);
  expect(result.message.fromFallback).toBe(true);

  // 3. Vérifier les métriques
  const metrics = service.getMetrics();
  expect(metrics.service.fallbackActivations).toBeGreaterThan(0);
});
```

### Test 2 : WAL Logging

```javascript
it("should log pre-write and post-write WAL entries", async () => {
  const messageData = {
    _id: "msg-456",
    conversationId: "conv-789",
    senderId: "user-123",
    content: "Test",
  };

  // 1. Log pre-write
  const walId = await service.logPreWrite(messageData);
  expect(walId).toBeDefined();

  // 2. Vérifier que l'entrée est dans le stream WAL
  const walEntries = await redis.xRange(service.STREAMS.WAL, "-", "+");
  expect(walEntries.length).toBeGreaterThan(0);

  // 3. Log post-write
  await service.logPostWrite(messageData._id, walId);

  // 4. Vérifier que l'entrée a été supprimée
  const walEntriesAfter = await redis.xRange(service.STREAMS.WAL, "-", "+");
  expect(walEntriesAfter.length).toBeLessThan(walEntries.length);
});
```

### Test 3 : Streams Multi-Types

```javascript
it("should publish to correct multi-stream based on message type", async () => {
  // Message privé (avec receiverId)
  const privateMsg = { content: "private", receiverId: "user-xyz" };
  await service.publishToMessageStream(privateMsg);

  const privateStreamLen = await redis.xLen(service.MULTI_STREAMS.PRIVATE);
  expect(privateStreamLen).toBeGreaterThan(0);

  // Message de groupe
  const groupMsg = { content: "group", conversationId: "conv-123" };
  await service.publishToMessageStream(groupMsg);

  const groupStreamLen = await redis.xLen(service.MULTI_STREAMS.GROUP);
  expect(groupStreamLen).toBeGreaterThan(0);
});
```

---

## Tests de Charge

### Scenario 1 : Envoi Massif de Messages

```javascript
it("should handle 1000 messages without errors", async () => {
  const messages = Array.from({ length: 1000 }, (_, i) => ({
    _id: `msg-${i}`,
    conversationId: "conv-1",
    senderId: "user-1",
    content: `Message ${i}`,
  }));

  const results = await Promise.all(
    messages.map((msg) => service.receiveMessage(msg))
  );

  expect(results.every((r) => r.success)).toBe(true);

  const metrics = service.getMetrics();
  expect(metrics.service.totalMessages).toBe(1000);
});
```

### Scenario 2 : Memory Monitoring

```javascript
it("should monitor memory via MemoryMonitorWorker", async () => {
  await service.startWorkers();

  // Attendre 2 secondes pour que le monitoring se lance
  await new Promise((r) => setTimeout(r, 2000));

  const metrics = service.getMetrics();
  expect(metrics.workers.MemoryMonitor).toBeDefined();
  expect(metrics.workers.MemoryMonitor.peakMemoryMB).toBeGreaterThan(0);

  service.stopAll();
});
```

---

## Validation Manuel

### 1. Vérification de la Console

Au démarrage, vous devriez voir :

```
✅ ResilientMessageService initialisé (Intégration shared + StreamManager + WorkerManager)
✅ Workers initialisés et démarrés via WorkerManager
```

Au Arrêt :

```
🛑 Arrêt complet du service...
✅ Service arrêté complètement
```

### 2. Vérification des Configurations

```javascript
const service = new ResilientMessageService(redis, repo);
console.log(service.STREAMS); // Doit matcher StreamManager.STREAMS
console.log(service.MULTI_STREAMS); // Doit matcher StreamManager.MULTI_STREAMS
console.log(service.STREAM_MAXLEN); // Doit matcher StreamManager.STREAM_MAXLEN
```

### 3. Vérification des Méthodes

```javascript
// Ces appels doivent exister et fonctionner
service.getMetrics(); // ✅
service.getHealthStatus(); // ✅
await service.startWorkers(); // ✅
service.stopWorkers(); // ✅
service.stopAll(); // ✅
```

---

## Checklist Pré-Production

- [ ] Tous les tests unitaires passent
- [ ] Les tests d'intégration passent
- [ ] Les tests de charge passent (1000+ messages)
- [ ] Pas de fuites mémoire (vérifier avec `getMetrics()`)
- [ ] Circuit breaker fonctionne correctement
- [ ] WAL logging fonctionne
- [ ] Fallback/Retry/DLQ opérationnels
- [ ] Les workers se lancent et s'arrêtent correctement
- [ ] Pas de console.error() au démarrage
- [ ] Pas de console.error() à l'arrêt

---

## Troubleshooting

### Problème : Workers ne démarrent pas

**Solution** : Vérifier que `WorkerManager` a été initialisé dans le constructor

```javascript
if (!service.workerManager) {
  console.error("WorkerManager non initialisé");
}
```

### Problème : Métriques vides

**Solution** : Appeler `service.startWorkers()` avant d'accéder aux métriques

```javascript
await service.startWorkers();
const metrics = service.getMetrics();
```

### Problème : addToStream échoue silencieusement

**Solution** : Vérifier que `StreamManager` est correctement initialisé

```javascript
if (!service.streamManager) {
  console.error("StreamManager non initialisé");
}
```

---

**Statut** : ✅ Prêt pour tests et déploiement
