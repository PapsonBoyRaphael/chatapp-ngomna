# Convention de Nommage des Clés Redis - Chat Application

## 📋 Structure Hiérarchique

Toutes les clés Redis sont organisées selon la structure suivante:

```
chat/
├── cache/     (données en cache, présence, utilisateurs, rooms)
└── stream/    (tous les Redis Streams)
```

---

## 🔑 Clés Cache (`chat:cache:*`)

### Présence et Utilisateurs en Ligne

| Clé                                    | Description                            | Exemple                               | TTL      |
| -------------------------------------- | -------------------------------------- | ------------------------------------- | -------- |
| `chat:cache:presence:{userId}`         | État de présence (online/idle/offline) | `chat:cache:presence:570479H`         | 5 min    |
| `chat:cache:user_data:{userId}`        | Hash avec données utilisateur          | `chat:cache:user_data:570479H`        | 5 min    |
| `chat:cache:user_sockets:{socketId}`   | Mappe socket → userId                  | `chat:cache:user_sockets:abc123`      | 5 min    |
| `chat:cache:user_sockets_set:{userId}` | Set des sockets d'un utilisateur       | `chat:cache:user_sockets_set:570479H` | 1h       |
| `chat:cache:last_seen:{userId}`        | Dernier vu hors ligne (status, time)   | `chat:cache:last_seen:570479H`        | 30 jours |

### Rooms (Conversations)

| Clé                                         | Description                            | Type   | Exemple                                     |
| ------------------------------------------- | -------------------------------------- | ------ | ------------------------------------------- |
| `chat:cache:rooms:{roomName}`               | Métadonnées de la room                 | Hash   | `chat:cache:rooms:conv_507d0f`              |
| `chat:cache:room_users:{roomName}`          | Set des userIds dans la room           | Set    | `chat:cache:room_users:conv_507d0f`         |
| `chat:cache:user_rooms:{userId}`            | Set des rooms d'un utilisateur         | Set    | `chat:cache:user_rooms:570479H`             |
| `chat:cache:room_data:{roomName}:{userId}`  | Données utilisateur dans la room       | Hash   | `chat:cache:room_data:conv_507d0f:570479H`  |
| `chat:cache:room_state:{roomName}`          | État de la room (active/idle/archived) | String | `chat:cache:room_state:conv_507d0f`         |
| `chat:cache:room_roles:{roomName}:{userId}` | Rôle de l'utilisateur dans la room     | String | `chat:cache:room_roles:conv_507d0f:570479H` |
| `chat:cache:room_peak:{roomName}`           | Pic d'utilisateurs online              | String | `chat:cache:room_peak:conv_507d0f`          |

---

## 📊 Streams (`chat:stream:*`)

### Streams Techniques (Infrastructure)

| Stream                 | Description                          | Max Len |
| ---------------------- | ------------------------------------ | ------- |
| `chat:stream:wal`      | Write-Ahead Log pour résilience      | 10000   |
| `chat:stream:retry`    | Queue de retry pour messages échoués | 5000    |
| `chat:stream:dlq`      | Dead Letter Queue                    | 1000    |
| `chat:stream:fallback` | Fallback storage                     | 5000    |
| `chat:stream:metrics`  | Métriques et statistiques            | 10000   |

### Streams Fonctionnels (Messages)

#### Messages par Type

| Stream                         | Description        | Max Len |
| ------------------------------ | ------------------ | ------- |
| `chat:stream:messages:private` | Messages privés    | 10000   |
| `chat:stream:messages:group`   | Messages de groupe | 20000   |
| `chat:stream:messages:channel` | Messages de canal  | 20000   |

#### États des Messages

| Stream                         | Description        | Max Len |
| ------------------------------ | ------------------ | ------- |
| `chat:stream:status:delivered` | Messages livrés    | 5000    |
| `chat:stream:status:read`      | Messages lus       | 5000    |
| `chat:stream:status:edited`    | Messages édités    | 2000    |
| `chat:stream:status:deleted`   | Messages supprimés | 2000    |

#### Interactions

| Stream                         | Description            | TTL | Max Len |
| ------------------------------ | ---------------------- | --- | ------- |
| `chat:stream:events:typing`    | Indicateurs de saisie  | 60s | 2000    |
| `chat:stream:events:reactions` | Réactions aux messages | -   | 5000    |
| `chat:stream:events:replies`   | Réponses aux messages  | -   | 5000    |

### Streams Événementiels (Métier)

#### Conversations

| Stream                                                 | Description                             | Max Len |
| ------------------------------------------------------ | --------------------------------------- | ------- |
| `chat:stream:events:conversations`                     | Créations/suppressions de conversations | 5000    |
| `chat:stream:events:conversation:created`              | Conversation créée                      | 2000    |
| `chat:stream:events:conversation:updated`              | Conversation mise à jour                | 2000    |
| `chat:stream:events:conversation:participants:added`   | Participant ajouté                      | 2000    |
| `chat:stream:events:conversation:participants:removed` | Participant retiré                      | 2000    |
| `chat:stream:events:conversation:deleted`              | Conversation supprimée                  | 1000    |

#### Autres Événements

| Stream                             | Description           | Max Len |
| ---------------------------------- | --------------------- | ------- |
| `chat:stream:events:files`         | Événements fichier    | 5000    |
| `chat:stream:events:notifications` | Notifications système | 2000    |
| `chat:stream:events:analytics`     | Données analytiques   | 10000   |

---

## 🔄 Pub/Sub (Abonnement aux Expirations)

```
__keyevent@0__:expired
```

Utilisé pour détecter l'expiration des clés (présence, TTL utilisateurs, etc.)

---

## 📝 Schéma des Données

### User Data Hash

```javascript
{
  userId: "570479H",
  socketId: "socket-abc123",
  matricule: "MAT001",
  status: "online",
  lastActivity: "2025-02-08T12:30:00.000Z",
  connectedAt: "2025-02-08T12:00:00.000Z"
}
```

### Last Seen (Offline)

```javascript
{
  lastActivity: "2025-02-08T12:00:00.000Z",
  status: "offline",
  matricule: "MAT001",
  disconnectedAt: "2025-02-08T12:00:00.000Z"
}
```

### Room Data Hash

```javascript
{
  userId: "570479H",
  matricule: "MAT001",
  joinedAt: "2025-02-08T12:30:00.000Z",
  lastActivity: "2025-02-08T12:30:00.000Z",
  conversationId: "507d0f"
}
```

---

## 🎯 Migration depuis l'Ancienne Convention

| Ancien               | Nouveau                         |
| -------------------- | ------------------------------- |
| `presence:*`         | `chat:cache:presence:*`         |
| `user_data:*`        | `chat:cache:user_data:*`        |
| `user_sockets:*`     | `chat:cache:user_sockets:*`     |
| `user_sockets_set:*` | `chat:cache:user_sockets_set:*` |
| `last_seen:*`        | `chat:cache:last_seen:*`        |
| `rooms:*`            | `chat:cache:rooms:*`            |
| `room_users:*`       | `chat:cache:room_users:*`       |
| `user_rooms:*`       | `chat:cache:user_rooms:*`       |
| `room_data:*`        | `chat:cache:room_data:*`        |
| `room_state:*`       | `chat:cache:room_state:*`       |
| `stream:*`           | `chat:stream:*`                 |
| `stream:messages:*`  | `chat:stream:messages:*`        |
| `stream:status:*`    | `chat:stream:status:*`          |
| `stream:events:*`    | `chat:stream:events:*`          |

---

## 🛠️ Code d'Utilisation

### OnlineUserManager

```javascript
// Préfixes configurables mais par défaut:
this.presencePrefix = "chat:cache:presence";
this.userDataPrefix = "chat:cache:user_data";
this.userSocketPrefix = "chat:cache:user_sockets";
this.userSocketsSetPrefix = "chat:cache:user_sockets_set";

// Utilisation
await this.redis.set(`${this.presencePrefix}:${userId}`, "online");
```

### RoomManager

```javascript
// Préfixes configurables mais par défaut:
this.roomPrefix = "chat:cache:rooms";
this.roomUsersPrefix = "chat:cache:room_users";
this.userRoomsPrefix = "chat:cache:user_rooms";
this.roomDataPrefix = "chat:cache:room_data";
this.roomStatePrefix = "chat:cache:room_state";

// Utilisation
await this.redis.sAdd(`${this.roomUsersPrefix}:${roomName}`, userId);
```

### StreamManager

```javascript
// Tous les streams sont définis dans la classe
this.STREAMS = {
  WAL: "chat:stream:wal",
  RETRY: "chat:stream:retry",
  // ...
};

this.MESSAGE_STREAMS = {
  PRIVATE: "chat:stream:messages:private",
  // ...
};

this.EVENT_STREAMS = {
  CONVERSATIONS: "chat:stream:events:conversations",
  // ...
};
```

---

## ✅ Checkpoint

- [x] Tous les streams renommés vers `chat:stream:*`
- [x] Toutes les clés de cache renommées vers `chat:cache:*`
- [x] Préfixes configurables via options dans constructeurs
- [x] ResilientMessageService patterns mis à jour
- [x] Documentation complétée

---

## 📌 Notes

1. **Cohérence**: Tous les préfixes sont définis dans les constructeurs des managers
2. **Flexibilité**: Les préfixes peuvent être surchargés via les options du constructeur
3. **Namespacing**: Structure claire avec `chat:` comme racine pour toutes les données de chat
4. **TTL**: Respecte les durées de vie configurées pour chaque type de donnée
5. **Pub/Sub**: Utilise les keyspace notifications de Redis pour les expirations
