// Export centralisé de toute l'infrastructure
const connectDB = require("./mongodb/connection");
const redisConfig = require("./redis/redisConfig");

// Gestionnaires Redis
const OnlineUserManager = require("./redis/OnlineUserManager");
const RoomManager = require("./redis/RoomManager");

// Kafka
const kafkaConfig = require("./kafka/config/kafkaConfig");
const MessageProducer = require("./kafka/producers/MessageProducer");
const FileProducer = require("./kafka/producers/FileProducer");
const NotificationConsumer = require("./kafka/consumers/NotificationConsumer");

// Repositories
const MongoMessageRepository = require("./repositories/MongoMessageRepository");
const MongoConversationRepository = require("./repositories/MongoConversationRepository");
const MongoFileRepository = require("./repositories/MongoFileRepository");

// Modèles (optionnel, généralement importés directement)
const MessageModel = require("./mongodb/models/MessageModel");
const ConversationModel = require("./mongodb/models/ConversationModel");
const FileModel = require("./mongodb/models/FileModel");
const UserPresenceManager = require("./redis/UserPresenceManager");

module.exports = {
  // Connexions
  connectDB,
  redisConfig,
  kafkaConfig,

  // Gestionnaires
  UserPresenceManager,

  // Kafka
  MessageProducer,
  FileProducer,
  NotificationConsumer,

  // Repositories
  MongoMessageRepository,
  MongoConversationRepository,
  MongoFileRepository,

  // Modèles
  MessageModel,
  ConversationModel,
  FileModel,
};
