const Event = require('../../../src/domain/entities/Event');

describe('Event Entity', () => {
  const validEventData = {
    _id: 'event-123',
    eventType: 'MESSAGE_SENT',
    entityType: 'Message',
    entityId: 'msg-456',
    userId: 'user-1',
  };

  it('should create a valid event with default values', () => {
    console.log("🧪 Test: should create a valid event with default values");
    const event = new Event(validEventData);
    expect(event.eventType).toBe('MESSAGE_SENT');
    expect(event.entityType).toBe('Message');
    expect(event.processed).toBe(false);
    expect(event.metadata.kafkaMetadata.topic).toBe('chat.messages');
    expect(event.validate()).toBe(true);
  });

  it('should fail validation if required fields are missing', () => {
    console.log("🧪 Test: should fail validation if required fields are missing");
    const noEventType = new Event({ ...validEventData, eventType: null });
    expect(() => noEventType.validate()).toThrow('eventType est requis');

    const noEntityType = new Event({ ...validEventData, entityType: null });
    expect(() => noEntityType.validate()).toThrow('entityType est requis');

    const noEntityId = new Event({ ...validEventData, entityId: null });
    expect(() => noEntityId.validate()).toThrow('entityId est requis');
  });

  it('should mark as processed', () => {
    console.log("🧪 Test: should mark as processed");
    const event = new Event(validEventData);
    event.markAsProcessed();
    expect(event.processed).toBe(true);
    expect(event.metadata.processing.processedAt).toBeDefined();
  });

  it('should mark as failed', () => {
    console.log("🧪 Test: should mark as failed");
    const event = new Event(validEventData);
    const error = new Error('Processing failed');
    event.markAsFailed(error);
    
    expect(event.processed).toBe(false);
    expect(event.error.message).toBe('Processing failed');
    expect(event.metadata.processing.attempts).toBe(1);
  });

  it('should create message event via static method', () => {
    console.log("🧪 Test: should create message event via static method");
    const event = Event.createMessageEvent('MESSAGE_DELIVERED', 'msg-1', 'user-2');
    expect(event.eventType).toBe('MESSAGE_DELIVERED');
    expect(event.entityType).toBe('Message');
    expect(event.entityId).toBe('msg-1');
    expect(event.userId).toBe('user-2');
    expect(event.metadata.kafkaMetadata.topic).toBe('chat.messages');
  });

  it('should create file event via static method', () => {
    console.log("🧪 Test: should create file event via static method");
    const event = Event.createFileEvent('FILE_UPLOADED', 'file-1', 'user-2');
    expect(event.eventType).toBe('FILE_UPLOADED');
    expect(event.entityType).toBe('File');
    expect(event.metadata.kafkaMetadata.topic).toBe('chat.files');
  });

  it('should create conversation event via static method', () => {
    console.log("🧪 Test: should create conversation event via static method");
    const event = Event.createConversationEvent('CONVERSATION_CREATED', 'conv-1', 'user-2');
    expect(event.eventType).toBe('CONVERSATION_CREATED');
    expect(event.entityType).toBe('Conversation');
    expect(event.metadata.kafkaMetadata.topic).toBe('chat.conversations');
  });

  it('should return correct default topic for unknown event type', () => {
    console.log("🧪 Test: should return correct default topic for unknown event type");
    const event = new Event({ ...validEventData, eventType: 'UNKNOWN_EVENT' });
    expect(event.getKafkaTopic()).toBe('chat.events');
  });
});
