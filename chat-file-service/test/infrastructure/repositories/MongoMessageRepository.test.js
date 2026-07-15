const MongoMessageRepository = require('../../../src/infrastructure/repositories/MongoMessageRepository');
const MessageModel = require('../../../src/infrastructure/mongodb/models/MessageModel');

jest.mock('../../../src/infrastructure/mongodb/models/MessageModel', () => {
  class MockMessage {
    constructor(data) {
      Object.assign(this, data);
      this._id = data._id || 'msg-mock-id';
    }
    validateSync() { return null; }
    toObject() { return { ...this }; }
  }
  MockMessage.findById    = jest.fn();
  MockMessage.findByIdAndUpdate = jest.fn();
  MockMessage.find        = jest.fn();
  MockMessage.updateMany  = jest.fn();
  MockMessage.countDocuments = jest.fn();
  MockMessage.findOne     = jest.fn();
  MockMessage.aggregate   = jest.fn();
  return MockMessage;
});

describe('MongoMessageRepository', () => {
  let kafkaProducer;
  let repository;

  beforeEach(() => {
    kafkaProducer = { publishMessage: jest.fn().mockResolvedValue(true) };
    repository = new MongoMessageRepository(kafkaProducer);
  });

  // ─── save ────────────────────────────────────────────────────
  describe('save', () => {
    it('should save a new message using findByIdAndUpdate (upsert)', async () => {
    console.log("🧪 Test: should save a new message using findByIdAndUpdate (upsert)");
      const messageData = {
        senderId: 'user-1',
        conversationId: 'conv-1',
        content: 'Hello',
        type: 'TEXT',
      };

      const savedDoc = { ...messageData, _id: 'msg-mock-id' };
      MessageModel.findByIdAndUpdate.mockResolvedValue(savedDoc);

      const result = await repository.save(messageData);

      expect(MessageModel.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Object),
        expect.objectContaining({ upsert: true, new: true })
      );
      expect(result.senderId).toBe('user-1');
    });

    it('should throw if save returns null (invalid document)', async () => {
    console.log("🧪 Test: should throw if save returns null (invalid document)");
      const messageData = { senderId: 'u', conversationId: 'c', content: 'x', type: 'TEXT' };
      MessageModel.findByIdAndUpdate.mockResolvedValue(null);

      await expect(repository.save(messageData)).rejects.toThrow('Sauvegarde a échoué');
    });
  });

  // ─── findById ────────────────────────────────────────────────
  describe('findById', () => {
    it('should return a message by ID', async () => {
    console.log("🧪 Test: should return a message by ID");
      const doc = { _id: 'msg-1', content: 'Hello', senderId: 'user-1' };
      MessageModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) });

      const result = await repository.findById('msg-1');

      expect(MessageModel.findById).toHaveBeenCalledWith('msg-1');
      expect(result.content).toBe('Hello');
    });

    it('should throw if message is not found', async () => {
    console.log("🧪 Test: should throw if message is not found");
      MessageModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await expect(repository.findById('msg-x')).rejects.toThrow('Message msg-x non trouvé');
    });
  });

  // ─── updateMessageStatus ─────────────────────────────────────
  describe('updateMessageStatus', () => {
    it('should throw if receiverId or status is missing', async () => {
    console.log("🧪 Test: should throw if receiverId or status is missing");
      await expect(repository.updateMessageStatus('conv-1', null, 'READ'))
        .rejects.toThrow('receiverId et status sont requis');
    });

    it('should throw if status is invalid', async () => {
    console.log("🧪 Test: should throw if status is invalid");
      await expect(repository.updateMessageStatus('conv-1', 'user-1', 'INVALID'))
        .rejects.toThrow('Status invalide');
    });

    it('should use updateMany for non-READ/DELIVERED statuses (ex: DELETED)', async () => {
    console.log("🧪 Test: should use updateMany for non-READ/DELIVERED statuses (ex: DELETED)");
      MessageModel.updateMany.mockResolvedValue({ modifiedCount: 2, matchedCount: 2 });

      const result = await repository.updateMessageStatus('conv-1', 'user-1', 'DELETED');

      expect(MessageModel.updateMany).toHaveBeenCalled();
      expect(result.modifiedCount).toBe(2);
    });
  });

  // ─── deleteById ──────────────────────────────────────────────
  describe('deleteById', () => {
    it('should throw if message is not found', async () => {
    console.log("🧪 Test: should throw if message is not found");
      MessageModel.findById.mockResolvedValue(null);

      await expect(repository.deleteById('msg-x')).rejects.toThrow('Message msg-x non trouvé');
    });

    it('should soft delete and publish Kafka event', async () => {
    console.log("🧪 Test: should soft delete and publish Kafka event");
      const msg = { _id: 'msg-1', senderId: 'user-1', conversationId: 'conv-1' };
      MessageModel.findById.mockResolvedValue(msg);
      MessageModel.findByIdAndUpdate.mockResolvedValue({ ...msg, deletedAt: new Date() });

      const result = await repository.deleteById('msg-1');

      expect(MessageModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'msg-1',
        expect.objectContaining({ deletedAt: expect.any(Date) }),
        { new: true }
      );
      expect(kafkaProducer.publishMessage).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MESSAGE_DELETED' })
      );
      expect(result._id).toBe('msg-1');
    });
  });

  // ─── getUnreadCount ──────────────────────────────────────────
  describe('getUnreadCount', () => {
    it('should return the count of unread messages for a user', async () => {
    console.log("🧪 Test: should return the count of unread messages for a user");
      MessageModel.countDocuments.mockResolvedValue(5);

      const count = await repository.getUnreadCount('user-1', 'conv-1');

      expect(MessageModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ receiverId: 'user-1' })
      );
      expect(count).toBe(5);
    });
  });
});
