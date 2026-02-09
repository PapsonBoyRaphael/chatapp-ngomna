# 📚 Index - Convention Redis Complete

## 📖 Documentation

Après le renommage des clés Redis pour suivre une convention hiérarchique:

### 📋 Guides Principaux

| Document                                                         | Description                       | Lecteurs         |
| ---------------------------------------------------------------- | --------------------------------- | ---------------- |
| **[REDIS_QUICK_START.md](./REDIS_QUICK_START.md)**               | Guide rapide (5 minutes)          | Tous             |
| **[REDIS_KEYS_CONVENTION.md](./REDIS_KEYS_CONVENTION.md)**       | Convention complète avec schémas  | Développeurs     |
| **[REDIS_RENAMING_CHANGELOG.md](./REDIS_RENAMING_CHANGELOG.md)** | Changements détaillés avant/après | Équipe technique |
| **[REDIS_MIGRATION_GUIDE.md](./REDIS_MIGRATION_GUIDE.md)**       | Comment migrer les données        | DevOps/Admin     |
| **[REDIS_TESTING_COMMANDS.md](./REDIS_TESTING_COMMANDS.md)**     | Commandes CLI pour tester         | QA/Testing       |
| **[NPM_REDIS_SCRIPTS.md](./NPM_REDIS_SCRIPTS.md)**               | Scripts npm recommandés           | Tous             |

---

## 🎯 Qu'est-ce qui a Changé?

### Structure Hiérarchique

```
chat/
├── cache/    → Données en cache (utilisateurs, rooms, présence)
└── stream/   → Redis Streams (événements, messages)
```

### Exemples

| Ancien                    | Nouveau                        |
| ------------------------- | ------------------------------ |
| `presence:570479H`        | `chat:cache:presence:570479H`  |
| `user_data:570479H`       | `chat:cache:user_data:570479H` |
| `stream:wal`              | `chat:stream:wal`              |
| `stream:messages:private` | `chat:stream:messages:private` |
| `stream:events:typing`    | `chat:stream:events:typing`    |

---

## 🔍 Pour Commencer

### 1️⃣ **Comprendre la Convention** (5 min)

👉 Lire [REDIS_QUICK_START.md](./REDIS_QUICK_START.md)

### 2️⃣ **Vérifier l'Installation** (2 min)

```bash
npm run redis:verify
npm run redis:conventions
```

### 3️⃣ **Si Vous Avez des Données Anciennes** (5-10 min)

👉 Suivre [REDIS_MIGRATION_GUIDE.md](./REDIS_MIGRATION_GUIDE.md)

```bash
npm run redis:migrate
```

### 4️⃣ **Développement** (référence)

👉 Consulter [REDIS_KEYS_CONVENTION.md](./REDIS_KEYS_CONVENTION.md) si besoin

### 5️⃣ **Tests** (référence)

👉 Voir [REDIS_TESTING_COMMANDS.md](./REDIS_TESTING_COMMANDS.md)

---

## 📦 Fichiers Modifiés

### Streams (Redis Streams)

**Fichiers:**

- `shared/resilience/StreamManager.js`
- `auth-user-service/shared/resilience/StreamManager.js`

**Changement:** `stream:*` → `chat:stream:*`

**Exemples:**

```
stream:wal → chat:stream:wal
stream:messages:private → chat:stream:messages:private
stream:events:typing → chat:stream:events:typing
```

### Managers (OnlineUserManager & RoomManager)

**Fichiers:**

- `shared/redis/managers/OnlineUserManager.js`
- `shared/redis/managers/RoomManager.js`
- Versions dans `chat-file-service/` et `auth-user-service/`

**Changement:** Ancien format → `chat:cache:*`

**Exemples:**

```
presence:* → chat:cache:presence:*
user_data:* → chat:cache:user_data:*
rooms:* → chat:cache:rooms:*
```

### Services

**Fichiers:**

- `chat-file-service/src/infrastructure/services/ResilientMessageService.js`
- `chat-file-service/src/infrastructure/services/ResilientMessageService.js.backup`

**Changement:** Patterns dans `cleanAllRedisKeys()` et `cleanRedisCategory()`

---

## 🔧 Scripts et Outils

### Migration Script

**Fichier:** `scripts/migrate-redis-keys.js`

**Utilisation:**

```bash
# Exécution simple
node scripts/migrate-redis-keys.js

# Ou via npm
npm run redis:migrate

# Avec configuration personnalisée
REDIS_HOST=redis.prod \
REDIS_PORT=6380 \
npm run redis:migrate
```

### Scripts NPM

**Voir:** [NPM_REDIS_SCRIPTS.md](./NPM_REDIS_SCRIPTS.md)

Commandes pratiques:

- `npm run redis:migrate` - Migrer les clés
- `npm run redis:verify` - Vérifier la connexion
- `npm run redis:conventions` - Voir les clés par convention
- `npm run redis:clean-old` - Nettoyer les anciennes clés
- `npm run redis:backup` - Sauvegarder Redis

---

## 📊 Catégories de Clés

### `chat:cache:*` - Données en Cache

#### Utilisateurs

```
chat:cache:presence:{userId}
chat:cache:user_data:{userId}
chat:cache:user_sockets:{socketId}
chat:cache:user_sockets_set:{userId}
chat:cache:last_seen:{userId}
```

#### Rooms

```
chat:cache:rooms:{roomName}
chat:cache:room_users:{roomName}
chat:cache:user_rooms:{userId}
chat:cache:room_data:{roomName}:{userId}
chat:cache:room_state:{roomName}
```

### `chat:stream:*` - Redis Streams

#### Techniques

```
chat:stream:wal
chat:stream:retry
chat:stream:dlq
chat:stream:fallback
chat:stream:metrics
```

#### Fonctionnels

```
chat:stream:messages:private
chat:stream:messages:group
chat:stream:status:delivered
chat:stream:events:typing
chat:stream:events:conversations
```

---

## ⚡ Cas d'Usage Courants

### Vérifier les Utilisateurs En Ligne

```bash
redis-cli KEYS "chat:cache:presence:*"
redis-cli KEYS "chat:cache:user_data:*"
```

### Vérifier les Rooms

```bash
redis-cli KEYS "chat:cache:rooms:*"
redis-cli SMEMBERS "chat:cache:room_users:conv_507d0f"
```

### Voir les Streams de Typing

```bash
redis-cli XLEN "chat:stream:events:typing"
redis-cli XRANGE "chat:stream:events:typing" - + COUNT 5
```

### Compter les Clés par Catégorie

```bash
redis-cli KEYS "chat:cache:presence:*" | wc -l
redis-cli KEYS "chat:cache:rooms:*" | wc -l
redis-cli KEYS "chat:stream:*" | wc -l
```

---

## ✅ Checklist de Vérification

- [ ] Lire [REDIS_QUICK_START.md](./REDIS_QUICK_START.md)
- [ ] Exécuter `npm run redis:verify`
- [ ] Exécuter `npm run redis:conventions`
- [ ] Si anciennes données: exécuter `npm run redis:migrate`
- [ ] Exécuter `npm run redis:clean-old` pour nettoyer
- [ ] Tester l'application avec `npm start`
- [ ] Vérifier les logs pour erreurs Redis
- [ ] Consulter [REDIS_TESTING_COMMANDS.md](./REDIS_TESTING_COMMANDS.md) pour tests approfondis

---

## 🆘 Troubleshooting

### Erreur: "WRONGTYPE Operation"

→ Voir REDIS_TESTING_COMMANDS.md - Section Troubleshooting

### Redis non accessible

```bash
npm run redis:verify
```

### Anciennes clés persistent

```bash
npm run redis:clean-old
```

### Besoin de nettoyer complètement

```bash
npm run redis:flush
```

---

## 📞 Contact

Pour des questions sur la convention:

- 📖 Consulter [REDIS_KEYS_CONVENTION.md](./REDIS_KEYS_CONVENTION.md)
- 🔧 Consulter [REDIS_MIGRATION_GUIDE.md](./REDIS_MIGRATION_GUIDE.md)
- 🧪 Consulter [REDIS_TESTING_COMMANDS.md](./REDIS_TESTING_COMMANDS.md)

---

## 📈 Prochaines Étapes

1. ✅ Vérifier la convention (vous êtes ici)
2. ✅ Migrer les données si nécessaire
3. ✅ Redémarrer l'application
4. ✅ Tester la présence et les rooms
5. ✅ Valider les streams

---

## 📝 Notes

- **Impact:** Aucun - changement de convention uniquement
- **Migration:** Automatique avec script fourni
- **Backward Compatibility:** Préfixes configurables
- **Performance:** Pas d'impact
- **TTL:** Préservé lors de la migration
