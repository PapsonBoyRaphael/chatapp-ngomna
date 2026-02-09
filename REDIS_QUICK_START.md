# ⚡ Guide Rapide - Convention Redis

## 🎯 Résumé

Toutes les clés Redis sont maintenant organisées hiérarchiquement:

```
chat/
├── cache/        → Données en cache (présence, utilisateurs, rooms)
└── stream/       → Tous les Redis Streams
```

---

## 🔑 Préfixes Clés

### Cache (`chat:cache:*`)

```javascript
// Utilisateurs
chat:cache:presence:{userId}           // État online/idle/offline
chat:cache:user_data:{userId}          // Hash données utilisateur
chat:cache:user_sockets:{socketId}     // Socket → User mapping
chat:cache:user_sockets_set:{userId}   // Set des sockets
chat:cache:last_seen:{userId}          // Dernier vu (hors ligne)

// Rooms
chat:cache:rooms:{roomName}            // Hash métadonnées
chat:cache:room_users:{roomName}       // Set des users
chat:cache:user_rooms:{userId}         // Set des rooms
chat:cache:room_data:{roomName}:{userId}
chat:cache:room_state:{roomName}
chat:cache:room_roles:{roomName}:{userId}
chat:cache:room_peak:{roomName}
```

### Streams (`chat:stream:*`)

```javascript
// Techniques
chat: stream: wal; // Write-Ahead Log
chat: stream: retry; // Retry queue
chat: stream: dlq; // Dead Letter Queue
chat: stream: fallback; // Fallback storage
chat: stream: metrics; // Métriques

// Messages
chat: stream: messages: private;
chat: stream: messages: group;
chat: stream: messages: channel;

// Status
chat: stream: status: delivered;
chat: stream: status: read;
chat: stream: status: edited;
chat: stream: status: deleted;

// Events
chat: stream: events: typing;
chat: stream: events: reactions;
chat: stream: events: replies;
chat: stream: events: conversations;
chat: stream: events: conversation: created;
chat: stream: events: conversation: updated;
chat: stream: events: conversation: participants: added;
chat: stream: events: conversation: participants: removed;
chat: stream: events: conversation: deleted;
chat: stream: events: files;
chat: stream: events: notifications;
chat: stream: events: analytics;
```

---

## 📝 Fichiers Modifiés

| Fichier                                                                           | Type     | Changements     |
| --------------------------------------------------------------------------------- | -------- | --------------- |
| `shared/resilience/StreamManager.js`                                              | Streams  | 3 remplacements |
| `auth-user-service/shared/resilience/StreamManager.js`                            | Streams  | 3 remplacements |
| `shared/redis/managers/OnlineUserManager.js`                                      | Cache    | 1 remplacement  |
| `chat-file-service/shared/redis/managers/OnlineUserManager.js`                    | Cache    | 1 remplacement  |
| `auth-user-service/shared/redis/managers/OnlineUserManager.js`                    | Cache    | 1 remplacement  |
| `shared/redis/managers/RoomManager.js`                                            | Cache    | 1 remplacement  |
| `chat-file-service/shared/redis/managers/RoomManager.js`                          | Cache    | 1 remplacement  |
| `auth-user-service/shared/redis/managers/RoomManager.js`                          | Cache    | 1 remplacement  |
| `chat-file-service/src/infrastructure/services/ResilientMessageService.js`        | Patterns | 2 remplacements |
| `chat-file-service/src/infrastructure/services/ResilientMessageService.js.backup` | Patterns | 2 remplacements |

---

## 📚 Documentation Créée

| Fichier                         | Description                                |
| ------------------------------- | ------------------------------------------ |
| `REDIS_KEYS_CONVENTION.md`      | Convention complète avec exemples          |
| `REDIS_RENAMING_CHANGELOG.md`   | Détails avant/après des changements        |
| `REDIS_MIGRATION_GUIDE.md`      | Guide d'utilisation du script de migration |
| `REDIS_TESTING_COMMANDS.md`     | Commandes Redis CLI pour tester            |
| `scripts/migrate-redis-keys.js` | Script de migration automatique            |

---

## 🚀 Quick Start

### Option 1: Nouvelle Installation

Aucune action nécessaire - les clés utiliseront le nouveau format par défaut.

### Option 2: Migration depuis Ancienne Version

```bash
# Si vous avez des données existantes
npm run redis:migrate
```

### Option 3: Tests Manuels

```bash
# Vérifier les clés
redis-cli KEYS "chat:cache:*"
redis-cli KEYS "chat:stream:*"

# Compter les clés
redis-cli KEYS "chat:cache:presence:*" | wc -l
```

---

## ✅ Avantages

1. **Organisation Hiérarchique** - Structure claire et intuitive
2. **Flexibilité** - Préfixes configurables via options
3. **Scalabilité** - Facile de naviguer dans les clés
4. **Maintenance** - Patterns cohérents dans tout le code
5. **Backward Compatibility** - Migration lisse avec script

---

## ⚙️ Configuration

### Dans les Managers

```javascript
// Tous les préfixes sont configurables

// OnlineUserManager
new OnlineUserManager(io, {
  presencePrefix: "chat:cache:presence", // Customizable
  userDataPrefix: "chat:cache:user_data", // Customizable
  userSocketPrefix: "chat:cache:user_sockets",
  userSocketsSetPrefix: "chat:cache:user_sockets_set",
});

// RoomManager
new RoomManager(io, onlineUserManager, {
  roomPrefix: "chat:cache:rooms", // Customizable
  roomUsersPrefix: "chat:cache:room_users", // Customizable
  userRoomsPrefix: "chat:cache:user_rooms",
  roomDataPrefix: "chat:cache:room_data",
  roomStatePrefix: "chat:cache:room_state",
  roomRolesPrefix: "chat:cache:room_roles",
  roomPeakPrefix: "chat:cache:room_peak",
});
```

---

## 🧪 Tests

### Vérifier la Convention

```bash
# Clés de présence
redis-cli KEYS "chat:cache:presence:*"

# Clés utilisateur
redis-cli KEYS "chat:cache:user_data:*"

# Streams
redis-cli KEYS "chat:stream:*"

# Pas de clés anciennes
redis-cli KEYS "presence:*"        # Doit être vide
redis-cli KEYS "stream:wal"        # Doit être vide
```

---

## 🔄 Migration

### Script Automatique

```bash
# Migrer toutes les clés
node scripts/migrate-redis-keys.js

# Ou via npm
npm run redis:migrate
```

### Variables d'Environnement

```bash
REDIS_HOST=localhost \
REDIS_PORT=6379 \
REDIS_DB=0 \
npm run redis:migrate
```

---

## 📊 Avant / Après

```
AVANT                           APRÈS
presence:570479H        →       chat:cache:presence:570479H
user_data:570479H       →       chat:cache:user_data:570479H
rooms:conv_507d0f       →       chat:cache:rooms:conv_507d0f
stream:wal              →       chat:stream:wal
stream:messages:private →       chat:stream:messages:private
stream:events:typing    →       chat:stream:events:typing
```

---

## 📞 Support

Pour plus de détails:

- 📖 Voir `REDIS_KEYS_CONVENTION.md` pour la convention complète
- 🔧 Voir `REDIS_MIGRATION_GUIDE.md` pour la migration
- 🧪 Voir `REDIS_TESTING_COMMANDS.md` pour les tests

---

## ✅ Checklist

- [x] Streams renommés vers `chat:stream:*`
- [x] Cache renommé vers `chat:cache:*`
- [x] Documentation complète créée
- [x] Script de migration fourni
- [x] Commandes de test documentées
- [x] Backward compatibility maintenue
- [x] Aucun code manquant
