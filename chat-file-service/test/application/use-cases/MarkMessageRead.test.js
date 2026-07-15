const MarkMessageRead = require('../../../src/application/use-cases/MarkMessageRead');

describe('MarkMessageRead Use Case', () => {
  let messageRepository;
  let conversationRepository;
  let resilientMessageService;
  let markMessageRead;

  beforeEach(() => {
    messageRepository = {
      updateSingleMessageStatus: jest.fn().mockResolvedValue({
        modifiedCount: 1,
        message: { _id: 'msg-1', senderId: 'user-2', status: 'READ', conversationId: 'conv-1' },
      }),
      updateMessageStatus: jest.fn().mockResolvedValue({
        modifiedCount: 2,
      }),
      findById: jest.fn().mockResolvedValue({ _id: 'msg-1', senderId: 'user-2', status: 'READ', readAt: new Date() }),
    };

    conversationRepository = {
      findById: jest.fn().mockResolvedValue({ _id: 'conv-1', lastMessage: { _id: 'msg-1' } }),
      updateLastMessageStatus: jest.fn().mockResolvedValue(true),
      decrementUnreadCountInUserMetadata: jest.fn().mockResolvedValue(true),
    };

    resilientMessageService = {
      publishMessageStatus: jest.fn().mockResolvedValue(true),
    };

    markMessageRead = new MarkMessageRead(
      messageRepository,
      conversationRepository,
      null,
      resilientMessageService
    );
  });

  it('should throw if userId is missing', async () => {
    console.log("🧪 Test: should throw if userId is missing");
    await expect(markMessageRead.execute({ messageId: 'msg-1' }))
      .rejects.toThrow('userId (reader) requis');
  });

  it('should throw if neither messageId nor conversationId+messageIds are provided', async () => {
    console.log("🧪 Test: should throw if neither messageId nor conversationId+messageIds are provided");
    await expect(markMessageRead.execute({ userId: 'user-1' }))
      .rejects.toThrow('Doit avoir soit messageId');
  });

  it('should mark a single message as READ and publish event', async () => {
    console.log("🧪 Test: should mark a single message as READ and publish event");
    const result = await markMessageRead.execute({ messageId: 'msg-1', userId: 'user-1' });

    expect(messageRepository.updateSingleMessageStatus).toHaveBeenCalledWith('msg-1', 'user-1', 'READ');
    expect(result.modifiedCount).toBe(1);
    expect(resilientMessageService.publishMessageStatus).toHaveBeenCalledWith(
      'msg-1', 'user-2', 'READ', null, null, null
    );
  });

  it('should mark batch messages as READ using conversationId + messageIds', async () => {
    console.log("🧪 Test: should mark batch messages as READ using conversationId + messageIds");
    const messageIds = ['msg-1', 'msg-2'];
    const result = await markMessageRead.execute({
      userId: 'user-1',
      conversationId: 'conv-1',
      messageIds,
    });

    expect(messageRepository.updateMessageStatus).toHaveBeenCalledWith('conv-1', 'user-1', 'READ', messageIds);
    expect(result.modifiedCount).toBe(2);
  });

  it('should decrement unread count in userMetadata', async () => {
    console.log("🧪 Test: should decrement unread count in userMetadata");
    await markMessageRead.execute({ messageId: 'msg-1', userId: 'user-1' });

    expect(conversationRepository.decrementUnreadCountInUserMetadata)
      .toHaveBeenCalledWith('conv-1', 'user-1', 1);
  });
});
