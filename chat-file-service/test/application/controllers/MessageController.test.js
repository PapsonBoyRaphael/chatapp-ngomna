const MessageController = require('../../../src/application/controllers/MessageController');

describe('MessageController', () => {
  let sendMessageUseCase;
  let getMessagesUseCase;
  let updateMessageStatusUseCase;
  let messageController;
  let req;
  let res;

  beforeEach(() => {
    // Mock des Use Cases
    sendMessageUseCase = {
      execute: jest.fn().mockResolvedValue({ _id: 'msg-123', content: 'Hello' }),
    };
    getMessagesUseCase = {
      execute: jest.fn().mockResolvedValue({ messages: [], fromCache: false }),
    };
    updateMessageStatusUseCase = {
      execute: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    messageController = new MessageController(
      sendMessageUseCase,
      getMessagesUseCase,
      updateMessageStatusUseCase
    );

    // Mock Express Request & Response
    req = {
      body: {},
      query: {},
      params: {},
      headers: {
        'user-agent': 'jest-test',
        'x-request-id': 'req-123',
      },
      ip: '127.0.0.1',
      user: { id: 'user-1' },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn(),
    };
  });

  describe('sendMessage', () => {
    it('should return 400 if required fields are missing', async () => {
    console.log("🧪 Test: should return 400 if required fields are missing");
      req.body = { senderId: 'user-1' }; // receiverId and content missing

      await messageController.sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'MISSING_PARAMETERS'
      }));
      expect(sendMessageUseCase.execute).not.toHaveBeenCalled();
    });

    it('should return 400 if content is too long', async () => {
    console.log("🧪 Test: should return 400 if content is too long");
      req.body = {
        senderId: 'user-1',
        receiverId: 'user-2',
        content: 'a'.repeat(10001),
      };

      await messageController.sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'CONTENT_TOO_LONG'
      }));
    });

    it('should successfully send a message and return 201', async () => {
    console.log("🧪 Test: should successfully send a message and return 201");
      req.body = {
        senderId: 'user-1',
        receiverId: 'user-2',
        content: 'Hello World',
        conversationId: 'conv-1',
      };

      await messageController.sendMessage(req, res);

      expect(sendMessageUseCase.execute).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { _id: 'msg-123', content: 'Hello' }
      }));
    });

    it('should handle errors and return 500', async () => {
    console.log("🧪 Test: should handle errors and return 500");
      req.body = { senderId: 'user-1', receiverId: 'user-2', content: 'Hello' };
      sendMessageUseCase.execute.mockRejectedValue(new Error('Internal failure'));

      await messageController.sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'SEND_MESSAGE_FAILED'
      }));
    });
  });

  describe('getMessages', () => {
    it('should return 400 if conversationId is missing', async () => {
    console.log("🧪 Test: should return 400 if conversationId is missing");
      req.query = {}; // No conversationId
      await messageController.getMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'MISSING_PARAMETERS'
      }));
    });

    it('should retrieve messages successfully and set headers', async () => {
    console.log("🧪 Test: should retrieve messages successfully and set headers");
      req.query = { conversationId: 'conv-1' };
      getMessagesUseCase.execute.mockResolvedValue({ messages: [{ _id: 'msg-1' }], fromCache: true });

      await messageController.getMessages(req, res);

      expect(getMessagesUseCase.execute).toHaveBeenCalledWith('conv-1', expect.any(Object));
      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
        'X-Cache': 'HIT'
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true
      }));
    });
  });
});
