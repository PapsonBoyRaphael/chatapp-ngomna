const Message = require('../../../src/domain/entities/Message');

describe('Message Entity', () => {
  test('should create a message with default values', () => {
    const messageData = {
      conversationId: 'conv-123',
      senderId: 'user-123',
      content: 'Hello World!'
    };
    
    const message = Message.create(messageData);
    
    expect(message.id).toBeDefined();
    expect(message.conversationId).toBe('conv-123');
    expect(message.senderId).toBe('user-123');
    expect(message.content).toBe('Hello World!');
    expect(message.type).toBe('TEXT');
    expect(message.status).toBe('SENT');
  });

  test('should edit message content', () => {
    const message = Message.create({
      conversationId: 'conv-123',
      senderId: 'user-123',
      content: 'Original content'
    });
    
    message.edit('Edited content');
    
    expect(message.content).toBe('Edited content');
    expect(message.editedAt).toBeDefined();
  });

  test('should validate message data', () => {
    const invalidMessage = new Message({});
    const errors = invalidMessage.validate();
    
    expect(errors).toContain('conversationId is required');
    expect(errors).toContain('senderId is required');
    expect(errors).toContain('content or fileId is required');
  });
});
