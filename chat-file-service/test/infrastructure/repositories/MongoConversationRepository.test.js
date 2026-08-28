const MongoConversationRepository = require('../../../src/infrastructure/repositories/MongoConversationRepository');
const ConversationModel = require('../../../src/infrastructure/mongodb/models/ConversationModel');

// Mock du modèle Mongoose avant de l'importer dans le repository
jest.mock('../../../src/infrastructure/mongodb/models/ConversationModel', () => {
  class MockConversation {
    constructor(data) {
      Object.assign(this, data);
      this._id = data._id || 'mocked-id';
    }
    validateSync() { return null; }
    save() { return Promise.resolve(this); }
  }
  
  MockConversation.findById = jest.fn();
  MockConversation.findOne = jest.fn();
  MockConversation.find = jest.fn();
  MockConversation.countDocuments = jest.fn();
  MockConversation.findByIdAndUpdate = jest.fn();
  
  return MockConversation;
});

describe('MongoConversationRepository', () => {
  let repository;
  let kafkaProducer;

  beforeEach(() => {
    kafkaProducer = {
      publishMessage: jest.fn().mockResolvedValue(true)
    };
    
    repository = new MongoConversationRepository(kafkaProducer, null);
    
    // Mock de la méthode privée de sanitization pour simplifier
    repository._sanitizeConversationData = jest.fn(data => data);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should find a conversation by ID', async () => {
    console.log("🧪 Test: should find a conversation by ID");
      ConversationModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'conv-1', name: 'Test' })
      });

      const result = await repository.findById('conv-1');
      
      expect(ConversationModel.findById).toHaveBeenCalledWith('conv-1');
      expect(result.name).toBe('Test');
    });

    it('should throw an error if conversation is not found', async () => {
    console.log("🧪 Test: should throw an error if conversation is not found");
      ConversationModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });

      await expect(repository.findById('conv-1')).rejects.toThrow('Conversation conv-1 non trouvée');
    });
  });

  describe('save', () => {
    it('should create a new conversation and publish event', async () => {
    console.log("🧪 Test: should create a new conversation and publish event");
      const convData = { name: 'Group', participants: ['user-1'] };
      
      const result = await repository.save(convData);

      expect(result._id).toBe('mocked-id');
      expect(result.name).toBe('Group');
      expect(kafkaProducer.publishMessage).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'CONVERSATION_CREATED' })
      );
    });

    it('should update an existing conversation if _id is provided', async () => {
    console.log("🧪 Test: should update an existing conversation if _id is provided");
      const convData = { _id: 'conv-1', name: 'Updated Group' };
      
      // Simuler que la conversation existe déjà
      ConversationModel.findById.mockResolvedValue({ _id: 'conv-1', name: 'Old Group' });
      ConversationModel.findByIdAndUpdate.mockResolvedValue({ _id: 'conv-1', name: 'Updated Group' });

      const result = await repository.save(convData);

      expect(ConversationModel.findById).toHaveBeenCalledWith('conv-1');
      expect(ConversationModel.findByIdAndUpdate).toHaveBeenCalled();
      expect(result.name).toBe('Updated Group');
    });
  });

  describe('updateLastMessage', () => {
    it('should update lastMessage and statistics', async () => {
    console.log("🧪 Test: should update lastMessage and statistics");
      const messageData = { _id: 'msg-1', content: 'Hello', type: 'TEXT', senderId: 'user-1' };
      
      ConversationModel.findByIdAndUpdate.mockResolvedValue({ _id: 'conv-1', lastMessage: messageData });

      const result = await repository.updateLastMessage('conv-1', messageData);

      expect(ConversationModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          $set: expect.any(Object),
          $inc: expect.objectContaining({ 'metadata.stats.totalMessages': 1 })
        }),
        { new: true }
      );
      expect(result._id).toBe('conv-1');
      expect(kafkaProducer.publishMessage).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'CONVERSATION_UPDATED' })
      );
    });
  });
});
