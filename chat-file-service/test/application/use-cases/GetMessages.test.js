const GetMessages = require('../../../src/application/use-cases/GetMessages');

describe('GetMessages Use Case', () => {
  let messageRepository;
  let getMessages;

  beforeEach(() => {
    messageRepository = {
      findByConversation: jest.fn().mockResolvedValue({
        messages: [{ _id: 'msg-1', content: 'Hello' }],
        nextCursor: null,
        hasMore: false,
        fromCache: false,
        totalCount: 1,
      }),
    };
    getMessages = new GetMessages(messageRepository);
  });

  it('should throw if conversationId is missing', async () => {
    console.log("🧪 Test: should throw if conversationId is missing");
    await expect(getMessages.execute(null)).rejects.toThrow('ID de conversation requis');
  });

  it('should return messages from repository', async () => {
    console.log("🧪 Test: should return messages from repository");
    const result = await getMessages.execute('conv-1', { limit: 10, userId: 'user-1' });

    expect(messageRepository.findByConversation).toHaveBeenCalledWith('conv-1', expect.objectContaining({
      limit: 10,
      userId: 'user-1',
    }));
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe('Hello');
    expect(result.hasMore).toBe(false);
    expect(result.fromCache).toBe(false);
  });

  it('should return fromCache=true when result comes from cache', async () => {
    console.log("🧪 Test: should return fromCache=true when result comes from cache");
    messageRepository.findByConversation.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
      fromCache: true,
      totalCount: 0,
    });

    const result = await getMessages.execute('conv-1', { useCache: true });
    expect(result.fromCache).toBe(true);
  });

  it('should pass cursor to repository for pagination', async () => {
    console.log("🧪 Test: should pass cursor to repository for pagination");
    const cursor = 'cursor-abc';
    await getMessages.execute('conv-1', { cursor, direction: 'older' });

    expect(messageRepository.findByConversation).toHaveBeenCalledWith('conv-1', expect.objectContaining({
      cursor,
      direction: 'older',
    }));
  });
});
