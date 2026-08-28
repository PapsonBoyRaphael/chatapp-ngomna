const Message = require('../../../src/domain/entities/Message');

describe('Message Entity', () => {
  const validMessageData = {
    _id: 'msg-123',
    conversationId: 'conv-456',
    senderId: 'user-789',
    receiverId: 'user-101',
    content: 'Hello world',
    type: 'TEXT',
  };

  it('should create a valid message with default values', () => {
    console.log("🧪 Test: should create a valid message with default values");
    const message = new Message(validMessageData);

    expect(message._id).toBe('msg-123');
    expect(message.conversationId).toBe('conv-456');
    expect(message.senderId).toBe('user-789');
    expect(message.content).toBe('Hello world');
    expect(message.type).toBe('TEXT');
    expect(message.status).toBe('SENT');
    expect(message.reactions).toEqual([]);
    expect(message.createdAt).toBeInstanceOf(Date);
    expect(message.metadata).toBeDefined();
    expect(message.metadata.kafkaMetadata).toBeDefined();
    expect(message.metadata.redisMetadata).toBeDefined();
  });

  it('should validate successfully for a correct message', () => {
    console.log("🧪 Test: should validate successfully for a correct message");
    const message = new Message(validMessageData);
    expect(() => message.validate()).not.toThrow();
    expect(message.validate()).toBe(true);
  });

  it('should throw an error if conversationId is missing', () => {
    console.log("🧪 Test: should throw an error if conversationId is missing");
    const data = { ...validMessageData, conversationId: null };
    const message = new Message(data);
    expect(() => message.validate()).toThrow('conversationId est requis');
  });

  it('should throw an error if senderId is missing', () => {
    console.log("🧪 Test: should throw an error if senderId is missing");
    const data = { ...validMessageData, senderId: null };
    const message = new Message(data);
    expect(() => message.validate()).toThrow('senderId est requis');
  });

  it('should throw an error if content is missing or empty', () => {
    console.log("🧪 Test: should throw an error if content is missing or empty");
    const data = { ...validMessageData, content: '   ' };
    const message = new Message(data);
    expect(() => message.validate()).toThrow('content ne peut pas être vide');
  });

  it('should throw an error for an invalid type', () => {
    console.log("🧪 Test: should throw an error for an invalid type");
    const data = { ...validMessageData, type: 'INVALID_TYPE' };
    const message = new Message(data);
    expect(() => message.validate()).toThrow('type doit être un de: TEXT, IMAGE, VIDEO, AUDIO, FILE, LOCATION, CONTACT');
  });

  it('should mark message as read', () => {
    console.log("🧪 Test: should mark message as read");
    const message = new Message(validMessageData);
    message.markAsRead();
    expect(message.status).toBe('READ');
    expect(message.metadata.deliveryMetadata.readAt).toBeDefined();
    expect(message.readAt).toBeInstanceOf(Date);
  });

  it('should mark message as delivered', () => {
    console.log("🧪 Test: should mark message as delivered");
    const message = new Message(validMessageData);
    message.markAsDelivered();
    expect(message.status).toBe('DELIVERED');
    expect(message.metadata.deliveryMetadata.deliveredAt).toBeDefined();
    expect(message.receivedAt).toBeInstanceOf(Date);
  });

  it('should edit the message content', () => {
    console.log("🧪 Test: should edit the message content");
    const message = new Message(validMessageData);
    message.edit('New content');
    expect(message.content).toBe('New content');
    expect(message.editedAt).toBeInstanceOf(Date);
  });

  it('should add and remove a reaction', () => {
    console.log("🧪 Test: should add and remove a reaction");
    const message = new Message(validMessageData);
    message.addReaction('user-1', '👍');
    
    expect(message.reactions.length).toBe(1);
    expect(message.reactions[0].userId).toBe('user-1');
    expect(message.reactions[0].emoji).toBe('👍');

    // Should overwrite if same user
    message.addReaction('user-1', '❤️');
    expect(message.reactions.length).toBe(1);
    expect(message.reactions[0].emoji).toBe('❤️');

    message.removeReaction('user-1');
    expect(message.reactions.length).toBe(0);
  });

  it('should serialize for Kafka', () => {
    console.log("🧪 Test: should serialize for Kafka");
    const message = new Message(validMessageData);
    const payload = message.toKafkaPayload();
    expect(payload.messageId).toBe('msg-123');
    expect(payload.content).toBe('Hello world');
    expect(payload.metadata.kafkaMetadata.serializedAt).toBeDefined();
  });

  it('should serialize for Redis', () => {
    console.log("🧪 Test: should serialize for Redis");
    const message = new Message(validMessageData);
    const payload = message.toRedisPayload();
    expect(payload._id).toBe('msg-123');
    expect(payload.content).toBe('Hello world');
    expect(payload.metadata.redisMetadata.cachedAt).toBeDefined();
  });
});
