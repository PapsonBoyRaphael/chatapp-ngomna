const ConversationController = require('../../../src/application/controllers/ConversationController');

describe('ConversationController', () => {
  let getConversationsUseCase;
  let getConversationUseCase;
  let archiveConversationUseCase;
  let controller;
  let req, res;

  beforeEach(() => {
    getConversationsUseCase = {
      execute: jest.fn().mockResolvedValue({
        conversations: [{ _id: 'conv-1', name: 'Test' }],
        totalCount: 1,
        fromCache: false,
        pagination: { currentPage: 1, totalPages: 1 },
      }),
    };

    getConversationUseCase = {
      execute: jest.fn().mockResolvedValue({
        conversation: { _id: 'conv-1', name: 'Test', type: 'PRIVATE' },
        fromCache: false,
      }),
    };

    archiveConversationUseCase = {
      execute: jest.fn().mockResolvedValue({ conversationId: 'conv-1', action: 'archive' }),
    };

    controller = new ConversationController(
      getConversationsUseCase,
      getConversationUseCase,
      null, // redisClient
      null, // cacheService
      null, // searchOccurrencesUseCase
      archiveConversationUseCase,
    );

    req = {
      query: {},
      params: {},
      body: {},
      headers: {},
      user: { id: 'user-1' },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn(),
    };
  });

  // ─── getConversations ────────────────────────────────────────
  describe('getConversations', () => {
    it('should return 400 if userId is missing', async () => {
    console.log("🧪 Test: should return 400 if userId is missing");
      req.user = null;
      req.headers = {};
      await controller.getConversations(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MISSING_USER_ID',
      }));
    });

    it('should return conversations with cache headers', async () => {
    console.log("🧪 Test: should return conversations with cache headers");
      req.query = { page: '1', limit: '10' };
      await controller.getConversations(req, res);

      expect(getConversationsUseCase.execute).toHaveBeenCalledWith('user-1', expect.any(Object));
      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'X-Cache': 'MISS' }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should cap limit at 50', async () => {
    console.log("🧪 Test: should cap limit at 50");
      req.query = { page: '1', limit: '999' };
      await controller.getConversations(req, res);

      expect(getConversationsUseCase.execute).toHaveBeenCalledWith('user-1',
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should return 500 on use case error', async () => {
    console.log("🧪 Test: should return 500 on use case error");
      getConversationsUseCase.execute.mockRejectedValue(new Error('DB error'));
      await controller.getConversations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'GET_CONVERSATIONS_FAILED',
      }));
    });
  });

  // ─── getConversation ─────────────────────────────────────────
  describe('getConversation', () => {
    it('should return 400 if conversationId is missing', async () => {
    console.log("🧪 Test: should return 400 if conversationId is missing");
      req.params = {};
      await controller.getConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MISSING_CONVERSATION_ID',
      }));
    });

    it('should return a conversation successfully', async () => {
    console.log("🧪 Test: should return a conversation successfully");
      req.params = { conversationId: 'conv-1' };
      await controller.getConversation(req, res);

      expect(getConversationUseCase.execute).toHaveBeenCalledWith('conv-1', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ─── createConversation ──────────────────────────────────────
  describe('createConversation', () => {
    it('should return 400 if participantId is missing', async () => {
    console.log("🧪 Test: should return 400 if participantId is missing");
      req.body = {};
      await controller.createConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MISSING_PARTICIPANT_ID',
      }));
    });

    it('should create a conversation and return 201', async () => {
    console.log("🧪 Test: should create a conversation and return 201");
      req.body = { participantId: 'user-2', name: 'Convo test' };
      await controller.createConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ─── archiveConversation ─────────────────────────────────────
  describe('archiveConversation', () => {
    it('should return 400 if action is invalid', async () => {
    console.log("🧪 Test: should return 400 if action is invalid");
      req.params = { conversationId: 'conv-1' };
      req.body = { action: 'delete' }; // invalid
      await controller.archiveConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'INVALID_ACTION',
      }));
    });

    it('should archive a conversation successfully', async () => {
    console.log("🧪 Test: should archive a conversation successfully");
      req.params = { conversationId: 'conv-1' };
      req.body = { action: 'archive' };
      await controller.archiveConversation(req, res);

      expect(archiveConversationUseCase.execute).toHaveBeenCalledWith('user-1', 'conv-1', 'archive');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should return 501 if archiveConversationUseCase is not injected', async () => {
    console.log("🧪 Test: should return 501 if archiveConversationUseCase is not injected");
      const ctrlWithoutUseCase = new ConversationController(
        getConversationsUseCase,
        getConversationUseCase,
      );
      req.params = { conversationId: 'conv-1' };
      req.body = { action: 'archive' };
      await ctrlWithoutUseCase.archiveConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(501);
    });
  });
});
