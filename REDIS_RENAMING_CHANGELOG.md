# 📊 Résumé des Changements - Convention de Nommage Redis

## 🎯 Objectif

Organiser toutes les clés Redis de l'application chat selon une hiérarchie claire:

- **`chat:cache:*`** - Toutes les données en cache (présence, utilisateurs, rooms)
- **`chat:stream:*`** - Tous les Redis Streams

---

## 📝 Fichiers Modifiés

### 1. **StreamManager.js** (2 fichiers)

- `/shared/resilience/StreamManager.js`
- `/auth-user-service/shared/resilience/StreamManager.js`

**Changements:**

```javascript
// ❌ AVANT
this.STREAMS = {
  WAL: "stream:wal",
  RETRY: "stream:retry",
  DLQ: "stream:dlq",
  FALLBACK: "stream:fallback",
  METRICS: "stream:metrics",
};

this.MESSAGE_STREAMS = {
  PRIVATE: "stream:messages:private",
  TYPING: "stream:events:typing",
  // ...
};

this.EVENT_STREAMS = {
  CONVERSATIONS: "stream:events:conversations",
  // ...
};

// ✅ APRÈS
this.STREAMS = {
  WAL: "chat:stream:wal",
  RETRY: "chat:stream:retry",
  DLQ: "chat:stream:dlq",
  FALLBACK: "chat:stream:fallback",
  METRICS: "chat:stream:metrics",
};

this.MESSAGE_STREAMS = {
  PRIVATE: "chat:stream:messages:private",
  TYPING: "chat:stream:events:typing",
  // ...
};

this.EVENT_STREAMS = {
  CONVERSATIONS: "chat:stream:events:conversations",
  // ...
};
```

---

### 2. **OnlineUserManager.js** (3 fichiers)

- `/shared/redis/managers/OnlineUserManager.js`
- `/chat-file-service/shared/redis/managers/OnlineUserManager.js`
- `/auth-user-service/shared/redis/managers/OnlineUserManager.js`

**Changements:**

```javascript
// ❌ AVANT
this.presencePrefix = options.presencePrefix || "presence";
this.userDataPrefix = options.userDataPrefix || "user_data";
this.userSocketPrefix = options.userSocketPrefix || "user_sockets";
this.userSocketsSetPrefix = options.userSocketsSetPrefix || "user_sockets_set";

// ✅ APRÈS
this.presencePrefix = options.presencePrefix || "chat:cache:presence";
this.userDataPrefix = options.userDataPrefix || "chat:cache:user_data";
this.userSocketPrefix = options.userSocketPrefix || "chat:cache:user_sockets";
this.userSocketsSetPrefix =
  options.userSocketsSetPrefix || "chat:cache:user_sockets_set";
```

**Exemple d'utilisation:**

```javascript
// Les clés Redis deviennent:
// chat:cache:presence:570479H
// chat:cache:user_data:570479H
// chat:cache:user_sockets:socket-abc123
// chat:cache:user_sockets_set:570479H
// chat:cache:last_seen:570479H
```

---

### 3. **RoomManager.js** (3 fichiers)

- `/shared/redis/managers/RoomManager.js`
- `/chat-file-service/shared/redis/managers/RoomManager.js`
- `/auth-user-service/shared/redis/managers/RoomManager.js`

**Changements:**

```javascript
// ❌ AVANT
this.roomPrefix = options.roomPrefix || "rooms";
this.roomUsersPrefix = options.roomUsersPrefix || "room_users";
this.userRoomsPrefix = options.userRoomsPrefix || "user_rooms";
this.roomDataPrefix = options.roomDataPrefix || "room_data";
this.roomStatePrefix = options.roomStatePrefix || "room_state";
this.roomRolesPrefix = options.roomRolesPrefix || "room_roles";
this.roomPeakPrefix = options.roomPeakPrefix || "room_peak";

// ✅ APRÈS
this.roomPrefix = options.roomPrefix || "chat:cache:rooms";
this.roomUsersPrefix = options.roomUsersPrefix || "chat:cache:room_users";
this.userRoomsPrefix = options.userRoomsPrefix || "chat:cache:user_rooms";
this.roomDataPrefix = options.roomDataPrefix || "chat:cache:room_data";
this.roomStatePrefix = options.roomStatePrefix || "chat:cache:room_state";
this.roomRolesPrefix = options.roomRolesPrefix || "chat:cache:room_roles";
this.roomPeakPrefix = options.roomPeakPrefix || "chat:cache:room_peak";
```

**Exemple d'utilisation:**

```javascript
// Les clés Redis deviennent:
// chat:cache:rooms:conv_507d0f
// chat:cache:room_users:conv_507d0f
// chat:cache:user_rooms:570479H
// chat:cache:room_data:conv_507d0f:570479H
// chat:cache:room_state:conv_507d0f
```

---

### 4. **ResilientMessageService.js** (+ backup)

- `/chat-file-service/src/infrastructure/services/ResilientMessageService.js`
- `/chat-file-service/src/infrastructure/services/ResilientMessageService.js.backup`

**Changements - Patterns dans cleanAllRedisKeys():**

```javascript
// ❌ AVANT
[
  "stream:*",
  "*:stream",
  "presence:*",
  "online:*",
  "user:*",
  "userData:*",
  "userSocket:*",
  "room:*",
  "rooms:*",
  "roomUsers:*",
  "userRooms:*",
]

// ✅ APRÈS
[
  "chat:stream:*",
  "chat:cache:presence:*",
  "chat:cache:online:*",
  "chat:cache:user:*",
  "chat:cache:user_data:*",
  "chat:cache:user_sockets:*",
  "chat:cache:rooms:*",
  "chat:cache:room_users:*",
  "chat:cache:room_data:*",
  "chat:cache:user_rooms:*",
  "chat:cache:room_state:*",
  "chat:cache:last_seen:*",
]
```

**Changements - Patterns dans cleanRedisCategory():**

```javascript
// ❌ AVANT
const categories = {
  streams: ["stream:*", "*:stream"],
  users: ["presence:*", "online:*", "user:*", "userData:*"],
  messages: ["pending:messages:*", "messages:*", "last_messages:*"],
  cache: ["cache:*", "conversation:*", "conversations:*"],
  rooms: ["room:*", "rooms:*", "roomUsers:*", "userRooms:*"],
  resilience: ["fallback:*", "retry:*", "wal:*", "dlq:*"],
};

// ✅ APRÈS
const categories = {
  streams: ["chat:stream:*"],
  users: [
    "chat:cache:presence:*",
    "chat:cache:online:*",
    "chat:cache:user:*",
    "chat:cache:user_data:*",
  ],
  messages: ["pending:messages:*", "messages:*", "last_messages:*"],
  cache: ["chat:cache:*", "conversation:*", "conversations:*"],
  rooms: [
    "chat:cache:rooms:*",
    "chat:cache:room_users:*",
    "chat:cache:room_data:*",
    "chat:cache:user_rooms:*",
  ],
  resilience: ["fallback:*", "retry:*", "wal:*", "dlq:*"],
};
```

---

### 5. **Documentation**

- ✨ **Créé:** `/REDIS_KEYS_CONVENTION.md` - Documentation complète de la convention

---

## 📊 Tableau de Correspondance

| Type                    | Ancien Préfixe                     | Nouveau Préfixe                              |
| ----------------------- | ---------------------------------- | -------------------------------------------- |
| **Présence**            | `presence:`                        | `chat:cache:presence:`                       |
| **Données Utilisateur** | `user_data:`                       | `chat:cache:user_data:`                      |
| **Sockets**             | `user_sockets:`                    | `chat:cache:user_sockets:`                   |
| **Set Sockets**         | `user_sockets_set:`                | `chat:cache:user_sockets_set:`               |
| **Last Seen**           | `last_seen:`                       | `chat:cache:last_seen:`                      |
| **Rooms**               | `rooms:`                           | `chat:cache:rooms:`                          |
| **Room Users**          | `room_users:`                      | `chat:cache:room_users:`                     |
| **User Rooms**          | `user_rooms:`                      | `chat:cache:user_rooms:`                     |
| **Room Data**           | `room_data:`                       | `chat:cache:room_data:`                      |
| **Room State**          | `room_state:`                      | `chat:cache:room_state:`                     |
| **Room Roles**          | `room_roles:`                      | `chat:cache:room_roles:`                     |
| **Room Peak**           | `room_peak:`                       | `chat:cache:room_peak:`                      |
| **Streams Tech**        | `stream:wal`, `stream:retry`, etc. | `chat:stream:wal`, `chat:stream:retry`, etc. |
| **Message Streams**     | `stream:messages:*`                | `chat:stream:messages:*`                     |
| **Status Streams**      | `stream:status:*`                  | `chat:stream:status:*`                       |
| **Event Streams**       | `stream:events:*`                  | `chat:stream:events:*`                       |

---

## 🔄 Structure Avant / Après

### Redis Keys Visualization

```
❌ AVANT (Flat Structure)
└── Keys à la racine
    ├── presence:570479H
    ├── user_data:570479H
    ├── user_sockets:socket-123
    ├── user_sockets_set:570479H
    ├── last_seen:570479H
    ├── rooms:conv_507d0f
    ├── room_users:conv_507d0f
    ├── user_rooms:570479H
    ├── stream:wal
    ├── stream:messages:private
    └── stream:events:typing

✅ APRÈS (Hierarchical Structure)
└── chat:
    ├── cache:
    │   ├── presence:570479H
    │   ├── user_data:570479H
    │   ├── user_sockets:socket-123
    │   ├── user_sockets_set:570479H
    │   ├── last_seen:570479H
    │   ├── rooms:conv_507d0f
    │   ├── room_users:conv_507d0f
    │   ├── user_rooms:570479H
    │   ├── room_data:conv_507d0f:570479H
    │   ├── room_state:conv_507d0f
    │   ├── room_roles:conv_507d0f:570479H
    │   └── room_peak:conv_507d0f
    └── stream:
        ├── wal
        ├── retry
        ├── dlq
        ├── fallback
        ├── metrics
        ├── messages:
        │   ├── private
        │   ├── group
        │   └── channel
        ├── status:
        │   ├── delivered
        │   ├── read
        │   ├── edited
        │   └── deleted
        └── events:
            ├── typing
            ├── reactions
            ├── replies
            ├── conversations
            ├── conversation:created
            ├── conversation:updated
            ├── conversation:participants:added
            ├── conversation:participants:removed
            ├── conversation:deleted
            ├── files
            ├── notifications
            └── analytics
```

---

## ✅ Vérifications Effectuées

- [x] StreamManager.js (shared) - 3 remplacements
- [x] StreamManager.js (auth-user-service) - 3 remplacements
- [x] OnlineUserManager.js (shared) - 1 remplacement
- [x] OnlineUserManager.js (chat-file-service) - 1 remplacement
- [x] OnlineUserManager.js (auth-user-service) - 1 remplacement
- [x] RoomManager.js (shared) - 1 remplacement
- [x] RoomManager.js (chat-file-service) - 1 remplacement
- [x] RoomManager.js (auth-user-service) - 1 remplacement
- [x] ResilientMessageService.js - 2 remplacements
- [x] ResilientMessageService.js.backup - 2 remplacements
- [x] last_seen key renaming - 2 remplacements
- [x] Documentation créée - REDIS_KEYS_CONVENTION.md

---

## 📌 Notes Importantes

1. **Rétro-compatibilité**: Les préfixes sont configurables via options des constructeurs, permettant une transition graduelle si besoin
2. **Impact**: Aucune clé ne persiste au redémarrage (TTL < 30 jours), les données seront re-créées automatiquement
3. **Performance**: Pas d'impact de performance, seuls les noms de clés ont changé
4. **Pub/Sub**: `__keyevent@0__:expired` reste inchangé (système Redis natif)

---

## 🚀 Prochaines Étapes

1. Tester l'application en mode développement
2. Vérifier dans Redis que les clés ont les nouveaux préfixes
3. Confirmer que la présence fonctionne correctement
4. Tester les rooms et la synchronisation utilisateur
