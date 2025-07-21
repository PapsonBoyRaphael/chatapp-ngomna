ChatApp Server for nGomna - Backend for Flutter Integration
This repository contains the microservices architecture for a chat application, designed to support real-time messaging, file uploads, group chats, and broadcasts. The backend is built with Node.js, Express, Socket.IO, MongoDB, Redis, and Kafka, and is intended to integrate seamlessly with a Flutter front-end.
Overview
The ChatApp server is composed of several microservices, each handling specific functionalities. This README provides detailed instructions to set up the backend and connect it to a Flutter application, including software requirements, Socket.IO configuration, and API routes.
Services

auth-user-service: Handles user authentication (port 8001)
chat-file-service: Manages messages and conversations with MongoDB (port 8003)
visibility-service: Manages message visibility with MongoDB (port 8005)
file-service: Handles file uploads and downloads (port 8006)
gateway: Entry point for all requests (port 8000)

Prerequisites
To set up the backend and connect it to a Flutter front-end, ensure the following software is installed on your system:
Backend Software Requirements

Node.js: Version 18.x or higher. Install from nodejs.org.
npm: Comes with Node.js, used for managing dependencies.
Docker: For running services like MongoDB, Redis, and Kafka. Install from docker.com.
MongoDB: Used by chat, group, visibility, and file services. Can be run locally or via Docker.
Redis: For caching and managing online users/rooms. Can be run locally or via Docker.
Kafka: For real-time notifications. Can be run via Docker using the provided scripts.
MinIO: For file storage (S3-compatible). Can be run via Docker.
Git: For cloning the repository. Install from git-scm.com.

Flutter Software Requirements

Flutter SDK: Version 3.x or higher. Install from flutter.dev.
Dart: Comes with Flutter, used for Flutter development.
IDE: Recommended options include Visual Studio Code or Android Studio with Flutter plugins.
WebSocket Package: Use the web_socket_channel package for Socket.IO in Flutter.
HTTP Package: Use the http package for making API requests in Flutter.

Flutter Dependencies
Add the following dependencies to your Flutter project's pubspec.yaml:
dependencies:
flutter:
sdk: flutter
http: ^1.2.2
web_socket_channel: ^3.0.1
shared_preferences: ^2.3.2 # For storing auth tokens

Install them by running:
flutter pub get

Setup Instructions

1. Clone the Repository
   git clone https://github.com/PapsonBoyRaphael/chatapp-ngomna.git
   cd chatapp-ngomna

2. Install Backend Dependencies
   Navigate to each service directory and install dependencies:
   cd auth-service && npm install
   cd ../auth-user-service && npm install
   cd ../chat-file-service && npm install
   cd ../visibility-service && npm install
   cd ../gateway && npm install

3. Configure Environment Variables
   Each service requires a .env file for configuration. Copy the example .env files provided in each service folder and update them with your settings:

# Example for chat-service .env

NODE_ENV=development
CHAT_FILE_SERVICE_PORT=8003
MONGODB_URI=mongodb://localhost:27017/chatdb
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=chat-files

Ensure the following are configured:

MongoDB URI for database connections.
Redis URL for caching and online user management.
Kafka brokers for real-time notifications.
MinIO (S3) credentials for file storage.

4. Run Infrastructure Services with Docker
   Use Docker Compose to start MongoDB, Redis, Kafka, and MinIO:
   docker-compose up --build

Alternatively, start Kafka separately for development:
./start-kafka-dev.sh

Verify Kafka is running:
npm run kafka:topics

5. Start the Backend Services
   For production, run all services using Docker Compose as above. For development, start each service individually:
   cd <service-name>
   npm run dev

Example for chat-service:
cd chat-service
npm run dev

The services will be available at their respective ports (e.g., chat-service on http://localhost:8003). 6. Verify Backend Health
Check the health of the chat-service:
curl -s http://localhost:8003/health | jq .

This should return a JSON object indicating the status of MongoDB, Redis, Kafka, and WebSocket connections.
Connecting Flutter to the Backend
WebSocket Configuration (Socket.IO)
The chat-service uses Socket.IO for real-time communication. In Flutter, use the web_socket_channel package to connect to the Socket.IO server.
Flutter WebSocket Setup
import 'package:web_socket_channel/io.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SocketService {
IOWebSocketChannel? \_channel;
final String socketUrl = 'ws://localhost:8003'; // Update with your server URL

Future<void> connect(String token) async {
final prefs = await SharedPreferences.getInstance();
await prefs.setString('auth_token', token);

    _channel = IOWebSocketChannel.connect(
      Uri.parse('$socketUrl?token=$token'),
      headers: {'Authorization': 'Bearer $token'},
    );

    _channel!.stream.listen(
      (event) {
        print('Received: $event');
        // Handle WebSocket events here
      },
      onError: (error) => print('Error: $error'),
      onDone: () => print('WebSocket closed'),
    );

}

void authenticate(String userId, String matricule) {
\_channel?.sink.add({
'event': 'authenticate',
'data': {
'userId': userId,
'matricule': matricule,
'token': null, // Use token if available
},
});
}

void sendMessage(String conversationId, String content) {
\_channel?.sink.add({
'event': 'sendMessage',
'data': {
'conversationId': conversationId,
'content': content,
'type': 'TEXT',
},
});
}

void dispose() {
\_channel?.sink.close();
}
}

Key WebSocket Events
The following Socket.IO events are supported by the chat-service (chatHandler.js):

Event Name
Description
Data Example

authenticate
Authenticate a user
{"userId": "123", "matricule": "USER123", "token": "jwt_token"}

sendMessage
Send a message to a conversation
{"conversationId": "conv123", "content": "Hello!", "type": "TEXT"}

joinConversation
Join a conversation room
{"conversationId": "conv123"}

leaveConversation
Leave a conversation room
{"conversationId": "conv123"}

typing
Indicate typing in a conversation
{"conversationId": "conv123"}

stopTyping
Indicate stopped typing
{"conversationId": "conv123"}

getOnlineUsers
Get list of online users
No data required

markMessageDelivered
Mark a message as delivered
{"messageId": "msg123", "conversationId": "conv123"}

markMessageRead
Mark a message as read
{"messageId": "msg123", "conversationId": "conv123"}

markConversationRead
Mark all messages in a conversation as read
{"conversationId": "conv123"}

getMessageStatus
Get the status of a message
{"messageId": "msg123"}

messageReceived
Acknowledge message receipt
{"messageId": "msg123", "conversationId": "conv123"}

deleteMessage
Soft delete a message
{"messageId": "msg123"}

deleteFile
Soft delete a file
{"fileId": "file123"}

editMessage
Edit a message's content
{"messageId": "msg123", "newContent": "Updated message"}

Event Responses

Success: Events like authenticated, message_sent, messageDelivered, messageRead, conversationMarkedRead, messageEdited return success data with timestamps and relevant IDs.
Errors: Events like auth_error, message_error, status_error, conversation_error return error codes and messages (e.g., MISSING_DATA, INVALID_TOKEN).

API Routes
The backend exposes RESTful API endpoints for managing conversations, messages, files, groups, broadcasts, and health checks. Below are the key routes for Flutter integration.
Authentication
Authenticate users via the auth-service (http://localhost:8001). Example:
import 'package:http/http.dart' as http;

Future<String?> login(String username, String password) async {
final response = await http.post(
Uri.parse('http://localhost:8001/login'),
body: {
'username': username,
'password': password,
},
);
if (response.statusCode == 200) {
return response.body; // Assuming it returns a JWT token
}
return null;
}

Conversations (/conversations)

GET /conversations: List all conversations for the authenticated user.Future<void> getConversations(String token) async {
final response = await http.get(
Uri.parse('http://localhost:8003/conversations'),
headers: {'Authorization': 'Bearer $token'},
);
print(response.body);
}

GET /conversations/:conversationId: Get details of a specific conversation.
POST /conversations: Create a new conversation.Future<void> createConversation(String token, String receiverId) async {
final response = await http.post(
Uri.parse('http://localhost:8003/conversations'),
headers: {'Authorization': 'Bearer $token'},
body: {
'receiverId': receiverId,
'type': 'PRIVATE',
},
);
print(response.body);
}

PUT /conversations/:conversationId/read: Mark a conversation as read.

Messages (/messages)

POST /messages: Send a message (complementary to WebSocket sendMessage).Future<void> sendMessage(String token, String conversationId, String content) async {
final response = await http.post(
Uri.parse('http://localhost:8003/messages'),
headers: {'Authorization': 'Bearer $token'},
body: {
'conversationId': conversationId,
'content': content,
'type': 'TEXT',
},
);
print(response.body);
}

GET /messages: Retrieve messages for a conversation.
GET /messages/:messageId: Get a specific message.
PUT /messages/:messageId/status: Update message status (e.g., DELIVERED, READ).
DELETE /messages/:messageId: Soft delete a message.
POST /messages/:messageId/reactions: Add a reaction to a message.

Files (/files)

POST /files/upload: Upload a file.import 'package:http/http.dart' as http;

Future<void> uploadFile(String token, String path) async {
var request = http.MultipartRequest(
'POST',
Uri.parse('http://localhost:8003/files/upload'),
);
request.headers['Authorization'] = 'Bearer $token';
request.files.add(await http.MultipartFile.fromPath('file', path));
final response = await request.send();
print(await response.stream.bytesToString());
}

GET /files/:fileId: Download a file.
GET /files/:fileId/download: Download a file with proper headers.
DELETE /files/:fileId: Soft delete a file.
GET /files/conversation/:conversationId: List files in a conversation.
GET /files/:fileId/thumbnail/:size: Get a thumbnail of an image file.

Groups (/groups)

POST /groups: Create a group chat.Future<void> createGroup(String token, String name, List<String> members) async {
final response = await http.post(
Uri.parse('http://localhost:8003/groups'),
headers: {'Authorization': 'Bearer $token'},
body: {
'name': name,
'members': jsonEncode(members),
},
);
print(response.body);
}

Broadcasts (/broadcasts)

POST /broadcasts: Create a broadcast list.Future<void> createBroadcast(String token, String name, List<String> recipients) async {
final response = await http.post(
Uri.parse('http://localhost:8003/broadcasts'),
headers: {'Authorization': 'Bearer $token'},
body: {
'name': name,
'recipientIds': jsonEncode(recipients),
},
);
print(response.body);
}

Health Check (/health)

GET /health: Check the health of the chat-service.
GET /health/mongodb: Check MongoDB status.
GET /health/redis: Check Redis status.
GET /health/kafka: Check Kafka status.
GET /health/detailed: Detailed health metrics.

Flutter Integration Example
Below is a complete example of a Flutter service class that integrates with the backend for authentication, WebSocket communication, and message handling.
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/io.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ChatService {
final String baseUrl = 'http://localhost:8003';
final String socketUrl = 'ws://localhost:8003';
IOWebSocketChannel? \_channel;
String? \_token;

Future<bool> login(String username, String password) async {
final response = await http.post(
Uri.parse('http://localhost:8001/login'),
body: {'username': username, 'password': password},
);
if (response.statusCode == 200) {
\_token = jsonDecode(response.body)['token'];
final prefs = await SharedPreferences.getInstance();
await prefs.setString('auth_token', \_token!);
return true;
}
return false;
}

Future<void> connectWebSocket() async {
if (\_token == null) throw Exception('Not authenticated');
\_channel = IOWebSocketChannel.connect(
Uri.parse('$socketUrl?token=$\_token'),
headers: {'Authorization': 'Bearer $\_token'},
);

    _channel!.stream.listen(
      (event) {
        final data = jsonDecode(event);
        switch (data['event']) {
          case 'authenticated':
            print('Authenticated: ${data['data']}');
            break;
          case 'newMessage':
            print('New Message: ${data['data']['content']}');
            break;
          case 'messageDelivered':
            print('Message Delivered: ${data['data']['messageId']}');
            break;
          case 'messageRead':
            print('Message Read: ${data['data']['messageId']}');
            break;
        }
      },
      onError: (error) => print('WebSocket Error: $error'),
      onDone: () => print('WebSocket Closed'),
    );

    // Authenticate WebSocket
    _channel!.sink.add(jsonEncode({
      'event': 'authenticate',
      'data': {'token': _token},
    }));

}

Future<void> sendMessage(String conversationId, String content) async {
if (\_channel == null) throw Exception('WebSocket not connected');
\_channel!.sink.add(jsonEncode({
'event': 'sendMessage',
'data': {
'conversationId': conversationId,
'content': content,
'type': 'TEXT',
},
}));
}

Future<List<dynamic>> getConversations() async {
if (\_token == null) throw Exception('Not authenticated');
final response = await http.get(
Uri.parse('$baseUrl/conversations'),
headers: {'Authorization': 'Bearer $\_token'},
);
return jsonDecode(response.body)['data'];
}

void dispose() {
\_channel?.sink.close();
}
}

Development Mode
To run the backend in development mode:
cd <service-name>
npm run dev

To start Kafka and other dependencies:
npm run dev:setup

To monitor logs:
npm run dev:logs

Troubleshooting

WebSocket Connection Fails: Ensure the Flutter app uses the correct WebSocket URL (ws://localhost:8003) and includes the JWT token in the query or headers.
API Authentication Errors: Verify the JWT token is valid and included in the Authorization header as Bearer <token>.
Docker Issues: Check that Docker is running and all services (MongoDB, Redis, Kafka, MinIO) are up using docker ps.
Kafka Not Working: Run npm run kafka:topics to verify topics, or reset Kafka with npm run kafka:reset.

Additional Notes

CORS: The backend is configured to allow CORS from http://localhost:3000, http://localhost:8000, etc. Update the CORS configuration in index.js if your Flutter app runs on a different origin.
File Uploads: Ensure MinIO is running for file storage. The file-service uses memory storage for uploads via Multer, so large files may require additional configuration.
Real-Time Notifications: Kafka is used for notifications. Ensure the Kafka consumer is running (NotificationConsumer) for real-time updates.

For further details on pricing or subscription plans, visit:

SuperGrok: https://x.ai/grok
X Premium: https://help.x.com/en/using-x/x-premium
API Service: https://x.ai/api
