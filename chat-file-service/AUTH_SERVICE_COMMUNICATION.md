# Communication chat-file-service ↔ auth-user-service

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture de communication](#architecture-de-communication)
3. [Flux d'authentification](#flux-dauthentification)
4. [Récupération des données utilisateurs](#récupération-des-données-utilisateurs)
5. [Configuration](#configuration)
6. [Gestion des erreurs](#gestion-des-erreurs)
7. [Optimisations et cache](#optimisations-et-cache)
8. [Exemples pratiques](#exemples-pratiques)

---

## Vue d'ensemble

Le **chat-file-service** communique avec le **auth-user-service** pour deux objectifs principaux :

1. **Authentification** : Validation des tokens JWT pour autoriser l'accès aux ressources
2. **Données utilisateurs** : Récupération des informations de profil (nom, avatar, matricule)

### Services concernés

| Service               | Port | Rôle                                         |
| --------------------- | ---- | -------------------------------------------- |
| **auth-user-service** | 8001 | Authentification et gestion des utilisateurs |
| **chat-file-service** | 8003 | Chat en temps réel et gestion de fichiers    |

---

## Architecture de communication

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT WEB/MOBILE                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ 1. Login (POST /login)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              AUTH-USER-SERVICE (Port 8001)                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Routes d'authentification                          │  │
│  │  • POST /login     → Génère JWT                     │  │
│  │  • POST /validate  → Vérifie JWT                    │  │
│  │  • POST /refresh   → Rafraîchit JWT                 │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Routes utilisateurs                                │  │
│  │  • GET /:id        → Profil utilisateur             │  │
│  │  • GET /all        → Liste utilisateurs             │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │ 2. JWT Token
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              CHAT-FILE-SERVICE (Port 8003)                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  AuthMiddleware                                     │  │
│  │  • Décode et vérifie le JWT localement             │  │
│  │  • Extrait userId et matricule                      │  │
│  │  • Pas d'appel HTTP à auth-user-service            │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  UserCacheService                                   │  │
│  │  ┌───────────────────────────────────────────────┐ │  │
│  │  │ 1. Vérifier Redis Cache                       │ │  │
│  │  │    ✓ Hit   → Retourne données                 │ │  │
│  │  │    ✗ Miss  → Fallback HTTP                    │ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  │  ┌───────────────────────────────────────────────┐ │  │
│  │  │ 2. HTTP vers auth-user-service                │ │  │
│  │  │    GET http://localhost:8001/:userId          │ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  │  ┌───────────────────────────────────────────────┐ │  │
│  │  │ 3. Cache Warming (mise en cache Redis)       │ │  │
│  │  │    TTL: 24 heures                             │ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Flux d'authentification

### 1. Génération du token (auth-user-service)

Lors de la connexion, l'utilisateur envoie ses identifiants au **auth-user-service** :

```javascript
// auth-user-service/src/interfaces/http/routes/authRoutes.js
router.post("/login", (req, res) => {
  authController.login(req, res);
});
```

**Processus de génération du JWT :**

```javascript
// auth-user-service/src/application/services/JwtService.js
generateToken(payload, expiresIn = "15m") {
  return jwt.sign(payload, this.secret, {
    expiresIn,
    algorithm: "HS256"
  });
}
```

**Payload du token JWT :**

```json
{
  "matricule": "MAT12345",
  "id": "507f1f77bcf86cd799439011",
  "iat": 1736862000,
  "exp": 1736862900
}
```

### 2. Validation du token (chat-file-service)

Le **chat-file-service** valide le JWT **localement** sans appel HTTP :

```javascript
// chat-file-service/src/interfaces/http/middleware/authMiddleware.js
static authenticate = (req, res, next) => {
  // Extraction du token (Bearer ou Cookie)
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;
  const cookieToken = req.cookies?.accessToken;
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({
      message: "Token d'authentification requis"
    });
  }

  // Vérification locale du JWT
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Injection dans req.user
  req.user = {
    id: decoded.id || decoded.matricule,
    userId: decoded.id || decoded.matricule,
    matricule: decoded.matricule
  };

  next();
};
```

**Points clés :**

- ✅ Pas d'appel HTTP à auth-user-service pour valider le token
- ✅ Validation locale via `jwt.verify()` avec le secret partagé
- ✅ Support double extraction : `Authorization: Bearer <token>` OU cookie `accessToken`

---

## Récupération des données utilisateurs

### Composant principal : UserCacheService

Le **UserCacheService** implémente une stratégie de cache multi-niveaux pour récupérer les informations utilisateurs :

```javascript
// chat-file-service/src/infrastructure/services/UserCacheService.js
class UserCacheService {
  constructor(options = {}) {
    this.authServiceUrl =
      process.env.AUTH_USER_SERVICE_URL || "http://localhost:8001";
    this.cacheTTL = 24 * 3600; // 24 heures
    this.timeout = 5000; // 5 secondes
  }
}
```

### Stratégie de récupération (3 niveaux)

#### Niveau 1 : Cache Redis (rapide)

```javascript
async _getFromCache(userId) {
  const redis = RedisManager?.clients?.main;
  const key = `user:cache:${userId}`;

  const data = await redis.hGetAll(key);

  if (data && Object.keys(data).length > 0) {
    return {
      userId,
      name: data.fullName || data.name,
      avatar: data.avatar || null,
      matricule: data.matricule || userId
    };
  }

  return null; // Cache miss
}
```

#### Niveau 2 : Fallback HTTP vers auth-user-service

```javascript
async _fetchFromAuthService(userId) {
  const response = await axios.get(
    `${this.authServiceUrl}/${userId}`,
    { timeout: this.timeout }
  );

  const user = response.data;

  // Normalisation des données
  const fullName = user.nom
    ? `${user.prenom || ""} ${user.nom}`.trim()
    : user.name || user.username || "Utilisateur inconnu";

  return {
    userId,
    name: fullName,
    avatar: user.profile_pic || user.avatar || null,
    matricule: user.matricule || userId
  };
}
```

**Endpoint auth-user-service appelé :**

```javascript
// auth-user-service/src/interfaces/http/routes/userRoutes.js
router.get("/:id", (req, res) => {
  userController.getUserById(req, res);
});
```

**Réponse attendue :**

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "matricule": "MAT12345",
  "nom": "Dupont",
  "prenom": "Jean",
  "profile_pic": "https://example.com/avatar.jpg",
  "email": "jean.dupont@example.com"
}
```

#### Niveau 3 : Cache Warming (repopulation Redis)

```javascript
async _saveToCache(userId, userInfo) {
  const redis = RedisManager?.clients?.main;
  const key = `user:cache:${userId}`;

  const cacheData = {
    fullName: userInfo.name || "Utilisateur inconnu",
    avatar: userInfo.avatar || "",
    matricule: userInfo.matricule || userId,
    updatedAt: Date.now().toString()
  };

  await redis.hSet(key, cacheData);
  await redis.expire(key, this.cacheTTL); // 24h
}
```

### Flux complet

```javascript
async fetchUserInfo(userId) {
  // 1. Tentative cache Redis
  const cached = await this._getFromCache(userId);
  if (cached) {
    console.log(`✅ [UserCache] Hit Redis: ${userId}`);
    return cached;
  }

  // 2. Fallback HTTP auth-user-service
  console.log(`⚠️ [UserCache] Miss Redis → Fallback HTTP: ${userId}`);
  const userInfo = await this._fetchFromAuthService(userId);

  // 3. Repopulation cache
  if (userInfo && userInfo.name) {
    await this._saveToCache(userId, userInfo);
  }

  return userInfo;
}
```

---

## Configuration

### Variables d'environnement

#### auth-user-service (.env)

```bash
# Port du service
AUTH_USER_SERVICE_PORT=8001

# Secret JWT (DOIT ÊTRE IDENTIQUE au chat-file-service)
JWT_SECRET=CENADI_CHATAPP_UNIFIED_SECRET_2024

# Base de données
MONGODB_URI=mongodb://localhost:27017/auth_user_db
# ou
DATABASE_URL=postgresql://user:password@localhost:5432/auth_db
```

#### chat-file-service (.env)

```bash
# Port du service
CHAT_FILE_SERVICE_PORT=8003

# Secret JWT (DOIT ÊTRE IDENTIQUE au auth-user-service)
JWT_SECRET=CENADI_CHATAPP_UNIFIED_SECRET_2024

# URL du service d'authentification
AUTH_USER_SERVICE_URL=http://localhost:8001

# Base de données
MONGODB_URI=mongodb://localhost:27017/chat_file_service

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

### ⚠️ Points critiques de configuration

| Paramètre                 | Importance    | Impact                                         |
| ------------------------- | ------------- | ---------------------------------------------- |
| **JWT_SECRET**            | 🔴 CRITIQUE   | Doit être **identique** dans les deux services |
| **AUTH_USER_SERVICE_URL** | 🟠 Important  | URL du auth-user-service pour les appels HTTP  |
| **REDIS_HOST/PORT**       | 🟡 Recommandé | Nécessaire pour le cache utilisateur           |

**⚠️ Si JWT_SECRET diffère :** Les tokens générés par auth-user-service seront **rejetés** par chat-file-service !

---

## Gestion des erreurs

### Erreurs d'authentification

```javascript
// Cas 1: Token manquant
{
  "success": false,
  "message": "Token d'authentification requis",
  "code": "MISSING_TOKEN"
}

// Cas 2: Token invalide/expiré
{
  "success": false,
  "message": "Token invalide ou expiré",
  "code": "INVALID_TOKEN"
}
```

### Erreurs de récupération utilisateur

```javascript
async _fetchFromAuthService(userId) {
  try {
    const response = await axios.get(`${this.authServiceUrl}/${userId}`);
    return this._normalizeUser(response.data);
  } catch (error) {
    if (error.response?.status === 404) {
      console.warn(`⚠️ Utilisateur ${userId} introuvable`);
    } else {
      console.warn(`⚠️ Erreur HTTP ${userId}:`, error.message);
    }

    // Fallback gracieux
    return {
      userId,
      name: "Utilisateur inconnu",
      avatar: null,
      matricule: userId
    };
  }
}
```

### Stratégies de résilience

1. **Timeout** : Les requêtes HTTP ont un timeout de 5 secondes
2. **Fallback gracieux** : En cas d'erreur, retourne des valeurs par défaut
3. **Cache Redis** : Réduit la dépendance aux appels HTTP
4. **Retry logic** : Possibilité d'ajouter des tentatives avec backoff exponentiel

---

## Optimisations et cache

### Structure du cache Redis

```
Key: user:cache:<userId>
Type: Hash
TTL: 86400 secondes (24 heures)

Champs:
- fullName: "Jean Dupont"
- avatar: "https://example.com/avatar.jpg"
- matricule: "MAT12345"
- updatedAt: "1736862000000"
```

### Métriques de performance

| Opération                | Avec cache | Sans cache     |
| ------------------------ | ---------- | -------------- |
| Récupération utilisateur | ~5 ms      | ~50-200 ms     |
| Batch 100 utilisateurs   | ~100 ms    | ~5-10 secondes |

### Invalidation du cache

```javascript
async invalidateUser(userId) {
  const redis = RedisManager?.clients?.main;
  const key = `user:cache:${userId}`;
  await redis.del(key);
  console.log(`🗑️ [UserCache] Invalidated ${userId}`);
}
```

**Cas d'usage :**

- Mise à jour du profil utilisateur
- Changement d'avatar
- Modification du nom/prénom

### Récupération batch (optimisée)

```javascript
async fetchUsersInfo(userIds) {
  const results = [];
  const missingIds = [];

  // Phase 1: Lecture batch Redis
  for (const userId of userIds) {
    const cached = await this._getFromCache(userId);
    if (cached) {
      results.push(cached);
    } else {
      missingIds.push(userId);
    }
  }

  // Phase 2: Fallback HTTP parallélisé
  if (missingIds.length > 0) {
    const requests = missingIds.map(id =>
      this._fetchFromAuthService(id)
    );
    const fetchedUsers = await Promise.all(requests);

    // Phase 3: Cache warming + merge
    for (const user of fetchedUsers) {
      results.push(user);
      await this._saveToCache(user.userId, user);
    }
  }

  return results;
}
```

---

## Exemples pratiques

### Exemple 1 : Authentification d'une requête HTTP

```bash
# Requête avec Bearer token
curl -X GET http://localhost:8003/messages \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Ou avec cookie
curl -X GET http://localhost:8003/messages \
  --cookie "accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Flux :**

1. AuthMiddleware extrait le token
2. Vérifie localement avec JWT_SECRET
3. Injecte `req.user = { id, matricule }`
4. Continue vers le contrôleur

### Exemple 2 : Connexion WebSocket avec authentification

```javascript
// Client
const socket = io("ws://localhost:8003", {
  auth: {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  },
});

// Serveur (chat-file-service)
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.userId = decoded.id || decoded.matricule;
    socket.matricule = decoded.matricule;

    next();
  } catch (error) {
    next(new Error("Authentication error"));
  }
});
```

### Exemple 3 : Affichage d'un message avec infos utilisateur

```javascript
// Dans un contrôleur de chat-file-service
async sendMessage(req, res) {
  const { conversationId, content } = req.body;
  const senderId = req.user.id; // Depuis AuthMiddleware

  // Récupération des infos de l'expéditeur
  const senderInfo = await userCacheService.fetchUserInfo(senderId);

  const message = await sendMessageUseCase.execute({
    conversationId,
    content,
    senderId,
    senderName: senderInfo.name,
    senderAvatar: senderInfo.avatar
  });

  res.json(message);
}
```

**Flux :**

1. Token JWT validé par middleware → `req.user.id`
2. UserCacheService vérifie Redis → **Cache hit** ✅
3. Pas d'appel HTTP à auth-user-service
4. Message envoyé avec infos complètes

### Exemple 4 : Première connexion (cache miss)

```javascript
// Premier accès d'un nouvel utilisateur
const userInfo = await userCacheService.fetchUserInfo(
  "507f1f77bcf86cd799439011"
);

// Logs attendus:
// ⚠️ [UserCache] Miss Redis → Fallback HTTP: 507f1f77bcf86cd799439011
// 💾 [UserCache] Cached 507f1f77bcf86cd799439011 (TTL: 86400s)
```

**Flux :**

1. Cache Redis vide → Miss
2. HTTP GET `http://localhost:8001/507f1f77bcf86cd799439011`
3. Réponse auth-user-service → Normalisation
4. Sauvegarde Redis avec TTL 24h
5. Retour des données au client

---

## Diagramme de séquence complet

```
┌────────┐         ┌─────────────────┐         ┌─────────────────┐
│ Client │         │ Chat-File       │         │ Auth-User       │
│        │         │ Service         │         │ Service         │
└───┬────┘         └────────┬────────┘         └────────┬────────┘
    │                       │                          │
    │ 1. POST /login        │                          │
    │───────────────────────┼─────────────────────────>│
    │                       │                          │
    │                       │  2. Génère JWT           │
    │                       │     (JwtService)         │
    │                       │<─────────────────────────│
    │                       │                          │
    │ 3. {token: "eyJ..."}  │                          │
    │<──────────────────────┤                          │
    │                       │                          │
    │ 4. GET /messages      │                          │
    │   Bearer eyJ...       │                          │
    │──────────────────────>│                          │
    │                       │                          │
    │                       │ 5. jwt.verify(token)     │
    │                       │    → req.user            │
    │                       │                          │
    │                       │ 6. Redis: user:cache:ID  │
    │                       │    (Cache Hit ✅)        │
    │                       │                          │
    │ 7. {messages: [...]}  │                          │
    │<──────────────────────┤                          │
    │                       │                          │
    │                       │                          │
    │ 8. GET /messages      │                          │
    │   (Nouvel user)       │                          │
    │──────────────────────>│                          │
    │                       │                          │
    │                       │ 9. Redis: Cache Miss ❌  │
    │                       │                          │
    │                       │ 10. GET /:userId         │
    │                       │─────────────────────────>│
    │                       │                          │
    │                       │ 11. {user data}          │
    │                       │<─────────────────────────│
    │                       │                          │
    │                       │ 12. Redis.hSet()         │
    │                       │     (Cache Warming)      │
    │                       │                          │
    │ 13. {messages: [...]} │                          │
    │<──────────────────────┤                          │
    │                       │                          │
```

---

## Résumé des interactions

| Interaction                  | Fréquence           | Cache     | Méthode                   |
| ---------------------------- | ------------------- | --------- | ------------------------- |
| **Validation JWT**           | Chaque requête HTTP | Non       | Local (jwt.verify)        |
| **Récupération utilisateur** | Selon cache         | Oui (24h) | HTTP GET /:id             |
| **Batch utilisateurs**       | Conversations       | Oui (24h) | HTTP GET /:id (parallèle) |
| **Invalidation cache**       | Rare                | N/A       | Redis DEL                 |

---

## Recommandations

### Sécurité

1. ✅ **JWT_SECRET** : Utiliser une clé forte (32+ caractères aléatoires)
2. ✅ **HTTPS en production** : Chiffrer la communication entre services
3. ✅ **Rotation des secrets** : Planifier un renouvellement régulier
4. ✅ **Rate limiting** : Limiter les appels au auth-user-service

### Performance

1. ✅ **Maximiser le cache hit rate** : TTL 24h adapté
2. ✅ **Batch requests** : Regrouper les requêtes utilisateurs
3. ✅ **Connexion keep-alive** : Réutiliser les connexions HTTP
4. ✅ **Monitoring** : Tracer les métriques de cache (hit/miss)

### Résilience

1. ✅ **Timeout court** : 5 secondes max pour les appels HTTP
2. ✅ **Fallback gracieux** : Retourner des valeurs par défaut
3. ✅ **Circuit breaker** : Arrêter les appels si auth-user-service down
4. ✅ **Health checks** : Vérifier régulièrement la disponibilité

---

## Troubleshooting

### Problème : "Token invalide ou expiré"

**Causes possibles :**

- JWT_SECRET différent entre les services
- Token expiré (> 15 minutes)
- Format du token incorrect

**Solution :**

```bash
# Vérifier les secrets
grep JWT_SECRET auth-user-service/.env
grep JWT_SECRET chat-file-service/.env

# Vérifier l'expiration du token
node -e "console.log(require('jsonwebtoken').decode('eyJ...'))"
```

### Problème : "Utilisateur inconnu" affiché

**Causes possibles :**

- Cache Redis vide + auth-user-service down
- Utilisateur réellement absent de la DB
- Timeout HTTP dépassé

**Solution :**

```bash
# Tester la disponibilité auth-user-service
curl http://localhost:8001/507f1f77bcf86cd799439011

# Vérifier le cache Redis
redis-cli HGETALL "user:cache:507f1f77bcf86cd799439011"

# Vérifier les logs
tail -f chat-file-service/logs/app.log | grep UserCache
```

### Problème : Performances dégradées

**Causes possibles :**

- Cache hit rate faible
- Trop d'appels HTTP au auth-user-service
- Redis surchargé

**Solution :**

```bash
# Vérifier les métriques Redis
redis-cli INFO stats

# Analyser les logs de performance
grep "UserCache" chat-file-service/logs/app.log | grep -E "Hit|Miss"

# Augmenter le TTL si besoin
# Dans chat-file-service/src/infrastructure/services/UserCacheService.js
this.cacheTTL = 48 * 3600; // 48 heures au lieu de 24
```

---

## Liens utiles

- [Architecture globale](../README.md)
- [Documentation JWT](https://jwt.io/introduction)
- [Redis Caching Best Practices](https://redis.io/docs/manual/patterns/caching/)
- [Express Authentication Guide](https://expressjs.com/en/advanced/best-practice-security.html)

---

**Dernière mise à jour :** 14 janvier 2026  
**Version :** 1.0.0  
**Auteur :** Documentation CENADI ChatApp
