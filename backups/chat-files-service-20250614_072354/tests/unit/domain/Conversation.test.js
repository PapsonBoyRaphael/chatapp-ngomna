const Conversation = require('../../../src/domain/entities/Conversation');

describe('Conversation Entity', () => {
  test('should create a private conversation', () => {
    const conversationData = {
      participants: ['user-1', 'user-2'],
      createdBy: 'user-1',
      type: 'PRIVATE'
    };
    
    const conversation = Conversation.create(conversationData);
    
    expect(conversation.id).toBeDefined();
    expect(conversation.participants).toHaveLength(2);
    expect(conversation.type).toBe('PRIVATE');
    expect(conversation.createdBy).toBe('user-1');
  });

  test('should add and remove participants', () => {
    const conversation = Conversation.create({
      participants: ['user-1', 'user-2'],
      createdBy: 'user-1',
      type: 'GROUP'
    });
    
    conversation.addParticipant('user-3');
    expect(conversation.participants).toHaveLength(3);
    expect(conversation.hasParticipant('user-3')).toBe(true);
    
    conversation.removeParticipant('user-2');
    expect(conversation.participants).toHaveLength(2);
    expect(conversation.hasParticipant('user-2')).toBe(false);
  });
});
