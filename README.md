# ChatApp Server for nGomna - Backend for Flutter Integration

This repository contains the microservices architecture for a chat application, designed to support real-time messaging, file uploads, group chats, and broadcasts. The backend is built with Node.js, Express, Socket.IO, MongoDB, Redis, and Kafka, and is intended to integrate seamlessly with a Flutter frontend.

## Overview

The ChatApp server consists of several microservices, each handling specific functionalities. This README provides detailed instructions to set up the backend and connect it to a Flutter application, including software prerequisites, Socket.IO configuration, and API routes.

### Services

- **auth-user-service**: Handles user authentication and data (port 8001, see the specific README for more details)
- **chat-file-service**: Manages messages, conversations, group chats, and files with MongoDB (port 8003)
- **gateway**: Entry point for all requests (port 8000)

## Prerequisites

To set up the backend and connect it to a Flutter application, ensure the following software is installed on your system:

### Backend Software Requirements

- **Node.js**: Version 18.x or higher. Download from [nodejs.org](https://nodejs.org/).
- **npm**: Comes with Node.js, used for managing dependencies.
- **Docker**: For running services like MongoDB, Redis, and Kafka. Download from [docker.com](https://www.docker.com/).
- **MongoDB**: Used by the chat-file-service. Can be run locally or via Docker.
- **Redis**: For caching and managing online users/rooms. Can be run locally or via Docker.
- **Kafka**: For real-time notifications. Can be run via Docker with the provided scripts.
- **MinIO**: Temporary file storage solution (S3-compatible) for the development phase. Can be run via Docker.
- **Git**: For cloning the repository. Download from [git-scm.com](https://git-scm.com/).

### Flutter Software Requirements

- **Flutter SDK**: Version 3.x or higher. Download from [flutter.dev](https://flutter.dev/docs/get-started/install).
- **Dart**: Comes with Flutter, used for Flutter development.
- **IDE**: Recommended options include Visual Studio Code or Android Studio with Flutter plugins.
- **WebSocket Package**: Use the `web_socket_channel` package for Socket.IO in Flutter.
- **HTTP Package**: Use the `http` package for making API requests in Flutter.

### Flutter Dependencies

Add the following dependencies to your Flutter project's `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.2
  web_socket_channel: ^3.0.1
  shared_preferences: ^2.3.2 # For storing auth tokens
```

Install them by running:

```bash
flutter pub get
```

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/PapsonBoyRaphael/chatapp-ngomna.git
cd chatapp-ngomna
```

### 2. Install Backend Dependencies

Navigate to each service directory and install dependencies:

```bash
cd auth-user-service && npm install
cd ../chat-file-service && npm install
cd ../gateway && npm install
```

### 3. Configure Environment Variables

Each service requires a `.env` file for configuration. Copy the example `.env` files provided in each service folder and update them with your settings:

```bash
# Example for chat-file-service .env
NODE_ENV=development
CHAT_FILE_SERVICE_PORT=8003
MONGODB_URI=mongodb://localhost:27017/chatdb
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=chat-files
```

Ensure the following are configured:

- MongoDB URI for database connections.
- Redis URL for caching and online user management.
- Kafka brokers for real-time notifications.
- MinIO (S3) credentials for file storage.

### 4. Run Infrastructure Services with Docker

Use Docker Compose to start MongoDB, Redis, Kafka, and MinIO:

```bash
docker-compose up --build
```

Alternatively, start Kafka separately for development:

```bash
./start-kafka-dev.sh
```

Verify Kafka is running:

```bash
npm run kafka:topics
```

### 5. Start the Backend Services

For production, run all services using Docker Compose as above. For development, start each service individually:

```bash
cd <service-name>
npm run dev
```

Example for chat-file-service:

```bash
cd chat-file-service
npm run dev
```

The services will be available at their respective ports (e.g., chat-file-service on `http://localhost:8003`).

### 6. Verify Backend Health

Check the health of the chat-file-service:

```bash
curl -s http://localhost:8003/health | jq .
```

This should return a JSON object indicating the status of MongoDB, Redis, Kafka, and WebSocket connections.

## Connecting Flutter to the Backend

### WebSocket Configuration (Socket.IO)

The chat-file-service uses Socket.IO for real-time communication. In Flutter, use the `web_socket_channel` package to connect to the Socket.IO server.

#### WebSocket Configuration

The chat-file-service supports the following Socket.IO events (see `chatHandler.js`):

| Event Name             | Description                                 | Data Example                                                         |
| ---------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| `authenticate`         | Authenticate a user                         | `{"userId": "123", "matricule": "USER123", "token": "jwt_token"}`    |
| `sendMessage`          | Send a message to a conversation or group   | `{"conversationId": "conv123", "content": "Hello!", "type": "TEXT"}` |
| `joinConversation`     | Join a conversation room                    | `{"conversationId": "conv123"}`                                      |
| `leaveConversation`    | Leave a conversation room                   | `{"conversationId": "conv123"}`                                      |
| `typing`               | Indicate typing in a conversation           | `{"conversationId": "conv123"}`                                      |
| `stopTyping`           | Indicate stopped typing                     | `{"conversationId": "conv123"}`                                      |
| `getOnlineUsers`       | Get list of online users                    | No data required                                                     |
| `markMessageDelivered` | Mark a message as delivered                 | `{"messageId": "msg123", "conversationId": "conv123"}`               |
| `markMessageRead`      | Mark a message as read                      | `{"messageId": "msg123", "conversationId": "conv123"}`               |
| `markConversationRead` | Mark all messages in a conversation as read | `{"conversationId": "conv123"}`                                      |
| `getMessageStatus`     | Get the status of a message                 | `{"messageId": "msg123"}`                                            |
| `messageReceived`      | Acknowledge message receipt                 | `{"messageId": "msg123", "conversationId": "conv123"}`               |
| `deleteMessage`        | Soft delete a message                       | `{"messageId": "msg123"}`                                            |
| `deleteFile`           | Soft delete a file                          | `{"fileId": "file123"}`                                              |
| `editMessage`          | Edit a message's content                    | `{"messageId": "msg123", "newContent": "Updated message"}`           |
| `joinGroup`            | Join a group chat                           | `{"groupId": "group123"}`                                            |
| `leaveGroup`           | Leave a group chat                          | `{"groupId": "group123"}`                                            |
| `getGroupMembers`      | Get the list of members in a group          | `{"groupId": "group123"}`                                            |

#### Event Responses

- **Success**: Events like `authenticated`, `message_sent`, `messageDelivered`, `messageRead`, `conversationMarkedRead`, `messageEdited`, `joinedGroup` return success data with timestamps and relevant IDs.
- **Errors**: Events like `auth_error`, `message_error`, `status_error`, `group_error` return error codes and messages (e.g., `MISSING_DATA`, `INVALID_TOKEN`).

### API Routes

The backend exposes RESTful API endpoints for managing conversations, messages, groups, files, broadcasts, and health checks. Below are the key routes for Flutter integration.

#### Authentication

Authenticate users via the auth-user-service (`http://localhost:8001`).

#### Conversations and Groups (`/conversations`)

- **GET /conversations**: List all conversations and groups for the authenticated user.
- **GET /conversations/:conversationId**: Get details of a specific conversation or group.
- **POST /conversations**: Create a new conversation.
- **POST /conversations/group**: Create a new group chat.
- **PUT /conversations/:conversationId/read**: Mark a conversation or group as read.

#### Messages (`/messages`)

- **POST /messages**: Send a message (complementary to WebSocket `sendMessage`).
- **GET /messages**: Retrieve messages for a conversation or group.
- **GET /messages/:messageId**: Get a specific message.
- **PUT /messages/:messageId/status**: Update message status (e.g., DELIVERED, READ).
- **DELETE /messages/:messageId**: Soft delete a message.
- **POST /messages/:messageId/reactions**: Add a reaction to a message.

#### Files (`/files`)

- **POST /files/upload**: Upload a file.
- **GET /files/:fileId**: Download a file.
- **GET /files/:fileId/download**: Download a file with proper headers.
- **DELETE /files/:fileId**: Soft delete a file.
- **GET /files/conversation/:conversationId**: List files in a conversation or group.
- **GET /files/:fileId/thumbnail/:size**: Get a thumbnail of an image file.

#### Broadcasts (`/broadcasts`)

- **POST /broadcasts**: Create a broadcast list.

#### Health Check (`/health`)

- **GET /health**: Check the health of the chat-file-service.
- **GET /health/mongodb**: Check MongoDB status.
- **GET /health/redis**: Check Redis status.
- **GET /health/kafka**: Check Kafka status.
- **GET /health/detailed**: Detailed health metrics.

## Development Mode

To run the backend in development mode:

```bash
cd <service-name>
npm run dev
```

To start Kafka and other dependencies:

```bash
npm run dev:setup
```

To monitor logs:

```bash
npm run dev:logs
```

## Troubleshooting

- **WebSocket Connection Fails**: Ensure the Flutter app uses the correct WebSocket URL (`ws://localhost:8003`) and includes the JWT token in the query or headers.
- **API Authentication Errors**: Verify the JWT token is valid and included in the `Authorization` header as `Bearer <token>`.
- **Docker Issues**: Check that Docker is running and all services (MongoDB, Redis, Kafka, MinIO) are up using `docker ps`.
- **Kafka Not Working**: Run `npm run kafka:topics` to verify topics, or reset Kafka with `npm run kafka:reset`.

## Additional Notes

- **CORS**: The backend is configured to allow CORS from `http://localhost:3000`, `http://localhost:8000`, etc. Update the CORS configuration in `index.js` if your Flutter app runs on a different origin.
- **File Uploads**: The chat-file-service now handles files, using MinIO for storage. Large files may require additional optimization.
- **Real-Time Notifications**: Kafka is used for notifications. Ensure the Kafka consumer (`NotificationConsumer`) is running for real-time updates.
- **MinIO Temporary**: MinIO is used as a temporary storage solution during the development phase and can be replaced with a more robust solution in production.

For further details on pricing or subscription plans, visit:

- SuperGrok: [https://x.ai/grok](https://x.ai/grok)
- X Premium: [https://help.x.com/en/using-x/x-premium](https://help.x.com/en/using-x/x-premium)
- API Service: [https://x.ai/api](https://x.ai/api)
