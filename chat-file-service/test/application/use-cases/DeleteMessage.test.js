const DeleteMessage = require('../../../src/application/use-cases/DeleteMessage');

describe('DeleteMessage Use Case', () => {
  let messageRepository;
  let conversationRepository;
  let resilientMessageService;
  let deleteMessage;

  const baseMessage = {
    _id: 'msg-1',
    senderId: 'user-1',
    conversationId: 'conv-1',
    content: 'Hello',
    createdAt: new Date(),
    deletedForUsers: [],
  };

  beforeEach(() => {
    messageRepository = {
      findById: jest.fn().mockResolvedValue({ ...baseMessage }),
      findByConversationId: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue({ ...baseMessage, isDeleted: true, status: 'DELETED' }),
    };

    conversationRepository = {
      findById: jest.fn().mockResolvedValue({ _id: 'conv-1', participants: ['user-1', 'user-2'], lastMessage: null }),
      save: jest.fn().mockResolvedValue(true),
    };

    resilientMessageService = {
      publishDeletedMessageToAllParticipants: jest.fn().mockResolvedValue(true),
    };

    deleteMessage = new DeleteMessage(
      messageRepository,
      conversationRepository,
      null,
      resilientMessageService
    );
  });

  it('should throw if messageId or userId is missing', async () => {
    console.log("🧪 Test: should throw if messageId or userId is missing");
    await expect(deleteMessage.execute({ userId: 'user-1' })).rejects.toThrow('messageId et userId sont requis');
    await expect(deleteMessage.execute({ messageId: 'msg-1' })).rejects.toThrow('messageId et userId sont requis');
  });

  it('should throw if message is not found', async () => {
    console.log("🧪 Test: should throw if message is not found");
    messageRepository.findById.mockResolvedValue(null);
    await expect(deleteMessage.execute({ messageId: 'msg-1', userId: 'user-1' }))
      .rejects.toThrow('Message introuvable');
  });

  it('should delete FOR_ME by adding userId to deletedForUsers', async () => {
    console.log("🧪 Test: should delete FOR_ME by adding userId to deletedForUsers");
    const result = await deleteMessage.execute({
      messageId: 'msg-1',
      userId: 'user-1',
      deleteType: 'FOR_ME',
    });

    expect(result.success).toBe(true);
    expect(result.deleteType).toBe('FOR_ME');
    expect(messageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ deletedForUsers: expect.arrayContaining(['user-1']) })
    );
    // Pas de publication redis pour FOR_ME
    expect(resilientMessageService.publishDeletedMessageToAllParticipants).not.toHaveBeenCalled();
  });

  it('should delete FOR_EVERYONE and mark message as DELETED', async () => {
    console.log("🧪 Test: should delete FOR_EVERYONE and mark message as DELETED");
    const result = await deleteMessage.execute({
      messageId: 'msg-1',
      userId: 'user-1', // Même que senderId
      deleteType: 'FOR_EVERYONE',
    });

    expect(result.success).toBe(true);
    expect(result.deleteType).toBe('FOR_EVERYONE');
    expect(messageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isDeleted: true, status: 'DELETED', deletedFor: 'EVERYONE' })
    );
    expect(resilientMessageService.publishDeletedMessageToAllParticipants).toHaveBeenCalled();
  });

  it('should throw if non-sender tries to delete FOR_EVERYONE', async () => {
    console.log("🧪 Test: should throw if non-sender tries to delete FOR_EVERYONE");
    await expect(deleteMessage.execute({
      messageId: 'msg-1',
      userId: 'user-2', // user-2 n'est pas l'expéditeur
      deleteType: 'FOR_EVERYONE',
    })).rejects.toThrow("Seul l'expéditeur peut supprimer pour tout le monde");
  });
});
