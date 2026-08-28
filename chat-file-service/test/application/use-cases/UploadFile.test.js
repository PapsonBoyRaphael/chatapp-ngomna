const UploadFile = require('../../../src/application/use-cases/UploadFile');

// Mock de music-metadata (paquet optionnel pas encore installé)
jest.mock('music-metadata', () => ({ parseFile: jest.fn() }), { virtual: true });

describe('UploadFile Use Case', () => {
  let fileRepository;
  let resilientMessageService;
  let uploadFile;

  beforeEach(() => {
    fileRepository = {
      save: jest.fn().mockImplementation(entity => Promise.resolve({
        ...entity,
        _id: entity._id || 'file-uuid-123',
        createdAt: new Date(),
      })),
    };

    resilientMessageService = {
      addToStream: jest.fn().mockResolvedValue(true),
    };

    uploadFile = new UploadFile(fileRepository, null, resilientMessageService);
  });

  it('should throw if originalName or fileName is missing', async () => {
    console.log("🧪 Test: should throw if originalName or fileName is missing");
    await expect(uploadFile.execute({ size: 100, mimeType: 'image/png' }))
      .rejects.toThrow('Données de fichier incomplètes');
  });

  it('should extract fileId from fileName (UUID without extension)', async () => {
    console.log("🧪 Test: should extract fileId from fileName (UUID without extension)");
    const fileData = {
      originalName: 'photo.png',
      fileName: 'abc-uuid-123.png',
      mimeType: 'image/png',
      size: 1024,
      path: '/uploads/abc-uuid-123.png',
      url: 'http://localhost/files/abc-uuid-123.png',
      uploadedBy: 'user-1',
    };

    const result = await uploadFile.execute(fileData);
    expect(result.id).toBe('abc-uuid-123');
  });

  it('should save the file entity via the repository', async () => {
    console.log("🧪 Test: should save the file entity via the repository");
    const fileData = {
      originalName: 'document.pdf',
      fileName: 'doc-uuid-456.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      path: '/uploads/doc-uuid-456.pdf',
      url: 'http://localhost/files/doc-uuid-456.pdf',
      uploadedBy: 'user-2',
    };

    await uploadFile.execute(fileData);
    expect(fileRepository.save).toHaveBeenCalledTimes(1);
  });

  it('should publish file.uploaded event to redis stream', async () => {
    console.log("🧪 Test: should publish file.uploaded event to redis stream");
    const fileData = {
      originalName: 'video.mp4',
      fileName: 'vid-uuid-789.mp4',
      mimeType: 'video/mp4',
      size: 50000,
      path: '/uploads/vid-uuid-789.mp4',
      url: 'http://localhost/files/vid-uuid-789.mp4',
      uploadedBy: 'user-3',
      conversationId: 'conv-1',
    };

    await uploadFile.execute(fileData);
    expect(resilientMessageService.addToStream).toHaveBeenCalledWith(
      'chat:stream:events:files',
      expect.objectContaining({ event: 'file.uploaded' })
    );
  });

  it('should return correct result structure', async () => {
    console.log("🧪 Test: should return correct result structure");
    const fileData = {
      originalName: 'image.jpg',
      fileName: 'img-uuid-321.jpg',
      mimeType: 'image/jpeg',
      size: 3000,
      path: '/uploads/img-uuid-321.jpg',
      url: 'http://localhost/files/img-uuid-321.jpg',
      uploadedBy: 'user-1',
    };

    const result = await uploadFile.execute(fileData);
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('originalName');
    expect(result).toHaveProperty('fileName');
    expect(result).toHaveProperty('size');
    expect(result).toHaveProperty('mimeType');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('status');
  });
});
