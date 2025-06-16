class Event {
  constructor({
    _id,
    type,
    entityType,
    entityId,
    userId,
    data = {},
    metadata = {},
    timestamp,
    processed = false,
    retryCount = 0,
    maxRetries = 3,
  }) {
    this._id = _id;
    this.type = type; // MESSAGE_SENT, FILE_UPLOADED, USER_JOINED, etc.
    this.entityType = entityType; // message, file, conversation, user
    this.entityId = entityId;
    this.userId = userId;
    this.data = data;
    this.metadata = this.enrichMetadata(metadata);
    this.timestamp = timestamp || new Date();
    this.processed = processed;
    this.retryCount = retryCount;
    this.maxRetries = maxRetries;
  }

  enrichMetadata(metadata) {
    return {
      kafkaMetadata: {
        topic: this.getKafkaTopic(),
        partition: null,
        offset: null,
        headers: {},
        publishedAt: null,
      },
      serverId: process.env.SERVER_ID || "default",
      version: "1.0.0",
      correlationId: metadata.correlationId || this.generateCorrelationId(),
      ...metadata,
    };
  }

  getKafkaTopic() {
    const topicMap = {
      MESSAGE_SENT: "chat.messages",
      MESSAGE_DELIVERED: "chat.messages",
      MESSAGE_READ: "chat.messages",
      FILE_UPLOADED: "chat.files",
      FILE_DOWNLOADED: "chat.files",
      USER_JOINED: "chat.events",
      USER_LEFT: "chat.events",
      CONVERSATION_CREATED: "chat.events",
    };

    return topicMap[this.type] || "chat.events";
  }

  generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  validate() {
    if (!this.type) throw new Error("Event type is required");
    if (!this.entityType) throw new Error("Entity type is required");
    if (!this.entityId) throw new Error("Entity ID is required");
    return true;
  }

  toKafkaPayload() {
    return {
      eventId: this._id,
      type: this.type,
      entityType: this.entityType,
      entityId: this.entityId,
      userId: this.userId,
      data: this.data,
      timestamp: this.timestamp,
      metadata: this.metadata,
    };
  }

  static fromObject(obj) {
    return new Event(obj);
  }
}

module.exports = Event;
