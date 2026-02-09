# 🔄 Utilisation du Script de Migration Redis

## 📋 Description

Ce script migre automatiquement toutes les clés Redis de l'ancienne convention vers la nouvelle convention hiérarchique:

- **Ancien format:** `presence:*`, `user_data:*`, `stream:*`
- **Nouveau format:** `chat:cache:presence:*`, `chat:cache:user_data:*`, `chat:stream:*`

---

## 🚀 Installation Prérequise

Assurez-vous que les dépendances sont installées:

```bash
npm install redis
```

---

## 🎯 Utilisation

### Option 1: Configuration par Défaut (Localhost)

```bash
node scripts/migrate-redis-keys.js
```

Utilise les valeurs par défaut:

- **Host:** `localhost`
- **Port:** `6379`
- **DB:** `0`

---

### Option 2: Configuration avec Variables d'Environnement

```bash
# Configuration personnalisée
REDIS_HOST=redis.example.com \
REDIS_PORT=6380 \
REDIS_DB=1 \
node scripts/migrate-redis-keys.js
```

---

### Option 3: Configuration avec un Fichier `.env`

Créez un fichier `.env` à la racine du projet:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
```

Puis exécutez:

```bash
node scripts/migrate-redis-keys.js
```

---

## 📊 Fonctionnement

### Processus Étape par Étape

1. **Connexion à Redis** - Établit une connexion au serveur Redis
2. **Scan des Clés** - Utilise `SCAN` pour trouver les clés avec les anciens préfixes
3. **Migration Type par Type** - Migre selon le type (string, hash, set, list, zset)
4. **Préservation des TTL** - Conserve les durées d'expiration
5. **Suppression des Anciennes** - Supprime les clés après migration réussie
6. **Rapport Final** - Affiche un résumé de la migration

### Types Supportés

| Type           | Supporté | Notes                        |
| -------------- | -------- | ---------------------------- |
| **String**     | ✅       | Chaînes de caractères        |
| **Hash**       | ✅       | Pairs clé-valeur             |
| **Set**        | ✅       | Ensembles uniques            |
| **List**       | ✅       | Listes ordonnées             |
| **Sorted Set** | ✅       | Sets triés par score         |
| **Stream**     | ⚠️       | Non migrable automatiquement |

---

## 📈 Exemple de Sortie

```
🔄 Démarrage de la migration des clés Redis...

✅ Connecté à Redis

🔍 Recherche des clés avec pattern: presence:*
   📦 3 clé(s) à migrer
   ⏳ presence:570479H → chat:cache:presence:570479H
   ⏳ presence:user123 → chat:cache:presence:user123
   ⏳ presence:user456 → chat:cache:presence:user456
   ✅ 3/3 clés migrées

🔍 Recherche des clés avec pattern: user_data:*
   📦 3 clé(s) à migrer
   ⏳ user_data:570479H → chat:cache:user_data:570479H
   ⏳ user_data:user123 → chat:cache:user_data:user123
   ⏳ user_data:user456 → chat:cache:user_data:user456
   ✅ 3/3 clés migrées

🔍 Recherche des clés avec pattern: stream:*
   ⚠️ Aucune clé trouvée (stream ne peut pas être scanné)

============================================================
📊 RÉSUMÉ DE LA MIGRATION
============================================================
✅ Clés migrées: 6
❌ Erreurs: 0
📈 Taux de réussite: 100.00%
============================================================

🎉 Migration terminée avec succès!
```

---

## ⚠️ Points Importants

### 1. Sauvegarde Avant Migration

```bash
# Créer une sauvegarde Redis
redis-cli BGSAVE

# Ou exporter les données
redis-cli --rdb /tmp/dump.rdb
```

### 2. Validation Après Migration

```bash
# Vérifier les clés migrées
redis-cli KEYS "chat:cache:*"
redis-cli KEYS "chat:stream:*"

# Vérifier qu'il ne reste pas d'anciennes clés
redis-cli KEYS "presence:*"
redis-cli KEYS "user_data:*"
```

### 3. Gestion des Streams

Les Redis Streams **ne peuvent pas être facilement migrés** avec ce script car:

- Pas d'API natif pour copier les streams
- Les consumer groups sont complexes à migrer

**Solution:** Les streams sont généralement vides en production (données temporaires), donc une perte est acceptable.

### 4. Environnement de Développement

En développement, vous pouvez simplement:

1. Exécuter le script de migration
2. Ou redémarrer Redis (flush les données de test)

---

## 🔧 Troubleshooting

### Erreur: "ECONNREFUSED"

```bash
# Vérifier que Redis est en cours d'exécution
redis-cli ping

# Si Redis n'est pas actif, le démarrer:
redis-server
```

### Erreur: "WRONGTYPE Operation against a key holding the wrong kind of value"

Ce script gère automatiquement les différents types. Si vous recevez cette erreur:

1. Identifiez la clé problématique
2. Supprimez-la manuellement si nécessaire
3. Relancez le script

```bash
redis-cli DEL <problematic-key>
```

### Script Bloque Redis

Si le script prend trop de temps:

1. Réduisez `COUNT` dans le `SCAN` (actuellement 100)
2. Augmentez le délai entre batches (actuellement 100ms)

---

## 🔄 Scripts Npm Recommandés

Ajoutez ces scripts à `package.json`:

```json
{
  "scripts": {
    "redis:migrate": "node scripts/migrate-redis-keys.js",
    "redis:backup": "redis-cli BGSAVE",
    "redis:verify": "node scripts/verify-redis-keys.js",
    "redis:cleanup": "redis-cli FLUSHDB"
  }
}
```

Utilisation:

```bash
npm run redis:migrate
npm run redis:backup
npm run redis:verify
```

---

## 📚 Documentation Associée

- [REDIS_KEYS_CONVENTION.md](./REDIS_KEYS_CONVENTION.md) - Convention complète
- [REDIS_RENAMING_CHANGELOG.md](./REDIS_RENAMING_CHANGELOG.md) - Détails des changements
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Guide de déploiement

---

## ✅ Checklist Pré-Production

- [ ] Sauvegarde Redis créée
- [ ] Script testé en développement
- [ ] Connexion Redis vérifiée
- [ ] Aucune application en cours d'exécution
- [ ] Migrations de clés terminées
- [ ] Vérification post-migration réussie
- [ ] Application redémarrée
- [ ] Tests fonctionnels passés

---

## 🎯 Cas d'Usage

### 1. Nouvelle Installation

Pas besoin d'exécuter le script - les clés utiliseront directement le nouveau format.

### 2. Migration depuis Ancienne Version

```bash
# Arrêter l'application
npm stop

# Exécuter la migration
npm run redis:migrate

# Redémarrer l'application
npm start
```

### 3. Environnement de Production

```bash
# Sur le serveur de production
REDIS_HOST=redis-prod.internal \
REDIS_PORT=6379 \
node scripts/migrate-redis-keys.js

# Vérifier les résultats
redis-cli -h redis-prod.internal KEYS "chat:cache:*" | wc -l
```
