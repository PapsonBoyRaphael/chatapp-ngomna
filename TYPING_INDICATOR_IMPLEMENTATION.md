<!-- TYPING_INDICATOR_IMPLEMENTATION.md -->

# 📝 Implémentation du Typing Indicator - Côté Serveur

## 📋 Vue d'ensemble

Le système de **typing indicator** est maintenant implémenté côté serveur avec :

1. **TypingIndicatorService** - Consumer Redis Streams qui traite les événements typing
2. **Consumer Group Redis** - Pour la livraison fiable des événements
3. **Broadcast WebSocket** - Aux destinataires en temps réel
4. **Timeouts automatiques** - Fallback si le client crash

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  CLIENT (Chat Web/App)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  TypingIndicator.js                                         │
│  - onUserTyping(conversationId)     → envoie "typing:start" │
│  - onUserStopTyping(conversationId) → envoie "typing:stop"  │
│  - Debounce 3s entre chaque refresh                         │
│  - Local timeout 8s pour affichage                          │
│                                                               │
└────────────────────────────────────────────────────────────┬─┘
                          │
                  Socket.IO emit
                  socket.emit("typing", {
                    conversationId,
                    event: "typing:start|refresh|stop"
                  })
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              SERVEUR (chat-file-service)                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ChatHandler.handleTyping()                                 │
│  - Envoie dans Redis Stream: "stream:events:typing"         │
│  - TTL: 60s (configuré dans StreamManager)                  │
│  - Fallback broadcast immédiat via Socket.IO                │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Redis Stream: stream:events:typing (MAXLEN: 2000)      │ │
│  │ TTL: 60 secondes (auto-expiration)                     │ │
│  └──────────────────────────────────────────────────────┬─┘ │
│                                                          │    │
│  TypingIndicatorService.startConsumer()                │    │
│  - Consumer Group: "typing-indicators"                 │    │
│  - Consommation: Toutes les 50ms (ultra-temps-réel)  │    │
│  - Parse événements: start/refresh/stop              │    │
│                                                         │    │
│  ┌──────────────────────────────────────────────────────┘   │
│  │                                                            │
│  ▼                                                            │
│  handleTypingStart(conversationId, userId)                  │
│  - Marque comme actif dans activeTypings Map              │
│  - Broadcast aux participants via Socket.IO               │
│  - Configure timeout local (10s)                          │
│  - Gère debounce (1s min entre broadcasts)               │
│                                                            │
│  handleTypingRefresh(conversationId, userId)              │
│  - Vérifie debounce côté serveur                        │
│  - Reset timeout automatique                             │
│                                                            │
│  handleTypingStop(conversationId, userId)                │
│  - Supprime l'état actif                                │
│  - Broadcast "stop" aux participants                    │
│  - Annule le timeout                                    │
│                                                            │
└─────────────────────────────────────────────────────────────┘
                          │
              Socket.IO broadcast
              socket.emit("typing:indicator", {
                conversationId,
                userId,
                status: "start|refresh|stop"
              })
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│           AUTRES CLIENTS (Participants)                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Socket.on("typing:indicator", data)                        │
│  → Appelle typingIndicator.onTypingIndicatorReceived(data) │
│                                                               │
│  TypingIndicator.showTypingIndicator(conversationId, userId)│
│  - Affiche "User is typing..." dans l'UI                   │
│  - Configure timeout 8s (si pas de refresh)                │
│                                                               │
│  TypingIndicator.hideTypingIndicator(conversationId, userId)│
│  - Cache l'indicateur après timeout ou "stop"              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Composants Implémentés

### 1. **TypingIndicatorService**

**Fichier** : `chat-file-service/src/infrastructure/services/TypingIndicatorService.js`

**Responsabilités** :

- Consumer Redis Streams pour `stream:events:typing`
- Traite les événements: `typing:start`, `typing:refresh`, `typing:stop`
- Broadcast WebSocket aux destinataires
- Gestion des timeouts automatiques (10s)
- Debounce côté serveur (1s minimum entre broadcasts)

**Methods principales** :

```javascript
async startConsumer()                           // Démarrer le consumer
async consumeTypingEvents()                     // Boucle de consommation (50ms)
async processTypingEvent(msg)                   // Traiter un événement
async handleTypingStart(conversationId, userId) // Début du typing
async handleTypingRefresh(conversationId, userId) // Refresh debounce
async handleTypingStop(conversationId, userId)  // Arrêt du typing
async broadcastTypingStatus(conversationId, userId, status) // Broadcast WebSocket
setTypingTimeout(conversationId, userId)       // Configure timeout 10s
getTypingUsers(conversationId)                  // Liste des users en typing
```

### 2. **ChatHandler.handleTyping()**

**Fichier** : `chat-file-service/src/application/websocket/chatHandler.js`

**Modifications** :

- Envoie événement dans Redis Stream au lieu de broadcast direct
- Ajoute fallback Socket.IO pour clients classiques
- Parse `conversationId` et `userId` depuis socket

```javascript
handleTyping(socket, data) {
  // Envoie dans stream:events:typing
  // Fallback broadcast immédiat
}

handleStopTyping(socket, data) {
  // Envoie typing:stop dans stream
  // Fallback broadcast immédiat
}
```

### 3. **TypingIndicator.js** (Client)

**Fichier** : `chat-file-service/public/TypingIndicator.js`

**Responsabilités** :

- Gère l'état du typing côté client
- Debounce 3s sans activité
- Envoie 3 événements: start, refresh, stop
- Affiche/masque les indicateurs "is typing..."

**Methods principales** :

```javascript
onUserTyping(conversationId); // Utilisateur commence à taper
onUserStopTyping(conversationId); // Utilisateur arrête
onTypingIndicatorReceived(data); // Reçoit événement du serveur
showTypingIndicator(conversationId, userId); // Afficher UI
hideTypingIndicator(conversationId, userId); // Masquer UI
getTypingUsers(conversationId); // Liste des users qui tapent
```

## 🔌 Intégration

### 1. **Serveur - index.js**

```javascript
const TypingIndicatorService = require("./infrastructure/services/TypingIndicatorService");

// Dans la section initialisation (après MessageDeliveryService)
typingIndicatorService = new TypingIndicatorService(
  redisClient,
  io,
  conversationRepository,
);
await typingIndicatorService.startConsumer();
app.locals.typingIndicatorService = typingIndicatorService;
```

### 2. **Client - HTML**

```html
<!-- Dans votre page chat -->
<script src="/TypingIndicator.js"></script>

<div id="typing-indicator-${conversationId}" style="display:none;">
  <!-- Les indicateurs seront ajoutés dynamiquement -->
</div>

<textarea id="message-input" placeholder="Tapez un message..."></textarea>

<script>
  const socket = io();
  const typingIndicator = new TypingIndicator(socket);
  const currentConversationId = "..."; // Récupérer depuis votre app

  // ✅ QUAND L'UTILISATEUR TAPE
  const inputField = document.getElementById("message-input");

  inputField.addEventListener("input", () => {
    typingIndicator.onUserTyping(currentConversationId);
  });

  inputField.addEventListener("blur", () => {
    typingIndicator.onUserStopTyping(currentConversationId);
  });

  // ✅ QUAND ON REÇOIT UN INDICATEUR TYPING
  socket.on("typing:indicator", (data) => {
    typingIndicator.onTypingIndicatorReceived(data);
  });

  // ✅ QUAND ON FERME LA PAGE
  window.addEventListener("beforeunload", () => {
    typingIndicator.cleanup();
  });
</script>
```

## ⚙️ Configuration

### StreamManager - TTL Configuration

**Fichier** : `shared/resilience/StreamManager.js`

```javascript
// ✅ CONFIGURATION DES TTL (en secondes)
this.STREAM_TTL = {
  [this.MESSAGE_STREAMS.TYPING]: options.typingTtl || 60,
};

// ✅ Dans addToStream() - Applique le TTL
const ttlSeconds = this.STREAM_TTL?.[streamName];
if (typeof ttlSeconds === "number" && ttlSeconds > 0) {
  this.redis.expire(streamName, ttlSeconds).catch(() => {
    // Ignorer les erreurs d'expiration
  });
}
```

**MAXLEN du Stream** : 2000 (géré automatiquement)

### TypingIndicatorService - Configuration

```javascript
// Dans le constructor:
this.TYPING_TIMEOUT = 10000; // 10s - Timeout côté serveur
this.DEBOUNCE_INTERVAL = 1000; // 1s - Minimum entre broadcasts
this.STREAM_NAME = "stream:events:typing";
this.CONSUMER_GROUP = "typing-indicators";
```

### TypingIndicator (Client) - Configuration

```javascript
this.DEBOUNCE_DELAY = 3000; // 3s sans activité = refresh
this.LOCAL_TIMEOUT = 8000; // 8s de timeout côté client
this.MIN_TYPING_INTERVAL = 1000; // 1s minimum entre envois
```

## 🔄 Flux d'une Session de Typing

### Scénario 1: Utilisateur tape normalement

```
t=0s   : Utilisateur commence à taper
         → TypingIndicator.onUserTyping()
         → socket.emit("typing", event: "typing:start")

t=0s   : ChatHandler.handleTyping()
         → redis.xAdd("stream:events:typing", "typing:start")
         → Fallback broadcast immédiat

t=0s   : Autres clients reçoivent
         → socket.on("typing:indicator", ...)
         → Affichent "User is typing..."
         → Configure timeout 8s

t=3s   : Utilisateur continue à taper (debounce)
         → socket.emit("typing", event: "typing:refresh")
         → TypingIndicatorService reset timeout

t=6s   : Utilisateur continue (nouveau refresh)
         → socket.emit("typing", event: "typing:refresh")

t=8s   : Utilisateur arrête complètement
         → TypingIndicator.onUserStopTyping()
         → socket.emit("typing", event: "typing:stop")
         → Autres clients masquent l'indicateur
```

### Scénario 2: Client crash sans envoyer "stop"

```
t=0s   : Utilisateur tape, envoie "typing:start"

t=5s   : Client crash/déconnexion

t=10s  : TypingIndicatorService timeout expire
         → handleTypingStop() appelé automatiquement
         → Broadcast "stop" aux autres clients
         → Autres clients masquent l'indicateur

t=60s  : Redis stream entry expirée (TTL)
         → Nettoyage automatique
```

## 📊 Événements Redis Stream

### Structure de l'événement

```javascript
// Dans stream:events:typing
{
  conversationId: "conv_123",
  userId: "user_456",
  event: "typing:start",        // ou "typing:refresh" ou "typing:stop"
  timestamp: "1707204120000"
}
```

## 🧪 Test de l'Implémentation

### 1. Vérifier que le service démarre

```bash
npm start
# Devrait afficher:
# ✅ TypingIndicatorService initialisé
# 🚀 Démarrage du consumer typing...
# ✅ Consumer group créé: typing-indicators
# ✅ Consumer typing démarré
```

### 2. Ouvrir 2 clients et taper

- **Client A** : Ouvre chat, rentre dans une conversation
- **Client B** : Ouvre même conversation
- **Client A** : Commence à taper → **Client B** doit voir "A is typing..."
- **Client A** : Arrête → **Client B** doit voir disparaître l'indicateur

### 3. Test du timeout automatique

- **Client A** : Simule crash en fermant rapidement le tab
- **Client B** : Doit voir l'indicateur disparaître après 10s max

### 4. Vérifier les streams Redis

```bash
redis-cli
XLEN stream:events:typing
XRANGE stream:events:typing - +
```

## 🐛 Dépannage

### L'indicateur ne s'affiche pas

1. Vérifier que TypingIndicatorService est démarré:
   ```bash
   npm start 2>&1 | grep "TypingIndicatorService"
   ```
2. Vérifier que le conversationId passé est correct
3. Vérifier que les participants sont dans `conversation.participants`

### Les événements ne sont pas envoyés

1. Vérifier que `resilientMessageService.redis` existe
2. Vérifier les logs: `socket.on("typing", data) → redis.xAdd()`
3. Vérifier que le stream existe dans Redis

### Indicateur reste bloqué ("stuck")

1. Le timeout local du client est peut-être cassé
2. Vérifier la console du navigateur pour les erreurs
3. Vérifier que `updateTypingUI()` trouve le container HTML

## 📈 Performance

- **Consommation** : 50ms (ultra-rapide pour typing)
- **Redis Stream MAXLEN** : 2000 (gestion automatique)
- **Redis Stream TTL** : 60s (fallback de nettoyage)
- **Debounce client** : 3s (réduit trafic réseau)
- **Debounce serveur** : 1s (évite les broadcasts dupliqués)
- **Timeout serveur** : 10s (fallback automatique)
- **Timeout client** : 8s (plus court pour UX réactif)

## 🔐 Sécurité

- ✅ Validation de `conversationId` et `userId`
- ✅ Broadcast seulement aux participants de la conversation
- ✅ Les utilisateurs ne voient que les typings de leur conversation
- ✅ Pas de stockage persistant (stream TTL 60s)
- ✅ Pas de données sensibles (juste userId et conversationId)

## 🔗 Fichiers Modifiés

1. **Créés** :
   - `chat-file-service/src/infrastructure/services/TypingIndicatorService.js`
   - `chat-file-service/public/TypingIndicator.js`

2. **Modifiés** :
   - `chat-file-service/src/index.js` - Ajout TypingIndicatorService
   - `chat-file-service/src/infrastructure/index.js` - Export TypingIndicatorService
   - `chat-file-service/src/application/websocket/chatHandler.js` - handleTyping/handleStopTyping
   - `shared/resilience/StreamManager.js` - Ajout STREAM_TTL config + expire()
   - `chat-file-service/shared/resilience/StreamManager.js` - Same changes
   - `auth-user-service/shared/resilience/StreamManager.js` - Same changes
