# 🔍 Analyse des Limites de Taille - Risques de Crash Serveur

## ⚠️ Résumé Exécutif

Cette analyse identifie **plusieurs limites de taille critiques** qui pourraient causer des crashes du serveur chat-file-service. Les problèmes potentiels sont classés par niveau de criticité.

---

## 🚨 LIMITES CRITIQUES IDENTIFIÉES

### 1. **Socket.IO - ABSENCE de maxHttpBufferSize (CRITIQUE)**

**Localisation:** `chat-file-service/src/index.js` ligne 204

```javascript
const io = new Server(server, {
  cors: {
    origin: ["*"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  // ❌ MANQUANT: maxHttpBufferSize
});
```

**Problème:** 
- La limite par défaut de Socket.IO est **1 MB** (1,048,576 bytes)
- Toute émission de message > 1 MB provoque une **déconnexion instantanée**
- Les messages avec fichiers, images encodées en base64, ou gros payloads JSON dépassent facilement cette limite

**Impact:**
- ✅ Crash de connexion WebSocket
- ✅ Déconnexion brutale des clients
- ✅ Perte de messages
- ✅ Erreur silencieuse côté serveur

**Solution Recommandée:**
```javascript
const io = new Server(server, {
  cors: {
    origin: ["*"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB (aligné avec express.json)
  pingTimeout: 60000,                   // 60s au lieu de 20s par défaut
  pingInterval: 25000,                  // 25s au lieu de 25s par défaut
});
```

---

### 2. **Express Body Parser - Limite 10 MB**

**Localisation:** `chat-file-service/src/index.js` ligne 189

```javascript
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
```

**Problème:**
- Les requêtes HTTP avec body JSON > 10 MB sont **rejetées avec erreur 413**
- Erreur: `PayloadTooLargeError: request entity too large`

**Scénarios à risque:**
- Envoi de messages avec plusieurs pièces jointes encodées en base64
- Métadonnées volumineuses de fichiers
- Bulk operations (suppression/édition massive)

**Solution:**
- ✅ Limite actuelle acceptable pour la plupart des cas
- ⚠️ Considérer 50 MB comme le gateway (`gateway/app.js` ligne 79)

---

### 3. **Upload Fichiers - Incohérence des Limites**

**Problème:** Limites divergentes entre les couches

#### a) Multer (Middleware Upload)
**Localisation:** `chat-file-service/src/interfaces/http/routes/fileRoutes.js`

```javascript
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // ✅ 100 MB max pour upload monolithique
  },
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 6 * 1024 * 1024, // 6 MB max par chunk
  },
});
```

#### b) ChunkedUploadService (Validation métier)
**Localisation:** `chat-file-service/src/infrastructure/services/ChunkedUploadService.js`

```javascript
this.maxChunkSize = 5 * 1024 * 1024;  // 5 MB par chunk
this.maxFileSize = 500 * 1024 * 1024; // 500 MB max total
```

#### c) FileStorageService
**Localisation:** `chat-file-service/src/infrastructure/services/FileStorageService.js`

```javascript
this.maxFileSize = config.maxFileSize || 1000 * 1024 * 1024; // 1000MB limit
```

#### d) Configuration Docker
**Localisation:** `docker-compose.yml` ligne 56

```yaml
FILE_MAX_SIZE: ${FILE_MAX_SIZE:-104857600}  # 100 MB par défaut
CHUNK_SIZE: ${CHUNK_SIZE:-5242880}         # 5 MB par défaut
```

**Incohérences détectées:**
| Couche | Upload Simple | Chunk Upload | Fichier Total |
|--------|---------------|--------------|---------------|
| Multer | **100 MB** | **6 MB** | - |
| ChunkedUploadService | - | **5 MB** | **500 MB** |
| FileStorageService | **1000 MB** | - | **1000 MB** |
| Docker Env | **100 MB** | **5 MB** | - |

**Risque:**
- Un chunk de 5.5 MB passe la validation métier (5 MB) mais est **rejeté par Multer** (6 MB)
- Incompréhension pour les développeurs et utilisateurs
- Erreurs 413 ou rejets silencieux

**Solution:**
Unifier toutes les limites:
```javascript
// Constantes centralisées
const FILE_LIMITS = {
  MAX_FILE_SIZE: 500 * 1024 * 1024,      // 500 MB
  MAX_CHUNK_SIZE: 5 * 1024 * 1024,       // 5 MB
  MAX_SIMPLE_UPLOAD: 100 * 1024 * 1024,  // 100 MB
  CHUNK_MULTER_MARGIN: 6 * 1024 * 1024,  // 6 MB (5 MB + marge de 1 MB)
};
```

---

### 4. **Gateway - Limite 50 MB pour Proxy**

**Localisation:** `gateway/app.js` ligne 79

```javascript
app.use(express.json({ limit: "50mb" }));
```

**Problème:**
- Le gateway accepte jusqu'à 50 MB
- Mais chat-file-service limite à **10 MB**
- Les requêtes 10-50 MB passent le gateway mais **échouent au service**

**Solution:**
Aligner les limites:
```javascript
// Gateway
app.use(express.json({ limit: "10mb" }));

// OU augmenter chat-file-service
app.use(express.json({ limit: "50mb" }));
```

---

### 5. **MongoDB - Pool de Connexions Limitées**

**Localisation:** `chat-file-service/src/infrastructure/mongodb/connection.js` ligne 30

```javascript
const options = {
  serverSelectionTimeoutMS: 5000,
  bufferCommands: false,
  maxPoolSize: 10,              // ⚠️ Seulement 10 connexions
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  heartbeatFrequencyMS: 10000,
  socketTimeoutMS: 45000,
};
```

**Problème:**
- Avec 10 connexions max, sous forte charge:
  - Les requêtes sont **mises en file d'attente**
  - Risque de timeout après 45s (socketTimeoutMS)
  - Crash possible si trop de requêtes simultanées

**Recommandation:**
```javascript
maxPoolSize: 50,  // Augmenter à 50 pour gérer les pics
minPoolSize: 10,
```

---

### 6. **Redis - Limites Mémoire**

**Localisation:** `auth-user-service/shared/redis/workers/MemoryMonitorWorker.js` ligne 13

```javascript
this.options = {
  checkIntervalMs: options.checkIntervalMs || 60000,
  memoryLimitMB: options.memoryLimitMB || 512,     // ⚠️ 512 MB par défaut
  warningThreshold: options.warningThreshold || 0.8,
  criticalThreshold: options.criticalThreshold || 0.9,
};
```

**Problème:**
- Limite de mémoire Redis fixée à **512 MB**
- Au-delà de 460 MB (90%), état critique
- Peut causer:
  - Éviction de clés importantes (cache utilisateurs)
  - Latence accrue
  - Échec d'écriture si mémoire pleine

**Configuration Docker manquante:**
Le `docker-compose.yml` ne définit **aucune limite mémoire** pour Redis:

```yaml
redis:
  image: redis:7-alpine
  # ❌ MANQUANT: mem_limit ou --maxmemory
```

**Solution:**
```yaml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --appendonly yes
    --appendfsync everysec
    --maxmemory 1gb
    --maxmemory-policy allkeys-lru
    --requirepass ${REDIS_PASSWORD:-}
  deploy:
    resources:
      limits:
        memory: 1.5G
```

---

### 7. **Node.js - Absence de Limite Mémoire Heap**

**Problème:**
Aucun script dans `package.json` ne définit `--max-old-space-size`

**Localisation:** 
- `chat-file-service/package.json`
- `gateway/package.json`
- `auth-user-service/package.json`

```json
"scripts": {
  "start": "node src/index.js",  // ❌ Pas de --max-old-space-size
  "dev": "nodemon src/index.js"
}
```

**Problème:**
- Limite par défaut Node.js : **~1.4 GB** (varie selon l'architecture)
- Traitement de fichiers volumineux (500 MB) peut saturer la heap
- Erreur: `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`

**Solution:**
```json
"scripts": {
  "start": "node --max-old-space-size=4096 src/index.js",  // 4 GB
  "dev": "nodemon --max-old-space-size=4096 src/index.js"
}
```

**Configuration Docker:**
```yaml
chat-file-service:
  environment:
    NODE_OPTIONS: "--max-old-space-size=4096"
```

---

### 8. **MessageDeliveryService - Limite de Messages par Lecture**

**Localisation:** `chat-file-service/src/infrastructure/services/MessageDeliveryService.js` ligne 253

```javascript
this.maxMessagesPerRead = 50; // ✅ Augmenté de 20→50 pour absorber les bursts
```

**Problème:**
- Limite de 50 messages par lecture de stream Redis
- Si > 50 messages en attente, ils restent en queue
- Peut causer **accumulation et latence croissante**

**Solution:**
- ✅ Valeur actuelle acceptable
- ⚠️ Monitorer les backlogs Redis (`XPENDING`)

---

## 📊 Tableau Récapitulatif des Limites

| Composant | Limite | Valeur | Critique | Action |
|-----------|--------|--------|----------|--------|
| **Socket.IO** | maxHttpBufferSize | ❌ **Non défini (1 MB)** | 🔴 **OUI** | **Ajouter 10 MB** |
| Express JSON | Body limit | 10 MB | 🟡 Moyen | Aligner avec gateway (50 MB) |
| Multer Upload | File size | 100 MB | 🟢 OK | - |
| Multer Chunk | Chunk size | 6 MB | 🟡 Moyen | Documenter marge |
| ChunkedUploadService | Max chunk | 5 MB | 🟢 OK | - |
| ChunkedUploadService | Max file | 500 MB | 🟢 OK | - |
| FileStorageService | Max file | 1000 MB | 🟡 Moyen | Aligner à 500 MB |
| Gateway | Body limit | 50 MB | 🟡 Moyen | Aligner à 10 MB |
| MongoDB | maxPoolSize | 10 | 🔴 **OUI** | **Augmenter à 50** |
| MongoDB | socketTimeout | 45s | 🟡 Moyen | OK |
| Redis | Memory limit | 512 MB | 🔴 **OUI** | **Augmenter à 1-2 GB** |
| Node.js | Heap size | ~1.4 GB (défaut) | 🔴 **OUI** | **Définir 4 GB** |
| MessageDeliveryService | Messages/read | 50 | 🟢 OK | - |

---

## 🛠️ Plan d'Action Prioritaire

### 🔴 **URGENT - À corriger immédiatement**

1. **Socket.IO maxHttpBufferSize**
   ```javascript
   // chat-file-service/src/index.js ligne ~204
   const io = new Server(server, {
     // ... config existante
     maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB
     pingTimeout: 60000,
     pingInterval: 25000,
   });
   ```

2. **Node.js Heap Size**
   ```json
   // chat-file-service/package.json
   "scripts": {
     "start": "node --max-old-space-size=4096 src/index.js",
     "dev": "nodemon --max-old-space-size=4096 src/index.js"
   }
   ```

3. **MongoDB Pool Size**
   ```javascript
   // chat-file-service/src/infrastructure/mongodb/connection.js
   maxPoolSize: 50,  // au lieu de 10
   minPoolSize: 10,  // au lieu de 5
   ```

4. **Redis Memory Limit**
   ```yaml
   # docker-compose.yml
   redis:
     command: >
       redis-server
       --maxmemory 2gb
       --maxmemory-policy allkeys-lru
       --requirepass ${REDIS_PASSWORD:-}
     deploy:
       resources:
         limits:
           memory: 2.5G
   ```

### 🟡 **IMPORTANT - À planifier**

5. **Aligner les limites Express/Gateway**
6. **Unifier les limites FileStorage (500 MB partout)**
7. **Documenter les marges de sécurité (chunk 6 MB vs 5 MB)**

---

## 🧪 Tests Recommandés

### Test 1: Socket.IO Large Payload
```javascript
// Envoyer un message > 1 MB
socket.emit("sendMessage", {
  conversationId: "test",
  content: "x".repeat(2 * 1024 * 1024), // 2 MB
});
// Avant fix: déconnexion
// Après fix: succès
```

### Test 2: Upload Chunk Limite
```bash
# Envoyer un chunk de 5.5 MB
curl -X POST http://localhost:8003/api/upload/chunk/test \
  -F "chunk=@chunk_5.5MB.bin" \
  -F "chunkIndex=0"
# Doit échouer avec message clair
```

### Test 3: Stress MongoDB Pool
```javascript
// Simuler 50 requêtes simultanées
await Promise.all(
  Array(50).fill().map(() => 
    Message.find({ conversationId: "test" })
  )
);
// Avant fix: timeouts après 10 connexions
// Après fix: toutes passent
```

---

## 📝 Conclusion

**3 limites critiques** peuvent causer des crashes:

1. ⚠️ **Socket.IO maxHttpBufferSize non défini** → Déconnexions silencieuses
2. ⚠️ **Node.js heap non configuré** → Out of memory sur gros fichiers
3. ⚠️ **MongoDB pool trop petit** → Timeouts sous charge

**Recommandation:** Appliquer les correctifs URGENTS en priorité, puis planifier les ajustements IMPORTANTS.
