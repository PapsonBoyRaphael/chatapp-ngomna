# 🧪 Tests de la Convention Redis - Commandes CLI

## 📋 Vérification de la Convention

### 1️⃣ Vérifier les Clés de Présence

```bash
# Toutes les clés de présence
redis-cli KEYS "chat:cache:presence:*"

# Compte de clés de présence
redis-cli KEYS "chat:cache:presence:*" | wc -l

# Contenu d'une clé de présence
redis-cli GET "chat:cache:presence:570479H"

# Vérifier l'absence des anciennes clés
redis-cli KEYS "presence:*"  # Devrait être vide
```

---

### 2️⃣ Vérifier les Clés Utilisateur

```bash
# Toutes les clés de données utilisateur
redis-cli KEYS "chat:cache:user_data:*"

# Contenu d'une clé utilisateur
redis-cli HGETALL "chat:cache:user_data:570479H"

# Les sockets d'un utilisateur
redis-cli SMEMBERS "chat:cache:user_sockets_set:570479H"

# Vérifier qu'il ne reste pas d'anciennes clés
redis-cli KEYS "user_data:*"  # Devrait être vide
```

---

### 3️⃣ Vérifier les Rooms

```bash
# Toutes les rooms
redis-cli KEYS "chat:cache:rooms:*"

# Contenu d'une room
redis-cli HGETALL "chat:cache:rooms:conv_507d0f"

# Utilisateurs dans une room
redis-cli SMEMBERS "chat:cache:room_users:conv_507d0f"

# Rooms d'un utilisateur
redis-cli SMEMBERS "chat:cache:user_rooms:570479H"

# Données utilisateur dans une room
redis-cli HGETALL "chat:cache:room_data:conv_507d0f:570479H"

# État de la room
redis-cli GET "chat:cache:room_state:conv_507d0f"
```

---

### 4️⃣ Vérifier les Streams

```bash
# Lister tous les streams
redis-cli KEYS "chat:stream:*"

# Longueur d'un stream
redis-cli XLEN "chat:stream:wal"
redis-cli XLEN "chat:stream:messages:private"
redis-cli XLEN "chat:stream:events:typing"

# Dernier message d'un stream
redis-cli XREVRANGE "chat:stream:events:typing" + - COUNT 1

# Tous les messages d'un stream (limité)
redis-cli XRANGE "chat:stream:messages:private" - + COUNT 10

# Vérifier qu'il ne reste pas d'anciens streams
redis-cli KEYS "stream:wal"      # Devrait être vide
redis-cli KEYS "stream:retry"    # Devrait être vide
```

---

### 5️⃣ Vérifier Last Seen

```bash
# Tous les last seen
redis-cli KEYS "chat:cache:last_seen:*"

# Contenu d'une clé last_seen
redis-cli GET "chat:cache:last_seen:570479H"

# TTL d'une clé last_seen (devrait être ~2592000 pour 30 jours)
redis-cli TTL "chat:cache:last_seen:570479H"
```

---

## 🔍 Diagnostics Complets

### Afficher Toutes les Clés par Catégorie

```bash
#!/bin/bash

echo "=== PRÉSENCE ET UTILISATEURS ==="
echo "Clés de présence:"
redis-cli KEYS "chat:cache:presence:*"

echo -e "\nClés de données utilisateur:"
redis-cli KEYS "chat:cache:user_data:*"

echo -e "\nClés de sockets:"
redis-cli KEYS "chat:cache:user_sockets*"

echo -e "\n=== ROOMS ==="
echo "Rooms:"
redis-cli KEYS "chat:cache:rooms:*"

echo -e "\nUtilisateurs par room:"
redis-cli KEYS "chat:cache:room_users:*"

echo -e "\nRooms par utilisateur:"
redis-cli KEYS "chat:cache:user_rooms:*"

echo -e "\n=== STREAMS ==="
echo "Streams techniques:"
redis-cli KEYS "chat:stream:wal"
redis-cli KEYS "chat:stream:retry"
redis-cli KEYS "chat:stream:dlq"

echo -e "\nStreams de messages:"
redis-cli KEYS "chat:stream:messages:*"

echo -e "\nStreams d'événements:"
redis-cli KEYS "chat:stream:events:*"
```

---

## 📊 Statistiques et Métriques

### Compter les Clés par Type

```bash
#!/bin/bash

count_pattern() {
  local pattern=$1
  local count=$(redis-cli KEYS "$pattern" | wc -l)
  echo "$pattern: $count"
}

echo "=== STATISTIQUES DES CLÉS ==="
count_pattern "chat:cache:presence:*"
count_pattern "chat:cache:user_data:*"
count_pattern "chat:cache:user_sockets:*"
count_pattern "chat:cache:user_sockets_set:*"
count_pattern "chat:cache:last_seen:*"
count_pattern "chat:cache:rooms:*"
count_pattern "chat:cache:room_users:*"
count_pattern "chat:cache:user_rooms:*"
count_pattern "chat:cache:room_data:*"
count_pattern "chat:cache:room_state:*"
count_pattern "chat:stream:*"

echo -e "\n=== TOTAL ==="
redis-cli DBSIZE
```

### Tailles Des Clés

```bash
#!/bin/bash

# Afficher les plus grandes clés
redis-cli --bigkeys

# Afficher les clés avec le plus long TTL
redis-cli KEYS "chat:cache:last_seen:*" | while read key; do
  ttl=$(redis-cli TTL "$key")
  echo "$key: TTL=$ttl secondes"
done
```

---

## ⚠️ Vérification des Migrations

### Vérifier Qu'Il Ne Reste Pas d'Anciennes Clés

```bash
#!/bin/bash

echo "=== VÉRIFICATION POST-MIGRATION ==="

# Patterns à vérifier
patterns=(
  "presence:*"
  "user_data:*"
  "user_sockets:*"
  "user_sockets_set:*"
  "rooms:*"
  "room_users:*"
  "user_rooms:*"
  "room_data:*"
  "room_state:*"
  "stream:wal"
  "stream:retry"
  "stream:dlq"
  "stream:fallback"
  "stream:metrics"
  "stream:messages:*"
  "stream:status:*"
  "stream:events:*"
)

found_old=false

for pattern in "${patterns[@]}"; do
  count=$(redis-cli KEYS "$pattern" | wc -l)
  if [ $count -gt 0 ]; then
    echo "❌ Anciennes clés trouvées: $pattern ($count)"
    found_old=true
  fi
done

if [ "$found_old" = false ]; then
  echo "✅ Aucune ancienne clé trouvée - Migration réussie!"
else
  echo "⚠️ Des anciennes clés existent encore - Migration incomplète"
fi
```

---

## 🧪 Tests Manuels

### Test 1: Créer un Utilisateur en Ligne

```bash
# Simuler l'arrivée d'un utilisateur
redis-cli HSET "chat:cache:user_data:test-user" \
  userId "test-user" \
  socketId "socket-123" \
  matricule "MAT123" \
  status "online" \
  lastActivity "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
  connectedAt "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

redis-cli SET "chat:cache:presence:test-user" "online" EX 300

redis-cli SADD "chat:cache:user_sockets_set:test-user" "socket-123"

# Vérifier
redis-cli HGETALL "chat:cache:user_data:test-user"
redis-cli GET "chat:cache:presence:test-user"
```

### Test 2: Créer une Room

```bash
# Simuler la création d'une room
redis-cli HSET "chat:cache:rooms:conv_test" \
  lastActivity "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
  updatedAt "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

redis-cli SADD "chat:cache:room_users:conv_test" "test-user"

redis-cli SADD "chat:cache:user_rooms:test-user" "conv_test"

redis-cli HSET "chat:cache:room_data:conv_test:test-user" \
  userId "test-user" \
  matricule "MAT123" \
  joinedAt "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
  lastActivity "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
  conversationId "test"

# Vérifier
redis-cli HGETALL "chat:cache:rooms:conv_test"
redis-cli SMEMBERS "chat:cache:room_users:conv_test"
```

### Test 3: Ajouter un Message au Stream

```bash
# Ajouter à un stream de typing
redis-cli XADD "chat:stream:events:typing" \
  "*" \
  userId "test-user" \
  conversationId "conv_test" \
  timestamp "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
  isTyping "true"

# Vérifier
redis-cli XLEN "chat:stream:events:typing"
redis-cli XRANGE "chat:stream:events:typing" - + COUNT 1
```

---

## 🧹 Nettoyage Après Tests

```bash
# Supprimer les clés de test
redis-cli DEL "chat:cache:user_data:test-user"
redis-cli DEL "chat:cache:presence:test-user"
redis-cli DEL "chat:cache:user_sockets_set:test-user"
redis-cli DEL "chat:cache:rooms:conv_test"
redis-cli DEL "chat:cache:room_users:conv_test"
redis-cli DEL "chat:cache:user_rooms:test-user"
redis-cli DEL "chat:cache:room_data:conv_test:test-user"

# Supprimer tous les streams de test
redis-cli DEL "chat:stream:events:typing"
```

---

## 📈 Surveillance en Continu

### Script de Surveillance

```bash
#!/bin/bash

# Rafraîchir la sortie toutes les 2 secondes
watch -n 2 'echo "=== Chat Redis Status ===" && \
  echo "Users: $(redis-cli KEYS "chat:cache:user_data:*" | wc -l)" && \
  echo "Rooms: $(redis-cli KEYS "chat:cache:rooms:*" | wc -l)" && \
  echo "Streams typing: $(redis-cli XLEN "chat:stream:events:typing")" && \
  echo "Total keys: $(redis-cli DBSIZE | awk "{print $2}")"'
```

---

## 🚨 Alertes et Problèmes Courants

### ⚠️ Problème: Clés Anciennes et Nouvelles Coexistent

```bash
# Identifier les doublons
redis-cli KEYS "chat:cache:presence:*" > new_keys.txt
redis-cli KEYS "presence:*" > old_keys.txt

# Supprimer les anciennes
redis-cli DEL $(redis-cli KEYS "presence:*")
```

### ⚠️ Problème: Streams Manquants

```bash
# Créer un stream vide s'il n'existe pas
redis-cli XADD "chat:stream:wal" "*" placeholder "1"
redis-cli XDEL "chat:stream:wal" $(redis-cli XRANGE "chat:stream:wal" - + | head -1 | awk '{print $1}')
```

---

## ✅ Checklist de Vérification

- [ ] Toutes les clés utilisent le préfixe `chat:cache:` ou `chat:stream:`
- [ ] Aucune clé avec l'ancien préfixe
- [ ] Les TTL sont correctement définis
- [ ] Les streams contiennent les données attendues
- [ ] Les rooms contiennent les utilisateurs corrects
- [ ] Les présences sont correctement enregistrées
- [ ] Les derniers "seen" sont en cache 30 jours
- [ ] L'application démarre sans erreur
