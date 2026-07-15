const EventEmitter = require('events');
const ChatHandler = require('../../../src/application/websocket/chatHandler');

describe('ChatHandler WebSocket', () => {
  let io;
  let socket;
  let sendMessageUseCase;
  let getMessagesUseCase;
  let onlineUserManager;
  let markMessageReadUseCase;
  let chatHandler;

  beforeEach(() => {
    // Mock io server
    io = new EventEmitter();
    io.to = jest.fn().mockReturnThis();
    jest.spyOn(io, 'emit');

    // Mock socket client
    socket = new EventEmitter();
    socket.id = 'socket-id-123';
    jest.spyOn(socket, 'emit');
    socket.userId = 'user-123';
    socket.join = jest.fn().mockResolvedValue(true);
    socket.leave = jest.fn().mockResolvedValue(true);
    socket.rooms = new Set();
    socket.broadcast = {
      emit: jest.fn(),
    };

    sendMessageUseCase = {
      execute: jest.fn().mockResolvedValue({ _id: 'msg-1', content: 'hello' }),
    };

    getMessagesUseCase = {
      execute: jest.fn().mockResolvedValue({ messages: [] }),
    };

    onlineUserManager = {
      updateLastActivity: jest.fn(),
      setUserOffline: jest.fn().mockResolvedValue(),
      isUserOnline: jest.fn().mockResolvedValue(false),
    };

    markMessageReadUseCase = {
      execute: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    chatHandler = new ChatHandler(
      io,
      sendMessageUseCase,
      getMessagesUseCase,
      null, // updateMessageStatusUseCase
      onlineUserManager,
      null, // getConversationIdsUseCase
      null, // getConversationUseCase
      null, // getConversationsUseCase
      null, // getMessageByIdUseCase
      null, // updateMessageContentUseCase
      null, // createGroupUseCase
      null, // createBroadcastUseCase
      null, // roomManager
      null, // markMessageDeliveredUseCase
      markMessageReadUseCase,
    );

    // Mock isValidObjectId utility on ChatHandler if it uses it
    chatHandler.isValidObjectId = jest.fn().mockReturnValue(true);

    // Initialise les events
    chatHandler.setupSocketHandlers();
    // Simule la connection du socket
    io.emit('connection', socket);
  });

  it('should authenticate a socket and assign userId', async () => {
    console.log("🧪 Test: should authenticate a socket and assign userId");
    // Mock AuthMiddleware.authenticate to resolve
    const AuthMiddleware = require('../../../src/interfaces/http/middleware/authMiddleware');
    jest.spyOn(AuthMiddleware, 'authenticate').mockImplementation((req, res, next) => {
      req.user = { id: 'user-123', matricule: 'MAT-123' };
      next();
    });

    await chatHandler.handleAuthentication(socket, { token: 'valid-token' });

    expect(socket.emit).toHaveBeenCalledWith('authenticated', expect.any(Object));
  });

  it('should call sendMessageUseCase when sendMessage event is received', async () => {
    console.log("🧪 Test: should call sendMessageUseCase when sendMessage event is received");
    const messageData = { conversationId: '507f1f77bcf86cd799439011', content: 'test message' };
    
    await chatHandler.handleSendMessage(socket, messageData);

    expect(sendMessageUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: '507f1f77bcf86cd799439011',
        content: 'test message',
        senderId: 'user-123',
      })
    );
  });

  it('should call markMessageReadUseCase when markMessageRead event is received', async () => {
    console.log("🧪 Test: should call markMessageReadUseCase when markMessageRead event is received");
    const data = { messageId: '507f1f77bcf86cd799439011', conversationId: '507f1f77bcf86cd799439011' };

    await chatHandler.handleMarkMessageRead(socket, data);

    expect(markMessageReadUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: '507f1f77bcf86cd799439011',
        userId: 'user-123',
      })
    );
  });

  it('should handle disconnection by setting user offline', async () => {
    console.log("🧪 Test: should handle disconnection by setting user offline");
    await chatHandler.handleDisconnection(socket, 'transport close');

    expect(onlineUserManager.setUserOffline).toHaveBeenCalledWith('user-123', 'socket-id-123');
    // user went completely offline so should broadcast
    expect(socket.broadcast.emit).toHaveBeenCalledWith('user_disconnected', expect.objectContaining({
      userId: 'user-123',
    }));
  });
});
