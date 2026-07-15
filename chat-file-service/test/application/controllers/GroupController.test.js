const GroupController = require('../../../src/application/controllers/GroupController');

describe('GroupController', () => {
  let createGroupUseCase;
  let getConversationUseCase;
  let addParticipantUseCase;
  let removeParticipantUseCase;
  let leaveConversationUseCase;
  let addAdminUseCase;
  let controller;
  let req, res;

  beforeEach(() => {
    createGroupUseCase = {
      execute: jest.fn().mockResolvedValue({ _id: 'group-1', name: 'Dev Team' }),
    };
    getConversationUseCase = {
      execute: jest.fn().mockResolvedValue({ _id: 'group-1', type: 'GROUP', name: 'Dev Team' }),
    };
    addParticipantUseCase = {
      execute: jest.fn().mockResolvedValue({ _id: 'group-1', participants: ['admin-1', 'user-2'] }),
    };
    removeParticipantUseCase = {
      execute: jest.fn().mockResolvedValue({ _id: 'group-1', participants: ['admin-1'] }),
    };
    leaveConversationUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true }),
    };
    addAdminUseCase = {
      execute: jest.fn().mockResolvedValue({ promoted: ['user-2'], skipped: [], conversation: { settings: { broadcastAdmins: ['admin-1', 'user-2'] } } }),
    };

    controller = new GroupController({
      createGroupUseCase,
      getConversationUseCase,
      addParticipantUseCase,
      removeParticipantUseCase,
      leaveConversationUseCase,
      addAdminUseCase,
    });

    req = {
      body: {},
      params: {},
      query: {},
      headers: {},
      user: { id: 'admin-1' },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  // ─── createGroup ─────────────────────────────────────────────
  describe('createGroup', () => {
    it('should return 400 if name, adminId, or members are missing', async () => {
    console.log("🧪 Test: should return 400 if name, adminId, or members are missing");
      req.body = { name: 'Dev', adminId: 'admin-1' }; // members missing
      await controller.createGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MISSING_REQUIRED_FIELDS',
      }));
    });

    it('should create a group and return 201', async () => {
    console.log("🧪 Test: should create a group and return 201");
      req.body = { name: 'Dev Team', adminId: 'admin-1', members: ['user-2'] };
      await controller.createGroup(req, res);

      expect(createGroupUseCase.execute).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { _id: 'group-1', name: 'Dev Team' } }));
    });
  });

  // ─── getGroup ────────────────────────────────────────────────
  describe('getGroup', () => {
    it('should return 400 if userId is missing', async () => {
    console.log("🧪 Test: should return 400 if userId is missing");
      req.user = null;
      req.headers = {};
      req.params = { groupId: 'group-1' };
      await controller.getGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_USER_ID' }));
    });

    it('should return 404 if group is not found', async () => {
    console.log("🧪 Test: should return 404 if group is not found");
      req.params = { groupId: 'group-1' };
      getConversationUseCase.execute.mockResolvedValue(null);
      await controller.getGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 if conversation is not a GROUP', async () => {
    console.log("🧪 Test: should return 400 if conversation is not a GROUP");
      req.params = { groupId: 'conv-1' };
      getConversationUseCase.execute.mockResolvedValue({ _id: 'conv-1', type: 'PRIVATE' });
      await controller.getGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_A_GROUP' }));
    });

    it('should return a group successfully', async () => {
    console.log("🧪 Test: should return a group successfully");
      req.params = { groupId: 'group-1' };
      await controller.getGroup(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ─── addParticipant ──────────────────────────────────────────
  describe('addParticipant', () => {
    it('should return 400 if participantId is missing', async () => {
    console.log("🧪 Test: should return 400 if participantId is missing");
      req.params = { groupId: 'group-1' };
      req.body = {};
      await controller.addParticipant(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_PARTICIPANT_ID' }));
    });

    it('should add a participant successfully', async () => {
    console.log("🧪 Test: should add a participant successfully");
      req.params = { groupId: 'group-1' };
      req.body = { participantId: 'user-3' };
      await controller.addParticipant(req, res);

      expect(addParticipantUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: 'group-1',
        participantId: 'user-3',
      }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 409 if user is already a member', async () => {
    console.log("🧪 Test: should return 409 if user is already a member");
      req.params = { groupId: 'group-1' };
      req.body = { participantId: 'user-2' };
      addParticipantUseCase.execute.mockRejectedValue(new Error('déjà membre du groupe'));
      await controller.addParticipant(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ALREADY_MEMBER' }));
    });
  });

  // ─── leaveGroup ──────────────────────────────────────────────
  describe('leaveGroup', () => {
    it('should return 400 if userId is missing', async () => {
    console.log("🧪 Test: should return 400 if userId is missing");
      req.user = null;
      req.headers = {};
      req.params = { groupId: 'group-1' };
      await controller.leaveGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_USER_ID' }));
    });

    it('should return 403 if creator tries to leave', async () => {
    console.log("🧪 Test: should return 403 if creator tries to leave");
      req.params = { groupId: 'group-1' };
      leaveConversationUseCase.execute.mockRejectedValue(new Error('Le créateur ne peut pas quitter'));
      await controller.leaveGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CREATOR_CANNOT_LEAVE' }));
    });

    it('should leave a group successfully', async () => {
    console.log("🧪 Test: should leave a group successfully");
      req.params = { groupId: 'group-1' };
      await controller.leaveGroup(req, res);

      expect(leaveConversationUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: 'group-1',
        userId: 'admin-1',
      }));
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ─── addAdmin ────────────────────────────────────────────────
  describe('addAdmin', () => {
    it('should return 400 if userIds is missing', async () => {
    console.log("🧪 Test: should return 400 if userIds is missing");
      req.params = { groupId: 'group-1' };
      req.body = {};
      await controller.addAdmin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_USER_IDS' }));
    });

    it('should promote an admin successfully', async () => {
    console.log("🧪 Test: should promote an admin successfully");
      req.params = { groupId: 'group-1' };
      req.body = { userIds: 'user-2', promotedBy: 'admin-1' };
      await controller.addAdmin(req, res);

      expect(addAdminUseCase.execute).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});
