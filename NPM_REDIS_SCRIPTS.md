# NPM Scripts - Scripts à Ajouter à package.json

Ajoutez ces scripts à votre `package.json` pour faciliter la gestion de Redis:

```json
{
  "scripts": {
    "redis:migrate": "node scripts/migrate-redis-keys.js",
    "redis:verify": "node -e \"const redis = require('redis'); const client = redis.createClient(); client.connect().then(() => { console.log('✅ Redis connecté'); client.quit(); }).catch(e => { console.error('❌ Redis non accessible:', e.message); })\"",
    "redis:keys": "redis-cli KEYS '*' | head -20",
    "redis:stats": "redis-cli INFO stats",
    "redis:monitor": "redis-cli MONITOR",
    "redis:flush": "redis-cli FLUSHDB",
    "redis:backup": "redis-cli BGSAVE",
    "redis:clean-old": "redis-cli KEYS 'presence:*' | xargs redis-cli DEL && redis-cli KEYS 'user_data:*' | xargs redis-cli DEL && redis-cli KEYS 'stream:*' | xargs redis-cli DEL",
    "redis:status": "redis-cli PING && redis-cli DBSIZE",
    "redis:conventions": "echo 'Clés de cache: chat:cache:*' && redis-cli KEYS 'chat:cache:*' | head -10 && echo '...' && echo 'Streams: chat:stream:*' && redis-cli KEYS 'chat:stream:*' | head -10"
  }
}
```

---

## Utilisation

### 1. Migrer les Clés

```bash
npm run redis:migrate
```

### 2. Vérifier la Connexion

```bash
npm run redis:verify
```

### 3. Voir les Clés

```bash
npm run redis:keys
```

### 4. Statistiques

```bash
npm run redis:stats
```

### 5. Vérifier le Statut

```bash
npm run redis:status
```

### 6. Vérifier la Convention

```bash
npm run redis:conventions
```

### 7. Nettoyer les Anciennes Clés

```bash
npm run redis:clean-old
```

### 8. Sauvegarde

```bash
npm run redis:backup
```

### 9. Flush (Attention ⚠️)

```bash
npm run redis:flush
```

### 10. Monitor (pour debug)

```bash
npm run redis:monitor
```

---

## Installation

Copiez et collez la section `scripts` ci-dessus dans votre `package.json`.

Le fichier complété devrait ressembler à:

```json
{
  "name": "chatapp-ngomna",
  "version": "1.0.0",
  "description": "Chat Application",
  "main": "index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "redis:migrate": "node scripts/migrate-redis-keys.js",
    "redis:verify": "node -e \"const redis = require('redis'); const client = redis.createClient(); client.connect().then(() => { console.log('✅ Redis connecté'); client.quit(); }).catch(e => { console.error('❌ Redis non accessible:', e.message); })\"",
    "redis:keys": "redis-cli KEYS '*' | head -20",
    "redis:stats": "redis-cli INFO stats",
    "redis:monitor": "redis-cli MONITOR",
    "redis:flush": "redis-cli FLUSHDB",
    "redis:backup": "redis-cli BGSAVE",
    "redis:clean-old": "redis-cli KEYS 'presence:*' | xargs redis-cli DEL && redis-cli KEYS 'user_data:*' | xargs redis-cli DEL && redis-cli KEYS 'stream:*' | xargs redis-cli DEL",
    "redis:status": "redis-cli PING && redis-cli DBSIZE",
    "redis:conventions": "echo 'Clés de cache: chat:cache:*' && redis-cli KEYS 'chat:cache:*' | head -10 && echo '...' && echo 'Streams: chat:stream:*' && redis-cli KEYS 'chat:stream:*' | head -10"
  },
  "dependencies": {
    "redis": "^4.x.x"
  }
}
```
