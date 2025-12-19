# CENADI Chat-File Service

Service unifié pour la messagerie instantanée et la gestion de fichiers, développé pour l'application de chat CENADI. Ce service combine la fonctionnalité de chat en temps réel avec la gestion complète des fichiers dans une architecture microservice moderne.

## 🏗️ Vue d'ensemble

Le **Chat-File Service** est le cœur de l'application de chat CENADI, offrant :

- **💬 Messagerie en temps réel** avec Socket.IO
- **📁 Gestion complète des fichiers** (upload, download, preview)
- **🗄️ Stockage MongoDB** pour les messages et conversations
- **⚡ Cache Redis** pour les performances
- **🖼️ Traitement automatique des médias** (images, vidéos, documents)
- **👥 Gestion des utilisateurs en ligne** et des salons
- **📊 Monitoring et health checks** intégrés

## 📋 Fonctionnalités

### Messagerie

- ✅ Messages texte, images, fichiers
- ✅ Conversations privées et de groupe
- ✅ Statuts de messages (envoyé, livré, lu)
- ✅ Indicateurs de frappe en temps réel
- ✅ Édition et suppression de messages
- ✅ Réactions aux messages
- ✅ Réponses aux messages (threading)

### Gestion des fichiers

- ✅ Upload de fichiers jusqu'à 100MB
- ✅ Support multi-format (images, vidéos, audio, documents)
- ✅ Génération automatique de miniatures
- ✅ Traitement des métadonnées
- ✅ Compression automatique
- ✅ Stockage local et cloud (MinIO/S3)
- ✅ Streaming pour les gros fichiers

### Temps réel

- ✅ WebSocket avec Socket.IO
- ✅ Gestion des utilisateurs en ligne
- ✅ Rooms automatiques par conversation
- ✅ Notifications push
- ✅ Synchronisation multi-device

## 🛠️ Technologies

- **Runtime** : Node.js 18+
- **Framework** : Express.js
- **WebSocket** : Socket.IO 4.7+
- **Base de données** : MongoDB 6.0+
- **Cache** : Redis 7.0+
- **Stockage** : MinIO (S3-compatible)
- **Traitement d'images** : Sharp
- **Architecture** : Clean Architecture + DDD

## 📦 Installation

### 1. Prérequis

```bash
# Node.js 18+ requis
node --version  # v18.0.0+
npm --version   # 8.0.0+

# MongoDB 6.0+
mongod --version

# Redis 7.0+ (optionnel mais recommandé)
redis-server --version

# MinIO (optionnel, pour stockage cloud)
# Ou utilisation du stockage local
```

### 2. Cloner le projet

```bash
git clone https://github.com/PapsonBoyRaphael/chatapp-ngomna.git
cd chatapp-ngomna/chat-file-service
```

### 3. Installer les dépendances

```bash
npm install
```

### 4. Configuration

Copiez le fichier de configuration :

```bash
cp .env.example .env
```

Éditez le fichier `.env` :

```bash
# ========================================================================
# CONFIGURATION ESSENTIELLE
# ========================================================================

# Environnement
NODE_ENV=development
PORT=8003

# Base de données MongoDB (OBLIGATOIRE)
MONGODB_URI=mongodb://localhost:27017/cenadi_chat_file_db

# Redis (RECOMMANDÉ pour les performances)
ENABLE_REDIS=true
REDIS_HOST=localhost
REDIS_PORT=6379

# Stockage des fichiers
FILE_STORAGE_TYPE=local  # local | minio | s3
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=100MB

# MinIO (optionnel, pour stockage cloud)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=chat-files

# Sécurité
JWT_SECRET=your_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here

# Services externes (optionnels)
AUTH_SERVICE_URL=http://localhost:8001
ENABLE_KAFKA=false
```

### 5. Démarrage

#### Mode développement

```bash
npm run dev
```

#### Mode production

```bash
npm start
```

#### Avec infrastructure complète

```bash
# Démarrer MongoDB, Redis, MinIO avec Docker
npm run dev:setup

# Puis démarrer le service
npm run dev
```

### 6. Vérification

```bash
# Health check
curl http://localhost:8003/health

# Interface de test
open http://localhost:8003/
```

## 🚀 Utilisation

### Interface Web de Test

Le service fournit une interface web complète pour tester toutes les fonctionnalités :

- **Interface principale** : http://localhost:8003/
- **Interface avancée** : http://localhost:8003/home.html

### API REST

#### Authentification

```bash
# Via service d'auth externe
curl -X POST http://localhost:8001/login \
  -H "Content-Type: application/json" \
  -d '{"matricule": "123456"}'

# Ou directement (mode dev)
curl -X POST http://localhost:8003/auth \
  -H "Content-Type: application/json" \
  -d '{"userId": "1", "matricule": "123456"}'
```

#### Messages

```bash
# Envoyer un message
curl -X POST http://localhost:8003/messages \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv123",
    "content": "Bonjour!",
    "type": "TEXT"
  }'

# Récupérer les messages
curl "http://localhost:8003/messages?conversationId=conv123&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Conversations

```bash
# Lister les conversations
curl http://localhost:8003/conversations \
  -H "Authorization: Bearer YOUR_TOKEN"

# Créer une conversation
curl -X POST http://localhost:8003/conversations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "PRIVATE",
    "participants": ["user1", "user2"]
  }'
```

#### Fichiers

```bash
# Upload de fichier
curl -X POST http://localhost:8003/files/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/file.jpg" \
  -F "conversationId=conv123"

# Télécharger un fichier
curl http://localhost:8003/files/FILE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o downloaded_file

# Lister mes fichiers
curl http://localhost:8003/files \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### WebSocket (Socket.IO)

#### Connexion JavaScript

```javascript
import io from "socket.io-client";

const socket = io("http://localhost:8003", {
  auth: {
    token: "YOUR_JWT_TOKEN",
  },
});

// Authentification
socket.emit("authenticate", {
  userId: "123",
  matricule: "USER123",
});

// Envoyer un message
socket.emit("sendMessage", {
  conversationId: "conv123",
  content: "Bonjour!",
  type: "TEXT",
});

// Écouter les nouveaux messages
socket.on("newMessage", (data) => {
  console.log("Nouveau message:", data);
});

// Marquer comme lu
socket.emit("markMessageRead", {
  messageId: "msg123",
  conversationId: "conv123",
});
```

#### Connexion Flutter

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class ChatService {
  IO.Socket? socket;

  void connect(String token) {
    socket = IO.io('http://localhost:8003', IO.OptionBuilder()
        .setTransports(['websocket'])
        .setAuth({'token': token})
        .build());

    socket!.onConnect((_) => authenticate());
    socket!.on('newMessage', handleNewMessage);
    socket!.on('messageDelivered', handleMessageDelivered);
  }

  void authenticate() {
    socket!.emit('authenticate', {
      'userId': '123',
      'matricule': 'USER123'
    });
  }

  void sendMessage(String conversationId, String content) {
    socket!.emit('sendMessage', {
      'conversationId': conversationId,
      'content': content,
      'type': 'TEXT'
    });
  }
}
```

### Événements WebSocket

| Événement              | Description                | Données                           |
| ---------------------- | -------------------------- | --------------------------------- |
| `authenticate`         | S'authentifier             | `{userId, matricule}`             |
| `sendMessage`          | Envoyer un message         | `{conversationId, content, type}` |
| `joinConversation`     | Rejoindre une conversation | `{conversationId}`                |
| `leaveConversation`    | Quitter une conversation   | `{conversationId}`                |
| `typing`               | Indiquer qu'on tape        | `{conversationId}`                |
| `stopTyping`           | Arrêter de taper           | `{conversationId}`                |
| `markMessageRead`      | Marquer comme lu           | `{messageId, conversationId}`     |
| `markMessageDelivered` | Marquer comme livré        | `{messageId, conversationId}`     |
| `getOnlineUsers`       | Utilisateurs en ligne      | `{}`                              |

### Réponses WebSocket

| Événement          | Description          | Données                    |
| ------------------ | -------------------- | -------------------------- |
| `authenticated`    | Confirmation d'auth  | `{userId, status}`         |
| `newMessage`       | Nouveau message      | `{message, conversation}`  |
| `messageDelivered` | Message livré        | `{messageId, deliveredAt}` |
| `messageRead`      | Message lu           | `{messageId, readAt}`      |
| `userOnline`       | Utilisateur en ligne | `{userId, status}`         |
| `userTyping`       | Utilisateur tape     | `{userId, conversationId}` |

## 📁 Architecture

```
chat-file-service/
├── src/
│   ├── application/           # Use Cases & Controllers
│   │   ├── controllers/       # Controllers REST
│   │   ├── use-cases/         # Business Logic
│   │   └── websocket/         # WebSocket Handler
│   ├── domain/               # Entités & Business Rules
│   │   ├── entities/         # Message, Conversation, File
│   │   └── repositories/     # Interfaces Repository
│   ├── infrastructure/       # Implémentations techniques
│   │   ├── mongodb/          # MongoDB Models & Connection
│   │   ├── redis/            # Redis Services
│   │   ├── repositories/     # Repository Implementations
│   │   └── services/         # Services techniques
│   ├── interfaces/           # Points d'entrée
│   │   └── http/             # Routes & Middleware
│   └── config/               # Configuration
├── public/                   # Interface de test web
├── uploads/                  # Stockage local des fichiers
├── logs/                     # Logs d'application
└── scripts/                  # Scripts utilitaires
```

## 🔧 Configuration avancée

### Variables d'environnement complètes

```bash
# ========================================================================
# CONFIGURATION COMPLÈTE - CHAT-FILE SERVICE
# ========================================================================

# Base
NODE_ENV=development|production|test
PORT=8003
SERVER_ID=chat-file-service-1

# Sécurité
JWT_SECRET=your_complex_jwt_secret_here
JWT_ALGORITHM=HS256
ENCRYPTION_KEY=your_encryption_key_32chars

# MongoDB
MONGODB_URI=mongodb://localhost:27017/cenadi_chat_file_db
MONGODB_MAX_CONNECTIONS=10
MONGODB_CONNECTION_TIMEOUT=30000

# Redis (recommandé)
ENABLE_REDIS=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TTL=3600

# Stockage des fichiers
FILE_STORAGE_TYPE=local
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=104857600
ALLOWED_FILE_TYPES=image/*,video/*,audio/*,application/pdf

# MinIO/S3 (pour stockage cloud)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=cenadi-chat-files
S3_REGION=us-east-1

# WebSocket
WEBSOCKET_ENABLED=true
WEBSOCKET_CORS_ORIGINS=http://localhost:3000,http://localhost:8000
WEBSOCKET_PING_TIMEOUT=60000
WEBSOCKET_PING_INTERVAL=25000

# Services externes
AUTH_SERVICE_URL=http://localhost:8001
USER_SERVICE_URL=http://localhost:8002
NOTIFICATION_SERVICE_URL=http://localhost:8004

# Performance
CLUSTER_MODE=false
ENABLE_COMPRESSION=true
REQUEST_TIMEOUT=30000
MAX_REQUEST_SIZE=100mb

# Monitoring
ENABLE_LOGGING=true
LOG_LEVEL=info
LOG_FILE=./logs/chat-file-service.log
ENABLE_METRICS=true

# Développement
ENABLE_SWAGGER=true
ENABLE_DEBUG_ROUTES=true
HOT_RELOAD=true
```

### Configuration MongoDB

```javascript
// Configuration optimisée pour MongoDB
const mongoConfig = {
  uri: process.env.MONGODB_URI,
  options: {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    bufferMaxEntries: 0,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
};
```

### Configuration Redis

```javascript
// Configuration Redis pour le cache et les sessions
const redisConfig = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  db: process.env.REDIS_DB,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
};
```

## 🚀 Déploiement

### Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 8003

CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: "3.8"
services:
  chat-file-service:
    build: .
    ports:
      - "8003:8003"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/cenadi_chat
      - REDIS_HOST=redis
    depends_on:
      - mongo
      - redis
    volumes:
      - uploads:/app/uploads

  mongo:
    image: mongo:6.0
    volumes:
      - mongo_data:/data/db

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

volumes:
  uploads:
  mongo_data:
  redis_data:
```

### Kubernetes

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-file-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: chat-file-service
  template:
    metadata:
      labels:
        app: chat-file-service
    spec:
      containers:
        - name: chat-file-service
          image: cenadi/chat-file-service:latest
          ports:
            - containerPort: 8003
          env:
            - name: NODE_ENV
              value: "production"
            - name: MONGODB_URI
              valueFrom:
                secretKeyRef:
                  name: chat-secrets
                  key: mongodb-uri
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

## 📊 Monitoring

### Health Checks

```bash
# Health check simple
curl http://localhost:8003/health

# Health check détaillé
curl http://localhost:8003/health/detailed

# Statistiques
curl http://localhost:8003/stats
```

### Métriques disponibles

```javascript
// Métriques exposées
{
  "service": "chat-file-service",
  "status": "healthy",
  "uptime": 3600,
  "connections": {
    "websocket": 150,
    "mongodb": "connected",
    "redis": "connected"
  },
  "performance": {
    "avgResponseTime": 45,
    "requestsPerSecond": 120,
    "memoryUsage": "256MB"
  },
  "features": {
    "chat": true,
    "files": true,
    "redis": true,
    "thumbnails": true
  }
}
```

### Logging

```javascript
// Configuration des logs
const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: "./logs/error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "./logs/combined.log",
    }),
  ],
});
```

## 🔍 Développement

### Scripts disponibles

```bash
# Développement
npm run dev              # Démarrer en mode dev avec hot reload
npm run dev:full         # Démarrer avec infrastructure complète
npm run dev:setup        # Démarrer MongoDB, Redis, MinIO
npm run dev:logs         # Suivre les logs en temps réel

# Tests
npm test                 # Lancer tous les tests
npm run test:unit        # Tests unitaires seulement
npm run test:integration # Tests d'intégration
npm run test:e2e         # Tests end-to-end

# Production
npm start                # Démarrer en mode production
npm run build            # Construire pour la production

# Maintenance
npm run health           # Vérifier la santé du service
npm run stats            # Afficher les statistiques
npm run clean            # Nettoyer les fichiers temporaires
npm run migrate          # Migrations de base de données
```

### Tests

```javascript
// Exemple de test unitaire
const { sendMessage } = require("../src/application/use-cases/SendMessage");

describe("SendMessage Use Case", () => {
  test("should send a text message successfully", async () => {
    const messageData = {
      senderId: "user1",
      conversationId: "conv1",
      content: "Hello World",
      type: "TEXT",
    };

    const result = await sendMessage.execute(messageData);

    expect(result.success).toBe(true);
    expect(result.message.content).toBe("Hello World");
  });
});
```

### Structure des tests

```
tests/
├── unit/                 # Tests unitaires
│   ├── use-cases/
│   ├── entities/
│   └── services/
├── integration/          # Tests d'intégration
│   ├── controllers/
│   ├── repositories/
│   └── websocket/
├── e2e/                  # Tests end-to-end
│   ├── api/
│   └── websocket/
└── fixtures/             # Données de test
```

## 🐛 Dépannage

### Problèmes courants

#### 1. MongoDB non connecté

```bash
# Vérifier MongoDB
sudo systemctl status mongod
sudo systemctl start mongod

# Ou avec Docker
docker run -d -p 27017:27017 mongo:6.0
```

#### 2. Redis non disponible

```bash
# Le service fonctionne sans Redis (mode dégradé)
# Pour activer Redis :
sudo systemctl start redis-server

# Ou avec Docker
docker run -d -p 6379:6379 redis:7-alpine
```

#### 3. Erreurs d'upload de fichiers

```bash
# Vérifier les permissions
chmod 755 ./uploads
chown -R $USER:$USER ./uploads

# Vérifier l'espace disque
df -h
```

#### 4. WebSocket ne se connecte pas

```javascript
// Vérifier la configuration CORS
const cors = require("cors");
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:8000"],
    credentials: true,
  })
);
```

### Logs de débogage

```bash
# Activer les logs détaillés
DEBUG=chat-file-service:* npm run dev

# Suivre les logs
tail -f ./logs/chat-file-service.log

# Logs MongoDB
tail -f /var/log/mongodb/mongod.log

# Logs Redis
redis-cli monitor
```

### Performance

```bash
# Analyser les performances
npm run perf

# Profiling mémoire
node --inspect src/index.js

# Monitoring en temps réel
htop
iotop -a
```

## 📚 API Documentation

### Endpoints principaux

| Méthode | Endpoint         | Description              |
| ------- | ---------------- | ------------------------ |
| `GET`   | `/health`        | Health check du service  |
| `GET`   | `/stats`         | Statistiques du service  |
| `POST`  | `/messages`      | Envoyer un message       |
| `GET`   | `/messages`      | Récupérer les messages   |
| `GET`   | `/conversations` | Lister les conversations |
| `POST`  | `/conversations` | Créer une conversation   |
| `POST`  | `/files/upload`  | Upload de fichier        |
| `GET`   | `/files/:id`     | Télécharger un fichier   |
| `GET`   | `/files`         | Lister mes fichiers      |

### Codes de réponse

| Code  | Description             |
| ----- | ----------------------- |
| `200` | Succès                  |
| `201` | Créé avec succès        |
| `400` | Erreur de validation    |
| `401` | Non authentifié         |
| `403` | Non autorisé            |
| `404` | Ressource non trouvée   |
| `413` | Fichier trop volumineux |
| `429` | Trop de requêtes        |
| `500` | Erreur serveur          |

## 🤝 Contribution

### Guidelines

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

### Standards de code

```javascript
// Utiliser ESLint et Prettier
npm run lint
npm run format

// Tests requis
npm test

// Documentation requise pour les nouvelles features
```

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 👥 Équipe

- **CENADI** - Développement principal
- **Contributeurs** - Voir [CONTRIBUTORS.md](CONTRIBUTORS.md)

## 🔗 Liens utiles

- **Repository** : https://github.com/PapsonBoyRaphael/chatapp-ngomna
- **Documentation** : https://cenadi.docs.com/chat-service
- **Support** : https://cenadi.support.com
- **Status** : https://status.cenadi.com

---

**Version** : 1.0.0  
**Dernière mise à jour** : Décembre 2024  
**Environnement de test** : http://localhost:8003/
