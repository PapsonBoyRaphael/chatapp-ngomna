const Conversation = require('../../../src/domain/entities/Conversation');

describe('Conversation Entity', () => {
  const validPrivateData = {
    _id: 'conv-123',
    participants: ['user-1', 'user-2'],
    type: 'PRIVATE',
  };

  const validGroupData = {
    _id: 'conv-456',
    participants: ['user-1', 'user-2', 'user-3'],
    type: 'GROUP',
    name: 'Dev Team',
  };

  it('should create a valid private conversation', () => {
    console.log("🧪 Test: should create a valid private conversation");
    const conv = new Conversation(validPrivateData);
    expect(conv.type).toBe('PRIVATE');
    expect(conv.participants.length).toBe(2);
    expect(conv.settings.notifications.enabled).toBe(true);
    expect(conv.metadata.kafkaMetadata).toBeDefined();
    expect(conv.validate()).toBe(true);
  });

  it('should create a valid group conversation via static method', () => {
    console.log("🧪 Test: should create a valid group conversation via static method");
    const conv = Conversation.createGroup('Design Team', 'user-admin', ['user-1', 'user-2']);
    expect(conv.type).toBe('GROUP');
    expect(conv.name).toBe('Design Team');
    expect(conv.participants).toContain('user-admin');
    expect(conv.participants.length).toBe(3);
    expect(conv.validate()).toBe(true);
  });

  it('should create a private conversation via static method', () => {
    console.log("🧪 Test: should create a private conversation via static method");
    const conv = Conversation.createPrivateConversation('user-A', 'user-B');
    expect(conv.type).toBe('PRIVATE');
    expect(conv.participants).toEqual(['user-A', 'user-B']);
    expect(conv.unreadCounts['user-A']).toBe(0);
    expect(conv.validate()).toBe(true);
  });

  it('should fail validation if private conversation has less than 2 participants', () => {
    console.log("🧪 Test: should fail validation if private conversation has less than 2 participants");
    const data = { ...validPrivateData, participants: ['user-1'] };
    const conv = new Conversation(data);
    expect(() => conv.validate()).toThrow('Une conversation privée doit avoir exactement 2 participants');
  });

  it('should fail validation if group has no name', () => {
    console.log("🧪 Test: should fail validation if group has no name");
    const data = { ...validGroupData, name: '' };
    const conv = new Conversation(data);
    expect(() => conv.validate()).toThrow('Un groupe doit avoir un nom');
  });

  it('should add a participant', () => {
    console.log("🧪 Test: should add a participant");
    const conv = new Conversation(validGroupData);
    conv.addParticipant('user-4');
    expect(conv.participants).toContain('user-4');
    expect(conv.unreadCounts['user-4']).toBe(0);
  });

  it('should remove a participant', () => {
    console.log("🧪 Test: should remove a participant");
    const conv = new Conversation(validGroupData);
    conv.archive('user-1');
    conv.mute('user-1');
    conv.pin('user-1');

    conv.removeParticipant('user-1');
    expect(conv.participants).not.toContain('user-1');
    expect(conv.archivedBy).not.toContain('user-1');
    expect(conv.mutedBy).not.toContain('user-1');
    expect(conv.pinnedBy).not.toContain('user-1');
  });

  it('should update last message and increment unread counts', () => {
    console.log("🧪 Test: should update last message and increment unread counts");
    const conv = Conversation.createGroup('Team', 'user-1', ['user-2', 'user-3']);
    conv.updateLastMessage('msg-1', 'Hello guys', 'TEXT', 'user-1');

    expect(conv.lastMessage.content).toBe('Hello guys');
    expect(conv.unreadCounts['user-1']).toBe(0);
    expect(conv.unreadCounts['user-2']).toBe(1);
    expect(conv.unreadCounts['user-3']).toBe(1);
    expect(conv.metadata.statistics.totalMessages).toBe(1);
  });

  it('should mark as read for a user', () => {
    console.log("🧪 Test: should mark as read for a user");
    const conv = Conversation.createPrivateConversation('user-1', 'user-2');
    conv.unreadCounts['user-2'] = 5;
    conv.markAsRead('user-2');
    expect(conv.unreadCounts['user-2']).toBe(0);
  });

  it('should get total unread count', () => {
    console.log("🧪 Test: should get total unread count");
    const conv = Conversation.createGroup('Team', 'user-1', ['user-2', 'user-3']);
    conv.unreadCounts['user-1'] = 2;
    conv.unreadCounts['user-2'] = 3;
    expect(conv.getTotalUnreadCount()).toBe(5);
  });

  it('should correctly handle archive, mute, pin', () => {
    console.log("🧪 Test: should correctly handle archive, mute, pin");
    const conv = new Conversation(validPrivateData);
    conv.archive('user-1');
    conv.mute('user-1');
    conv.pin('user-1');
    
    const meta = conv.getMetadataForUser('user-1');
    expect(meta.isArchived).toBe(true);
    expect(meta.isMuted).toBe(true);
    expect(meta.isPinned).toBe(true);
    expect(meta.isParticipant).toBe(true);

    conv.unarchive('user-1');
    conv.unmute('user-1');
    conv.unpin('user-1');

    const metaUpdated = conv.getMetadataForUser('user-1');
    expect(metaUpdated.isArchived).toBe(false);
    expect(metaUpdated.isMuted).toBe(false);
    expect(metaUpdated.isPinned).toBe(false);
  });

  it('should throw an error for deleteMessage when repositories are missing', async () => {
    console.log("🧪 Test: should throw an error for deleteMessage when repositories are missing");
    const conv = new Conversation(validPrivateData);
    await expect(conv.deleteMessage('msg-1', 'user-1')).rejects.toThrow();
  });
});
