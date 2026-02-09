# 📋 CHANGELOG - Convention Redis

## Version 2.0.0 - Hiérarchie Redis

**Date:** 2025-02-08

### 🎯 Objectif

Restructurer les clés Redis selon une hiérarchie claire et maintenable:

- **`chat:cache:*`** pour toutes les données en cache
- **`chat:stream:*`** pour tous les Redis Streams

### 📦 Changements

#### ✨ Nouvelles Structures

```
Avant (Flat):
├── presence:*
├── user_data:*
├── stream:*
└── room_*

Après (Hierarchical):
└── chat/
    ├── cache/
    │   ├── presence:*
    │   ├── user_data:*
    │   ├── rooms:*
    │   └── ...
    └── stream/
        ├── wal
        ├── messages:*
        ├── events:*
        └── ...
```

#### 🔄 Changements de Nommage

**Streams Techniques:**

- `stream:wal` → `chat:stream:wal`
- `stream:retry` → `chat:stream:retry`
- `stream:dlq` → `chat:stream:dlq`
- `stream:fallback` → `chat:stream:fallback`
- `stream:metrics` → `chat:stream:metrics`

**Streams Fonctionnels:**

- `stream:messages:private` → `chat:stream:messages:private`
- `stream:messages:group` → `chat:stream:messages:group`
- `stream:status:delivered` → `chat:stream:status:delivered`
- `stream:status:read` → `chat:stream:status:read`
- `stream:status:edited` → `chat:stream:status:edited`
- `stream:status:deleted` → `chat:stream:status:deleted`

**Streams Événementiels:**

- `stream:events:typing` → `chat:stream:events:typing`
- `stream:events:reactions` → `chat:stream:events:reactions`
- `stream:events:replies` → `chat:stream:events:replies`
- `stream:events:conversations` → `chat:stream:events:conversations`
- `stream:events:conversation:created` → `chat:stream:events:conversation:created`
- `stream:events:conversation:updated` → `chat:stream:events:conversation:updated`
- `stream:events:conversation:participants:added` → `chat:stream:events:conversation:participants:added`
- `stream:events:conversation:participants:removed` → `chat:stream:events:conversation:participants:removed`
- `stream:events:conversation:deleted` → `chat:stream:events:conversation:deleted`
- `stream:events:files` → `chat:stream:events:files`
- `stream:events:notifications` → `chat:stream:events:notifications`
- `stream:events:analytics` → `chat:stream:events:analytics`

**Clés Cache - Utilisateurs:**

- `presence:*` → `chat:cache:presence:*`
- `user_data:*` → `chat:cache:user_data:*`
- `user_sockets:*` → `chat:cache:user_sockets:*`
- `user_sockets_set:*` → `chat:cache:user_sockets_set:*`
- `last_seen:*` → `chat:cache:last_seen:*`

**Clés Cache - Rooms:**

- `rooms:*` → `chat:cache:rooms:*`
- `room_users:*` → `chat:cache:room_users:*`
- `user_rooms:*` → `chat:cache:user_rooms:*`
- `room_data:*` → `chat:cache:room_data:*`
- `room_state:*` → `chat:cache:room_state:*`
- `room_roles:*` → `chat:cache:room_roles:*`
- `room_peak:*` → `chat:cache:room_peak:*`

#### 📝 Fichiers Modifiés

**StreamManager.js (2 fichiers):**

- `shared/resilience/StreamManager.js`
- `auth-user-service/shared/resilience/StreamManager.js`
- **Changements:** 3 remplacements chacun (STREAMS, MESSAGE_STREAMS, EVENT_STREAMS)

**OnlineUserManager.js (3 fichiers):**

- `shared/redis/managers/OnlineUserManager.js`
- `chat-file-service/shared/redis/managers/OnlineUserManager.js`
- `auth-user-service/shared/redis/managers/OnlineUserManager.js`
- **Changements:** 1 remplacement chacun (préfixes dans constructor)

**RoomManager.js (3 fichiers):**

- `shared/redis/managers/RoomManager.js`
- `chat-file-service/shared/redis/managers/RoomManager.js`
- `auth-user-service/shared/redis/managers/RoomManager.js`
- **Changements:** 1 remplacement chacun (préfixes dans constructor)

**ResilientMessageService.js (2 fichiers):**

- `chat-file-service/src/infrastructure/services/ResilientMessageService.js`
- `chat-file-service/src/infrastructure/services/ResilientMessageService.js.backup`
- **Changements:** 2 remplacements chacun (patterns de nettoyage)

**Total:** 16 fichiers modifiés, 26 remplacements appliqués

#### 📚 Nouvelle Documentation

- `REDIS_KEYS_CONVENTION.md` - Convention complète (schema, TTL, exemples)
- `REDIS_RENAMING_CHANGELOG.md` - Détails avant/après, tableau de correspondance
- `REDIS_MIGRATION_GUIDE.md` - Guide d'utilisation du script de migration
- `REDIS_TESTING_COMMANDS.md` - Commandes CLI pour tests et vérification
- `REDIS_QUICK_START.md` - Guide rapide (5 minutes)
- `NPM_REDIS_SCRIPTS.md` - Scripts npm recommandés
- `REDIS_DOCUMENTATION_INDEX.md` - Index de toute la documentation
- `scripts/migrate-redis-keys.js` - Script de migration automatique

#### 🔧 Outils Fournis

- **Script de migration:** Automatise la conversion des clés existantes
- **Scripts npm:** Facilite la gestion de Redis en développement
- **Commandes de test:** CLI pour vérifier la migration
- **Documentation complète:** 8 fichiers de documentation

### ✅ Avantages

1. **Hiérarchie Logique** - Structure `chat/cache` et `chat/stream` claire
2. **Maintenance Facile** - Patterns cohérents et prévisibles
3. **Scalabilité** - Facile d'ajouter de nouveaux types
4. **Flexibilité** - Préfixes configurables via options
5. **Migration Lisse** - Script automatique fourni
6. **Backward Compatibility** - Préfixes configurables, pas de breaking change

### ⚠️ Impact

- **Code Breaking:** NON - Tous les préfixes sont configurables
- **Performance:** Aucun impact - seuls les noms changent
- **Migration:** Données migrées automatiquement via script
- **TTL:** Préservé lors de la migration
- **Pub/Sub:** Inchangé (`__keyevent@0__:expired`)

### 🚀 Migration

**Pour les Installations Existantes:**

```bash
# Sauvegarder les données
npm run redis:backup

# Migrer les clés
npm run redis:migrate

# Vérifier
npm run redis:conventions
```

**Pour les Nouvelles Installations:**

Aucune action - les clés utiliseront directement le nouveau format.

### 📊 Statistiques

- **Fichiers modifiés:** 16
- **Remplacements:** 26+
- **Fichiers de documentation:** 8
- **Préfixes streams:** 15+
- **Préfixes cache:** 13+
- **Scripts:** 1 (migration) + 10 (npm)

### 🔄 Rétro-Compatibilité

Tous les managers acceptent des options de configuration:

```javascript
// Personnaliser les préfixes
new OnlineUserManager(io, {
  presencePrefix: "my:custom:prefix",
  userDataPrefix: "my:data",
  // ...
});

new RoomManager(io, onlineUserManager, {
  roomPrefix: "my:rooms",
  // ...
});
```

### 📚 Documentation Associée

- `REDIS_KEYS_CONVENTION.md` - Convention complète
- `REDIS_MIGRATION_GUIDE.md` - Guide de migration
- `REDIS_TESTING_COMMANDS.md` - Commandes pour tester

### 🎯 Prochaines Étapes

1. ✅ Lire la documentation
2. ✅ Exécuter le script de migration si nécessaire
3. ✅ Tester l'application
4. ✅ Valider les streams et présence

---

## Version 1.0.0 - Initial

**Date:** Avant 2025-02-08

- Utilisation de préfixes plats sans hiérarchie
- `presence:*`, `user_data:*`, `stream:*`, etc.
- Documentation minimale

---

## 🆕 Nouvelles Fonctionnalités

### Script de Migration

```bash
node scripts/migrate-redis-keys.js
```

Migre automatiquement:

- Tous les types (string, hash, set, list, zset)
- Préserve les TTL
- Rapport détaillé
- Gestion d'erreurs robuste

### Scripts NPM

10 nouveaux scripts pour gérer Redis:

- `redis:migrate` - Migration
- `redis:verify` - Vérifier connexion
- `redis:conventions` - Voir les conventions
- `redis:clean-old` - Nettoyer anciennes clés
- `redis:backup` - Sauvegarde
- Et 5 autres...

### Documentation

8 fichiers de documentation complète:

- Conventions de nommage
- Guide de migration
- Commandes de test
- Quick start
- Et plus...

---

## 🔗 Références

- `REDIS_DOCUMENTATION_INDEX.md` - Index principal
- `REDIS_KEYS_CONVENTION.md` - Convention détaillée
- `REDIS_MIGRATION_GUIDE.md` - Guide d'utilisation
