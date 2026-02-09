# Documentation d'intégration - Client Flutter

## Vue d'ensemble

Cette documentation explique comment intégrer le système de chat et de présence dans une application Flutter mobile. Le système repose sur Socket.IO pour la communication temps réel et respecte la confidentialité en limitant la visibilité de la présence aux contacts uniquement.

---

## 🔌 Architecture de connexion

### 1. Configuration Socket.IO

**Package requis** : `socket_io_client`

**Paramètres de connexion** :

- URL du serveur : `http://localhost:8003` (ou votre serveur de production)
- Transports : WebSocket en priorité, polling en fallback
- Auto-reconnexion : Activée avec délai progressif
- Timeout : 5000ms

### 2. Cycle de vie de l'application

**États de connexion à gérer** :

- `disconnected` → État initial, socket non créé
- `connecting` → Tentative de connexion en cours
- `connected` → Socket connecté mais pas authentifié
- `authenticated` → Utilisateur authentifié et prêt

**Intégration avec le cycle de vie Flutter** :

- `AppLifecycleState.resumed` → Reconnecter si nécessaire
- `AppLifecycleState.paused` → Le serveur gère automatiquement l'idle après 2 minutes
- `AppLifecycleState.inactive` → Maintenir la connexion
- `AppLifecycleState.detached` → Déconnecter proprement

---

## 🔐 Flux d'authentification

### Étape 1 : Connexion du socket

Établir la connexion WebSocket avec le serveur sans authentification.

### Étape 2 : Émission du token

Envoyer l'événement `authenticate` avec le JWT stocké localement (SharedPreferences ou SecureStorage).

**Payload à envoyer** :

```
Événement: "authenticate"
Données: { token: "votre_jwt_token" }
```

### Étape 3 : Réception de la confirmation

**Succès** → Événement `authenticated` :

- Contient : userId, matricule, autres infos utilisateur
- Le serveur joint automatiquement :
  - Room personnelle : `user_${userId}`
  - Rooms des conversations : `conversation_${convId}` pour chaque conversation
- Déclenche l'envoi de `user_online` aux contacts

**Échec** → Événement `auth_error` :

- Contient : message d'erreur, code d'erreur
- Actions : Rediriger vers login, rafraîchir le token, afficher erreur

---

## 👥 Système de présence (Privacy-First)

### Principe de confidentialité

**Règle fondamentale** : Un utilisateur ne reçoit les événements de présence QUE pour ses contacts (personnes avec qui il partage au moins une conversation).

**Ce que cela signifie** :

- Si vous n'avez jamais discuté avec quelqu'un → Vous ne voyez pas son statut
- Si vous partagez une conversation privée → Vous voyez mutuellement vos statuts
- Si vous êtes dans un groupe → Tous les membres voient les statuts des autres membres

### Événements de présence à écouter

#### `user_online`

**Quand** : Un contact se connecte ou devient actif après idle
**Données reçues** :

- `userId` : Identifiant du contact
- `matricule` : Matricule ou nom d'affichage
- `lastActivity` : Timestamp de la dernière activité
- `status` : Toujours "online"

**Action UI** :

- Afficher un point vert à côté du contact
- Mettre à jour la liste des utilisateurs en ligne
- Éventuellement déclencher une notification légère

#### `user_offline`

**Quand** : Un contact se déconnecte complètement (ferme l'app, perd la connexion)
**Données reçues** :

- `userId` : Identifiant du contact
- `matricule` : Matricule ou nom d'affichage

**Action UI** :

- Retirer le point vert
- Afficher "Hors ligne" ou masquer le statut
- Mettre à jour le cache local

#### `user_idle`

**Quand** : Un contact est inactif depuis plus de 2 minutes (app en arrière-plan, écran verrouillé)
**Données reçues** :

- `userId` : Identifiant du contact
- `matricule` : Matricule ou nom d'affichage
- `lastActivity` : Timestamp de la dernière activité

**Action UI** :

- Afficher un point orange ou gris
- Montrer "Absent" ou "Inactif"
- Afficher "Actif il y a X minutes"

### Demande manuelle de statuts

#### Événement à émettre : `getOnlineUsers`

**Quand l'utiliser** :

- Au démarrage de l'application après authentification
- Lors du rafraîchissement de la liste de contacts
- Après une reconnexion

**Réponse attendue** → Événement `onlineUsers` :

- `users` : Array d'objets contenant :
  - `userId` : Identifiant
  - `matricule` : Nom d'affichage
  - `status` : "online" ou "idle"
  - `lastActivity` : Timestamp

---

## 💬 Événements de messagerie

### Réception de messages

#### `newMessage`

**Données** :

- `messageId` : ID unique du message
- `conversationId` : ID de la conversation
- `senderId` : ID de l'expéditeur
- `senderName` : Nom de l'expéditeur
- `content` : Contenu du message
- `type` : "text", "image", "file", etc.
- `timestamp` : Date d'envoi
- `status` : "sent", "delivered", "read"

**Actions** :

- Ajouter le message dans le StreamController ou StateNotifier
- Afficher une notification si conversation non ouverte
- Jouer un son (si paramètres permettent)
- Envoyer automatiquement `messageDelivered`

### Envoi de messages

**Événement à émettre** : `sendMessage`
**Payload** :

- `conversationId` : ID de la conversation
- `content` : Contenu du message
- `type` : Type de message
- Optionnel : `replyTo`, `metadata`

**Réponses possibles** :

- `message_sent` → Succès, contient `messageId`, `timestamp`
- `message_error` → Échec, contient `error`, `code`

### Accusés de réception

**Événements à émettre** :

- `messageDelivered` → Quand le message est reçu et affiché
- `messageRead` → Quand l'utilisateur ouvre la conversation

**Événements à écouter** :

- `messageDelivered` → Un contact a reçu votre message
- `messageRead` → Un contact a lu votre message

---

## ⌨️ Indicateurs de frappe

### Émettre son propre statut

**Événement** : `typing`
**Payload** :

- `conversationId` : ID de la conversation
- `isTyping` : `true` pour commencer, `false` pour arrêter

**Bonne pratique** :

- Envoyer `isTyping: true` dès le premier caractère tapé
- Utiliser un debounce de 1 seconde
- Envoyer `isTyping: false` après 3 secondes d'inactivité
- Toujours envoyer `false` avant d'envoyer le message

### Recevoir les indicateurs

**Événement** : `typing`
**Données** :

- `userId` : ID de l'utilisateur qui tape
- `userName` : Nom de l'utilisateur
- `conversationId` : ID de la conversation
- `isTyping` : Boolean

**Action UI** :

- Afficher "X est en train d'écrire..." dans la conversation
- Masquer après 3 secondes si aucune mise à jour

---

## 🏗️ Architecture Flutter recommandée

### State Management

**Trois couches principales** :

1. **Service Layer** (Socket Manager)
   - Gère la connexion Socket.IO
   - Expose des Streams pour les événements
   - Méthodes pour émettre des événements
   - Gestion de la reconnexion automatique

2. **Repository Layer**
   - Cache local avec Hive ou Isar
   - Synchronisation avec le serveur
   - Gestion des états offline/online
   - File d'attente pour messages non envoyés

3. **State Layer** (Riverpod, Bloc, Provider)
   - États de présence des utilisateurs
   - Liste des conversations
   - Messages par conversation
   - Indicateurs de frappe

### Gestion du cache

**Données à cacher localement** :

- Liste des conversations avec dernier message
- Messages de chaque conversation (pagination)
- Informations des contacts
- Statuts de présence (avec TTL de 5 minutes)

**Synchronisation** :

- À l'ouverture : Charger le cache immédiatement
- En arrière-plan : Récupérer les mises à jour du serveur
- Stratégie : Cache-first avec background sync

### Gestion des notifications

**En foreground** :

- Afficher un snackbar ou une bannière in-app
- Mettre à jour le badge de l'icône de conversation
- Jouer un son léger

**En background** :

- Utiliser Firebase Cloud Messaging (FCM)
- Le serveur envoie une notification push quand l'utilisateur est offline
- Tapper sur la notification ouvre la conversation

---

## 🔄 Gestion de la reconnexion

### Scénarios de déconnexion

1. **Perte de connexion réseau** :
   - Socket.IO tente automatiquement la reconnexion
   - Afficher un indicateur "Connexion en cours..."
   - Ré-authentifier dès la reconnexion

2. **Application mise en arrière-plan** :
   - Maintenir la connexion socket pendant 5-10 minutes
   - Après ce délai, le serveur marque l'utilisateur comme idle
   - Reconnecter immédiatement au retour en foreground

3. **Token expiré** :
   - Recevoir `auth_error` avec code spécifique
   - Rafraîchir le token avec refresh_token
   - Ré-authentifier automatiquement

### File d'attente de messages

**Problème** : Message envoyé pendant une déconnexion

**Solution** :

1. Stocker le message localement avec statut "pending"
2. Afficher le message dans l'UI avec un indicateur d'attente
3. À la reconnexion, renvoyer tous les messages "pending"
4. Mettre à jour le statut en "sent" après confirmation

---

## 🎨 Recommandations UI/UX

### Indicateurs de statut

**Tailles** :

- Liste de contacts : Petit point (8-10px)
- Barre de conversation : Point moyen (12px) + texte
- Profil utilisateur : Grand point (16px) + texte détaillé

**Couleurs** :

- Vert (#4CAF50) : En ligne
- Orange (#FF9800) : Inactif/Idle
- Gris (#9E9E9E) : Hors ligne
- Pas d'indicateur : Statut inconnu (non-contact)

### Optimisations de performance

1. **Liste de conversations** :
   - Utiliser ListView.builder avec lazy loading
   - Charger 20 conversations à la fois
   - Afficher les statuts uniquement pour conversations visibles

2. **Messages** :
   - Pagination inversée (charger les anciens en scrollant vers le haut)
   - Garder maximum 100 messages en mémoire
   - Libérer les messages hors écran

3. **Présence** :
   - Mettre à jour les statuts par batch (toutes les 2 secondes)
   - Ne pas reconstruire tout le widget pour un changement de statut
   - Utiliser ValueListenableBuilder ou similaire pour micro-updates

### Gestion des erreurs

**Affichage utilisateur** :

- Message clair et actionnable
- Bouton "Réessayer" si applicable
- Option "Contacter le support" pour erreurs persistantes

**Erreurs à anticiper** :

- Connexion internet perdue → "Pas de connexion. Vérifiez votre réseau."
- Token expiré → Reconnexion automatique, transparent pour l'utilisateur
- Message non envoyé → "Échec de l'envoi. Appuyez pour réessayer."
- Serveur indisponible → "Service temporairement indisponible. Réessai automatique..."

---

## 📊 Métriques et monitoring

### Côté client

**Événements à tracer** :

- Temps de connexion initiale
- Nombre de reconnexions par session
- Taux de succès d'envoi de messages
- Latence moyenne des messages
- Fréquence des erreurs d'authentification

**Analytics** :

- Utiliser Firebase Analytics ou similaire
- Ne jamais logger le contenu des messages
- Logger uniquement les métadonnées (IDs, timestamps, types)

---

## 🔒 Sécurité

### Protection du token

- Stocker le JWT dans FlutterSecureStorage (pas SharedPreferences)
- Ne jamais logger le token
- Implémenter un mécanisme de refresh token
- Invalider le token lors de la déconnexion

### Validation des données

- Valider tous les champs reçus du serveur
- Ne jamais faire confiance aux données du socket sans vérification
- Sanitiser le contenu des messages avant affichage
- Gérer les cas où `userId`, `conversationId` sont null

### HTTPS/WSS

- En production, utiliser HTTPS pour l'API REST
- Utiliser WSS (WebSocket Secure) pour Socket.IO
- Épingler le certificat SSL (certificate pinning) si possible

---

## 📱 Spécificités mobiles

### Gestion de la batterie

**Optimisations** :

- Réduire la fréquence de ping à 30-60 secondes
- Grouper les mises à jour de statut
- Déconnecter après 10 minutes en arrière-plan
- Utiliser WorkManager pour synchronisation périodique

### Permissions

**Android** :

- `INTERNET` : Requis pour Socket.IO
- `ACCESS_NETWORK_STATE` : Détecter les changements de connectivité
- Notifications : Demander permission runtime pour Android 13+

**iOS** :

- Background modes : "fetch", "remote-notification"
- NSAppTransportSecurity : Configurer pour permettre WebSocket

### Tests

**Scénarios à tester** :

- Mode avion activé puis désactivé
- Changement de WiFi à données mobiles
- Application tuée puis rouverte
- Notifications reçues app fermée
- Plusieurs comptes sur plusieurs devices

---

## 🚀 Checklist d'intégration

- [ ] Intégrer `socket_io_client` package
- [ ] Créer un SocketService avec gestion du cycle de vie
- [ ] Implémenter l'authentification automatique au démarrage
- [ ] Écouter les 3 événements de présence (online, offline, idle)
- [ ] Implémenter l'envoi et réception de messages
- [ ] Ajouter les indicateurs de frappe
- [ ] Gérer la reconnexion automatique
- [ ] Implémenter le cache local avec Hive/Isar
- [ ] Ajouter une file d'attente pour messages offline
- [ ] Configurer les notifications push (FCM)
- [ ] Afficher les statuts de présence dans l'UI
- [ ] Tester tous les scénarios de déconnexion
- [ ] Implémenter le refresh token
- [ ] Ajouter analytics et error tracking
- [ ] Optimiser la performance (lazy loading, pagination)

---

## 📞 Support et ressources

**Documentation Socket.IO Flutter** :

- Package officiel : socket_io_client sur pub.dev
- Exemples de reconnexion et gestion d'erreurs

**Architecture recommandée** :

- Riverpod pour state management moderne
- Freezed pour les modèles immutables
- Hive pour le cache local rapide
- Auto_route pour navigation type-safe

**Outils de debug** :

- Socket.IO Inspector (outil navigateur)
- Flutter DevTools pour performance
- Charles Proxy pour inspecter WebSocket
