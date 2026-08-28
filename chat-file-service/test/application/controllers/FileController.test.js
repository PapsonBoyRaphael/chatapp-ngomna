const FileController = require('../../../src/application/controllers/FileController');

// music-metadata est requis transitif (FileController → UploadFile → music-metadata)
jest.mock('music-metadata', () => ({ parseFile: jest.fn() }), { virtual: true });
// uuid est utilisé dans FileController pour générer l'ID des fichiers
jest.mock('uuid', () => ({ v4: jest.fn(() => 'testuuid1234') }));

describe('FileController', () => {
  let uploadFileUseCase;
  let getFileUseCase;
  let fileStorageService;
  let mediaProcessingService;
  let controller;
  let req, res;

  beforeEach(() => {
    uploadFileUseCase = {
      execute: jest.fn().mockResolvedValue({
        id: 'testuuid1234',
        originalName: 'photo.jpg',
        fileName: 'testuuid1234.jpg',
        size: 1024,
        mimeType: 'image/jpeg',
        url: '/uploads/testuuid1234.jpg',
        status: 'COMPLETED',
        metadata: {},
      }),
    };

    getFileUseCase = {
      execute: jest.fn().mockResolvedValue({
        _id: 'file-1',
        originalName: 'photo.jpg',
        size: 1024,
        mimeType: 'image/jpeg',
        url: '/uploads/file-1.jpg',
        status: 'COMPLETED',
        metadata: { technical: { fileType: 'IMAGE' }, processing: {} },
      }),
    };

    fileStorageService = {
      uploadFromBuffer: jest.fn().mockResolvedValue('/uploads/testuuid1234.jpg'),
      constructor: { name: 'SFTPStorageService' },
    };

    mediaProcessingService = {
      processFile: jest.fn().mockResolvedValue({
        technical: { fileType: 'IMAGE', category: 'media', extension: '.jpg' },
        content: {},
      }),
      getFileType: jest.fn().mockReturnValue('IMAGE'),
    };

    controller = new FileController(
      uploadFileUseCase,
      getFileUseCase,
      null, // redisClient
      fileStorageService,
      null, // downloadFileUseCase
      mediaProcessingService,
    );

    // Patch le nom du constructeur du storage pour les tests
    Object.defineProperty(fileStorageService, 'constructor', { value: { name: 'SFTPService' } });

    req = {
      body: {},
      params: {},
      query: {},
      headers: {},
      user: { id: 'user-1' },
      file: null,
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn(),
      setHeader: jest.fn(),
      redirect: jest.fn(),
    };
  });

  // ─── uploadFile ──────────────────────────────────────────────
  describe('uploadFile', () => {
    it('should return 400 if no file is provided', async () => {
    console.log("🧪 Test: should return 400 if no file is provided");
      req.file = null;
      await controller.uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NO_FILE' }));
    });

    it('should return 401 if user is not authenticated', async () => {
    console.log("🧪 Test: should return 401 if user is not authenticated");
      req.file = { originalname: 'photo.jpg', buffer: Buffer.from(''), size: 100, mimetype: 'image/jpeg' };
      req.user = null;
      req.headers = {};
      await controller.uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
    });

    it('should upload a file and return 201', async () => {
    console.log("🧪 Test: should upload a file and return 201");
      req.file = {
        originalname: 'photo.jpg',
        buffer: Buffer.from('fake-content'),
        size: 1024,
        mimetype: 'image/jpeg',
      };
      req.body = { conversationId: 'conv-1' };

      await controller.uploadFile(req, res);

      expect(fileStorageService.uploadFromBuffer).toHaveBeenCalled();
      expect(uploadFileUseCase.execute).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ─── getFile ─────────────────────────────────────────────────
  describe('getFile', () => {
    it('should return 404 if file is not found', async () => {
    console.log("🧪 Test: should return 404 if file is not found");
      req.params = { fileId: 'file-1' };
      getFileUseCase.execute.mockResolvedValue(null);
      await controller.getFile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FILE_NOT_FOUND' }));
    });

    it('should return file metadata successfully', async () => {
    console.log("🧪 Test: should return file metadata successfully");
      req.params = { fileId: 'file-1' };
      await controller.getFile(req, res);

      expect(getFileUseCase.execute).toHaveBeenCalledWith('file-1', 'user-1');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  // ─── downloadFile ────────────────────────────────────────────
  describe('downloadFile', () => {
    it('should return 400 if fileId is missing', async () => {
    console.log("🧪 Test: should return 400 if fileId is missing");
      req.params = {};
      await controller.downloadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'ID du fichier requis' }));
    });

    it('should throw 500 if downloadFileUseCase is not injected', async () => {
    console.log("🧪 Test: should throw 500 if downloadFileUseCase is not injected");
      req.params = { fileId: 'file-1' };
      await controller.downloadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ─── downloadMultipleFiles ────────────────────────────────────
  describe('downloadMultipleFiles', () => {
    it('should return 400 if fileIds is empty or not an array', async () => {
    console.log("🧪 Test: should return 400 if fileIds is empty or not an array");
      req.body = { fileIds: [] };
      await controller.downloadMultipleFiles(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Liste de fichiers requise' }));
    });
  });
});
