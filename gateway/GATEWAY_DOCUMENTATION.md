# Documentation du Gateway

## 1. Introduction

Le `gateway` est un service central qui agit comme un point d'entrée unique pour l'ensemble des microservices de l'application. Il est responsable de la gestion des requêtes entrantes, du routage vers les services appropriés et de la mise en œuvre des politiques de sécurité telles que l'authentification et l'autorisation.

Ce service est conçu pour simplifier l'intégration entre le frontend et les différents microservices backend.

---

## 2. Configuration

Pour exécuter le service, les variables d'environnement suivantes doivent être configurées dans un fichier `.env` :

| Variable                 | Description                                                                   |
| ------------------------ | ----------------------------------------------------------------------------- |
| `NODE_ENV`               | Définit l'environnement d'exécution (ex: `development`, `production`).        |
| `GATEWAY_PORT`           | Port sur lequel le service Gateway écoute (ex: `8000`).                       |
| `AUTH_USER_SERVICE_URL`  | URL du service d'authentification (ex: `http://localhost:8001`).              |
| `VISIBILITY_SERVICE_URL` | URL du service de visibilité (ex: `http://localhost:8002`).                   |
| `CHAT_FILE_SERVICE_URL`  | URL du service de gestion des fichiers de chat (ex: `http://localhost:8003`). |

Assurez-vous que ces variables sont correctement définies avant de démarrer le service.

---

## 3. Endpoints

Voici la liste des endpoints exposés par le service :

### **GET /api/status**

- **Description** : Vérifie l'état du gateway.
- **Réponse** :
  ```json
  {
    "status": "ok",
    "timestamp": "2026-01-28T12:00:00Z"
  }
  ```

### **POST /api/proxy/auth/login**

- **Description** : Proxy pour l'authentification des utilisateurs via le `auth-user-service`.
- **Body** :
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Réponse** :
  ```json
  {
    "token": "<jwt_token>",
    "expiresIn": 3600
  }
  ```

### **POST /api/proxy/chat/upload**

- **Description** : Proxy pour l'upload de fichiers via le `chat-file-service`.
- **Headers** :
  - `Authorization: Bearer <jwt_token>`
- **Body** :
  ```json
  {
    "file": "<binary_data>",
    "metadata": {
      "chatId": "12345"
    }
  }
  ```
- **Réponse** :
  ```json
  {
    "message": "File uploaded successfully",
    "fileId": "<file_id>"
  }
  ```

---

## 4. Exemple de flux

Voici un exemple de flux typique entre le frontend et le `gateway` :

1. **Vérification de l'état** :
   - Le frontend appelle `/api/status` pour vérifier que le gateway est opérationnel.

2. **Connexion** :
   - L'utilisateur se connecte via `/api/proxy/auth/login` et reçoit un token JWT.

3. **Accès aux ressources protégées** :
   - Le frontend utilise le token JWT pour accéder aux endpoints protégés, comme `/api/proxy/chat/upload`.

---

## 5. Bonnes pratiques

- **Validation des entrées** :
  - Assurez-vous que toutes les données envoyées au gateway sont validées pour éviter les attaques par injection.

- **Sécuriser les tokens JWT** :
  - Utilisez des cookies sécurisés pour transmettre les tokens JWT et évitez de les exposer dans le `localStorage`.

- **Utiliser HTTPS** :
  - Toutes les communications entre le frontend et le gateway doivent être chiffrées.

- **Limiter les requêtes** :
  - Implémentez un mécanisme de limitation des requêtes pour éviter les abus.

- **Surveiller les logs** :
  - Analysez régulièrement les journaux du gateway pour détecter les comportements suspects.

---

Cette documentation fournit toutes les informations nécessaires pour connecter un frontend au `gateway`. Assurez-vous de suivre les bonnes pratiques pour garantir une intégration sécurisée et efficace.
