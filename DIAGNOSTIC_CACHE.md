# 🔍 Diagnostic - Pourquoi la Conversation Est Récupérée Sans Cesse de MongoDB

## Problem Statement

Les conversations sont récupérées depuis MongoDB à chaque appel, au lieu d'être servies depuis le cache Redis. Cela cause :

- ⚠️ Charge inutile sur MongoDB
- 🐌 Latence plus élevée pour l'utilisateur
- 💾 Inefficacité du cache

---

## 🎯 Trois Causes Possibles

### **Cause #1: Cache Non Initialisé (CRITIQUE)**

#### Symptômes

```
⚠️ CachedConversationRepository: cacheService est null - CACHE DÉSACTIVÉ
⚠️ Cela signifie que chaque conversation sera récupérée depuis MongoDB
```

#### Raison

- Redis n'a pas réussi à se connecter
- `cacheServiceInstance` est resté `null` dans index.js
- `CachedConversationRepository` a été créé avec `cacheService = null`

#### Solution

1. Vérifiez les logs de démarrage pour voir s'il y a :

   ```
   ✅ RedisManager (shared) connecté et prêt
   ```

   ou

   ```
   ⚠️ Redis non disponible: ...
   ```

2. Si Redis échoue, vérifiez :
   - `REDIS_HOST` et `REDIS_PORT` dans `.env`
   - Que le serveur Redis est en cours d'exécution
   - Que le port Redis est accessible (default: 6379)

#### Test

```bash
# Vérifier que Redis est accessible
redis-cli ping
# Output: PONG
```

---

### **Cause #2: Cache Hit Échoue Silencieusement**

#### Symptômes

```
🔍 Vérification cache pour: 60f7b3b3b3b3b3b3b3b3b3b6
📦 ❌ MISS CACHE: Conversation non en cache
🔍 Récupération depuis MongoDB: 60f7b3b3b3b3b3b3b3b3b3b6
💾 ✅ Conversation mise en cache (TTL: 3600s)
```

À chaque appel identique, vous voyez MISS CACHE.

#### Raison

Possible :

- Erreur lors de `cache.set()` (JSON non sérialisable)
- Erreur lors de `cache.get()` (JSON corrompu)
- Erreur réseau Redis intermittente

#### Solution

Regardez les logs pour :

```
❌ Erreur parsing JSON en cache pour clé '...':
❌ Erreur stringify JSON pour clé '...':
⚠️ Cache set error:
```

Si vous voyez ces erreurs :

1. La conversation est peut-être contient des données non-sérialisables
2. Vérifiez que l'objet conversation ne contient pas de:
   - Fonctions
   - Références circulaires
   - Streams/Buffers
   - `undefined`

#### Test

```javascript
// Dans SendMessage.js ou le controller d'envoi, après conversationRepository.findById():
console.log(
  "Conversation à mettre en cache:",
  JSON.stringify(conversation, null, 2)
);
```

---

### **Cause #3: Cache Expiré / Supprimé Accidentellement**

#### Symptômes

```
🔍 Vérification cache pour: 60f7b3b3b3b3b3b3b3b3b3b6
📦 ❌ MISS CACHE: Conversation non en cache
💾 ✅ Conversation mise en cache (TTL: 3600s)
```

Puis plus tard (< 3600s):

```
📦 ❌ MISS CACHE: Conversation non en cache
```

#### Raison

- TTL expiré (3600s = 1 heure)
- Cache supprimé manuellement/accidentellement
- Limitation de mémoire Redis

#### Solution

1. Vérifiez la TTL configurée dans `CachedConversationRepository`:

   ```javascript
   this.defaultTTL = 3600; // 1 heure
   ```

2. Regardez si quelque chose supprime le cache involontairement:

   ```bash
   redis-cli MONITOR  # Voir toutes les opérations Redis
   ```

3. Vérifiez la mémoire Redis utilisée:
   ```bash
   redis-cli INFO memory
   ```

---

## ✅ Comment Vérifier Que Le Cache Fonctionne

### **Logs Attendus - Cache Qui Fonctionne**

**Premier appel (MISS):**

```
✅ CachedConversationRepository: Cache activé
🔍 Vérification cache pour: 60f7b3b3b3b3b3b3b3b3b3b6
📦 ❌ MISS CACHE: Conversation non en cache
🔍 Récupération depuis MongoDB: 60f7b3b3b3b3b3b3b3b3b6
💾 ✅ Conversation mise en cache (TTL: 3600s)
```

**Appel suivant (HIT) - même conversationId en < 3600s:**

```
🔍 Vérification cache pour: 60f7b3b3b3b3b3b3b3b3b3b6
📦 ✅ HIT CACHE: Conversation trouvée en cache
```

**Pas de "Récupération depuis MongoDB" en second appel** = Cache fonctionne !

---

## 🛠️ Checklist de Diagnostic

- [ ] **Redis Connecté ?**

  - Logs montrent `✅ RedisManager (shared) connecté et prêt` ?
  - `redis-cli ping` répond `PONG` ?

- [ ] **Cache Initialisé ?**

  - Logs montrent `✅ CachedConversationRepository: Cache activé` ?
  - Pas de `⚠️ cacheService est null - CACHE DÉSACTIVÉ` ?

- [ ] **Cache Hit/Miss Correct ?**

  - Premier appel = MISS CACHE ✓
  - Appel suivant (< 3600s) = HIT CACHE ✓
  - Pas de "Récupération depuis MongoDB" au 2e appel ✓

- [ ] **Pas d'Erreurs JSON ?**

  - Pas de `❌ Erreur parsing JSON` ?
  - Pas de `❌ Erreur stringify JSON` ?

- [ ] **Redis Mémoire OK ?**
  - `redis-cli INFO memory` montre suffisamment de mémoire libre ?
  - Pas de `used_memory` proche de `maxmemory` ?

---

## 🔧 Commandes Utiles

### Vérifier le Contenu du Cache

```bash
# Lister toutes les clés de conversation en cache
redis-cli KEYS "chat:convs:id:*"

# Voir la conversation en cache
redis-cli GET "chat:convs:id:60f7b3b3b3b3b3b3b3b3b3b6"

# TTL restant
redis-cli TTL "chat:convs:id:60f7b3b3b3b3b3b3b3b3b3b6"
# Résultat > 0 = encore en cache
# Résultat = -1 = pas de TTL (erreur)
# Résultat = -2 = clé inexistante
```

### Supprimer le Cache (pour tester)

```bash
# Supprimer une conversation du cache
redis-cli DEL "chat:convs:id:60f7b3b3b3b3b3b3b3b3b3b6"

# Vider tout le cache de conversations
redis-cli FLUSHDB
```

### Monitorer le Cache en Temps Réel

```bash
# Voir toutes les opérations Redis en live
redis-cli MONITOR

# Puis envoyez un message et observez les opérations
```

---

## 📊 Comportement Normal vs Bugué

| Scénario           | Normal                     | Bug                         |
| ------------------ | -------------------------- | --------------------------- |
| Cache initialisé   | `✅ Cache activé`          | `⚠️ Cache désactivé`        |
| 1er appel          | MISS → MongoDB → SET cache | MISS → MongoDB → pas de SET |
| 2e appel (< 3600s) | HIT → Redis (pas MongoDB)  | MISS → MongoDB (répété)     |
| 3e appel (< 3600s) | HIT → Redis                | MISS → MongoDB (répété)     |
| Logs MongoDB       | Une fois seulement         | À chaque appel              |

---

## 🎯 Résolution Rapide

Si vous voyez `CACHE DÉSACTIVÉ`:

1. **Vérifiez Redis:**

   ```bash
   redis-cli ping
   ```

2. **Vérifiez REDIS_HOST dans .env:**

   ```bash
   cat .env | grep REDIS_HOST
   # Doit être accessible et valide
   ```

3. **Redémarrez le service:**

   ```bash
   npm run dev
   # Ou
   nodemon src/index.js
   ```

4. **Testez avec un client WebSocket:**
   - Connectez-vous
   - Envoyez un message
   - Les logs doivent montrer MISS CACHE au 1er message
   - Puis HIT CACHE au 2e message avec même conversationId

---

## 💡 Tips

- Le cache est **par conversation**, pas global
- Chaque `conversationId` a sa propre clé Redis: `chat:convs:id:{conversationId}`
- TTL = 3600s = **1 heure** avant expiration automatique
- Les logs détaillés aident à identifier exactement où ça échoue

Good luck! 🚀
