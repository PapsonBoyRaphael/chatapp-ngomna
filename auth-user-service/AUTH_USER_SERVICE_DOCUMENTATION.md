# Documentation du Auth-User-Service

## 1. Introduction

Le `auth-user-service` est un microservice responsable de la gestion des utilisateurs et de l'authentification dans l'application. Il fournit des fonctionnalités telles que la création d'utilisateurs, la connexion, la déconnexion et la validation des tokens JWT.

Ce service est conçu pour être utilisé par un frontend afin de gérer les utilisateurs et leurs sessions de manière sécurisée.

---

## 2. Configuration

Pour exécuter le service, les variables d'environnement suivantes doivent être configurées dans un fichier `.env` :

| Variable                   | Description                                                                 |
| -------------------------- | --------------------------------------------------------------------------- |
| `AUTH_USER_SERVICE_PORT`   | Port sur lequel le service écoute (ex: `8001`).                             |
| `DB_HOST`                  | Hôte de la base de données PostgreSQL (ex: `localhost`).                    |
| `DB_PORT`                  | Port de la base de données PostgreSQL (ex: `5432`).                         |
| `DB_NAME`                  | Nom de la base de données utilisée par le service (ex: `personnel_db`).     |
| `DB_USER`                  | Nom d'utilisateur pour la base de données (ex: `postgres`).                 |
| `DB_PASSWORD`              | Mot de passe pour la base de données (ex: `postgres`).                      |
| `JWT_SECRET`               | Clé secrète utilisée pour signer et valider les tokens JWT.                 |
| `REDIS_HOST`               | Hôte de l'instance Redis (ex: `localhost`).                                 |
| `REDIS_PORT`               | Port de l'instance Redis (ex: `6379`).                                      |
| `REDIS_PASSWORD`           | Mot de passe pour Redis (laisser vide si non requis).                       |
| `REDIS_DB`                 | Numéro de la base Redis utilisée (ex: `0`).                                 |
| `REDIS_FAMILY`             | Version de Redis (ex: `4` pour IPv4).                                       |
| `REDIS_KEEP_ALIVE`         | Active ou désactive la persistance de connexion Redis (ex: `false`).        |
| `REDIS_CONNECTION_TIMEOUT` | Délai d'expiration pour les connexions Redis en millisecondes (ex: `5000`). |
| `REDIS_MAX_RETRY_ATTEMPTS` | Nombre maximum de tentatives de reconnexion à Redis (ex: `3`).              |

Assurez-vous que ces variables sont correctement définies avant de démarrer le service.

---

## 3. Endpoints

Voici la liste des endpoints exposés par le service, basés sur les use-cases et les routes :

### **POST /login**

- **Description** : Authentifie un utilisateur et retourne des tokens JWT.
- **Body** :
  ```json
  {
    "matricule": "12345"
  }
  ```
- **Réponse** :
  ```json
  {
    "user": {
      "id": "<user_id>",
      "matricule": "12345",
      "nom": "Doe",
      "prenom": "John"
    },
    "accessToken": "<jwt_token>",
    "refreshToken": "<refresh_token>"
  }
  ```

### **POST /**

- **Description** : Crée un nouvel utilisateur.
- **Body** :
  ```json
  {
    "matricule": "12345",
    "nom": "Doe",
    "prenom": "John",
    "ministere": "Ministère de l'Éducation",
    "sexe": "M"
  }
  ```
- **Réponse** :
  ```json
  {
    "id": "<user_id>",
    "matricule": "12345",
    "nom": "Doe",
    "prenom": "John"
  }
  ```

### **GET /all**

- **Description** : Retourne tous les utilisateurs.
- **Réponse** :
  ```json
  [
    {
      "id": "<user_id>",
      "matricule": "12345",
      "nom": "Doe",
      "prenom": "John"
    }
  ]
  ```

### **GET /batch**

- **Description** : Récupère plusieurs utilisateurs par lot.
- **Body** :
  ```json
  {
    "userIds": ["id1", "id2"]
  }
  ```
- **Réponse** :
  ```json
  [
    {
      "id": "id1",
      "matricule": "12345",
      "nom": "Doe",
      "prenom": "John"
    },
    {
      "id": "id2",
      "matricule": "67890",
      "nom": "Smith",
      "prenom": "Jane"
    }
  ]
  ```

### **PUT /:id**

- **Description** : Met à jour un utilisateur existant.
- **Body** :
  ```json
  {
    "nom": "Doe",
    "prenom": "John Updated"
  }
  ```
- **Réponse** :
  ```json
  {
    "id": "<user_id>",
    "nom": "Doe",
    "prenom": "John Updated"
  }
  ```

### **DELETE /:id**

- **Description** : Supprime un utilisateur par son ID.
- **Réponse** :
  ```json
  {
    "success": true,
    "userId": "<user_id>"
  }
  ```

### **GET /matricule/:matricule**

- **Description** : Retourne un utilisateur par son matricule.
- **Réponse** :
  ```json
  {
    "id": "<user_id>",
    "name": "John Doe",
    "email": "user@example.com"
  }
  ```

### **GET /:id**

- **Description** : Retourne un utilisateur par son ID.
- **Réponse** :
  ```json
  {
    "id": "<user_id>",
    "name": "John Doe",
    "email": "user@example.com"
  }
  ```

---

## 4. Authentification

Le service utilise des tokens JWT pour gérer les sessions utilisateur. Voici les étapes principales :

1. **Connexion** :
   - L'utilisateur envoie ses identifiants au backend via l'endpoint `/api/auth/login`.
   - Le backend retourne un token JWT signé avec la clé `JWT_SECRET`.

2. **Utilisation du token** :
   - Le frontend inclut le token dans l'en-tête `Authorization` pour chaque requête nécessitant une authentification.

3. **Validation** :
   - Le backend valide le token pour autoriser ou refuser l'accès à une ressource.

4. **Déconnexion** :
   - Le token peut être invalidé via l'endpoint `/api/auth/logout`.

---

## 5. Exemple de flux

Voici un exemple de flux typique entre le frontend et le `auth-user-service` :

1. **Inscription** :
   - Le frontend appelle `/api/auth/register` pour créer un nouvel utilisateur.

2. **Connexion** :
   - L'utilisateur se connecte via `/api/auth/login` et reçoit un token JWT.

3. **Accès aux ressources protégées** :
   - Le frontend inclut le token dans l'en-tête `Authorization` pour accéder aux endpoints protégés.

4. **Déconnexion** :
   - Le frontend appelle `/api/auth/logout` pour invalider le token.

---

## 6. Bonnes pratiques

- **Sécuriser les tokens JWT** :
  - Ne stockez pas les tokens dans le `localStorage` pour éviter les attaques XSS. Utilisez plutôt des cookies sécurisés.

- **Utiliser HTTPS** :
  - Assurez-vous que toutes les communications entre le frontend et le backend sont chiffrées.

- **Gérer les erreurs** :
  - Implémentez une gestion des erreurs robuste côté frontend pour traiter les réponses d'erreur du backend.

- **Limiter les tentatives de connexion** :
  - Ajoutez une protection contre les attaques par force brute en limitant les tentatives de connexion.

- **Renouvellement des tokens** :
  - Implémentez un mécanisme de rafraîchissement des tokens pour éviter les expirations fréquentes.

---

Cette documentation fournit toutes les informations nécessaires pour connecter un frontend au `auth-user-service`. Assurez-vous de suivre les bonnes pratiques pour garantir une intégration sécurisée et efficace.
