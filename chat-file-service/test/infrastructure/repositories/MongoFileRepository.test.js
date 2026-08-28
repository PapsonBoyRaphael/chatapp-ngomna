const MongoFileRepository = require('../../../src/infrastructure/repositories/MongoFileRepository');
const FileModel = require('../../../src/infrastructure/mongodb/models/FileModel');

// fs-extra est utilisé dans MongoFileRepository pour des opérations de système de fichiers
jest.mock('fs-extra', () => ({
  remove: jest.fn().mockResolvedValue(true),
  ensureDir: jest.fn().mockResolvedValue(true),
  pathExists: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../src/infrastructure/mongodb/models/FileModel', () => {
  class MockFileModel {
    constructor(data) { Object.assign(this, data); }
  }
  MockFileModel.create             = jest.fn();
  MockFileModel.findById           = jest.fn();
  MockFileModel.findByIdAndUpdate  = jest.fn();
  MockFileModel.findByIdAndDelete  = jest.fn();
  MockFileModel.find               = jest.fn();
  MockFileModel.countDocuments     = jest.fn();
  MockFileModel.updateMany         = jest.fn();
  MockFileModel.aggregate          = jest.fn();
  return MockFileModel;
});

describe('MongoFileRepository', () => {
  let kafkaProducer;
  let repository;

  // Créateur d'un objet File valide pour les tests
  const makeFile = (overrides = {}) => ({
    _id: 'file-1',
    originalName: 'photo.jpg',
    fileName: 'uuid123.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    url: '/uploads/uuid123.jpg',
    path: '/uploads/uuid123.jpg',
    uploadedBy: 'user-1',
    status: 'COMPLETED',
    metadata: { content: {}, processing: {}, technical: {} },
    validate: jest.fn(),                         // méthode requise par save()
    toObject: jest.fn().mockReturnValue({ _id: 'file-1', ...overrides }),
    ...overrides,
  });

  beforeEach(() => {
    kafkaProducer = { publishMessage: jest.fn().mockResolvedValue(true) };
    repository = new MongoFileRepository(null, kafkaProducer, null);
  });

  // ─── save ────────────────────────────────────────────────────
  describe('save', () => {
    it('should throw if file object has no validate() method', async () => {
    console.log("🧪 Test: should throw if file object has no validate() method");
      const invalidFile = { originalName: 'doc.pdf' }; // pas de validate()
      await expect(repository.save(invalidFile)).rejects.toThrow(
        'Objet File invalide ou méthode validate manquante'
      );
    });

    it('should create and return the saved file', async () => {
    console.log("🧪 Test: should create and return the saved file");
      const file = makeFile();
      const savedDoc = { _id: 'file-1', originalName: 'photo.jpg', mimeType: 'image/jpeg', size: 1024, status: 'COMPLETED' };

      FileModel.create.mockResolvedValue(savedDoc);

      const result = await repository.save(file);

      expect(file.validate).toHaveBeenCalled();
      expect(FileModel.create).toHaveBeenCalled();
      expect(result._id).toBe('file-1');
      expect(kafkaProducer.publishMessage).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'FILE_SAVED' })
      );
    });

    it('should throw if FileModel.create returns null', async () => {
    console.log("🧪 Test: should throw if FileModel.create returns null");
      const file = makeFile();
      FileModel.create.mockResolvedValue(null);

      await expect(repository.save(file)).rejects.toThrow('Échec de la sauvegarde');
    });
  });

  // ─── findById ────────────────────────────────────────────────
  describe('findById', () => {
    it('should find a file by ID', async () => {
    console.log("🧪 Test: should find a file by ID");
      const doc = { _id: 'file-1', originalName: 'photo.jpg' };
      FileModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) });

      const result = await repository.findById('file-1');

      expect(FileModel.findById).toHaveBeenCalledWith('file-1');
      expect(result.originalName).toBe('photo.jpg');
    });

    it('should throw if file is not found', async () => {
    console.log("🧪 Test: should throw if file is not found");
      FileModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      await expect(repository.findById('file-x')).rejects.toThrow('Fichier file-x non trouvé');
    });
  });

  // ─── deleteFile ──────────────────────────────────────────────
  describe('deleteFile', () => {
    it('should soft delete a file (status = DELETED)', async () => {
    console.log("🧪 Test: should soft delete a file (status = DELETED)");
      const doc = { _id: 'file-1', status: 'DELETED', deletedAt: new Date() };
      FileModel.findByIdAndUpdate.mockResolvedValue(doc);

      const result = await repository.deleteFile('file-1', true);

      expect(FileModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'file-1',
        expect.objectContaining({ $set: expect.objectContaining({ status: 'DELETED' }) }),
        { new: true }
      );
      expect(result.status).toBe('DELETED');
      expect(kafkaProducer.publishMessage).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'FILE_DELETED' })
      );
    });

    it('should hard delete a file when softDelete=false', async () => {
    console.log("🧪 Test: should hard delete a file when softDelete=false");
      const doc = { _id: 'file-1' };
      FileModel.findByIdAndDelete.mockResolvedValue(doc);

      await repository.deleteFile('file-1', false);

      expect(FileModel.findByIdAndDelete).toHaveBeenCalledWith('file-1');
    });

    it('should throw if file is not found during delete', async () => {
    console.log("🧪 Test: should throw if file is not found during delete");
      FileModel.findByIdAndUpdate.mockResolvedValue(null);

      await expect(repository.deleteFile('file-x')).rejects.toThrow('Fichier file-x non trouvé');
    });
  });

  // ─── incrementDownloadCount ──────────────────────────────────
  describe('incrementDownloadCount', () => {
    it('should increment download count and publish Kafka event', async () => {
    console.log("🧪 Test: should increment download count and publish Kafka event");
      const doc = { _id: 'file-1', downloadCount: 5 };
      FileModel.findByIdAndUpdate.mockResolvedValue(doc);

      const result = await repository.incrementDownloadCount('file-1', 'user-1');

      expect(FileModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'file-1',
        expect.objectContaining({ $inc: { downloadCount: 1 } }),
        expect.any(Object)
      );
      expect(result.downloadCount).toBe(5);
      expect(kafkaProducer.publishMessage).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'FILE_DOWNLOADED' })
      );
    });

    it('should throw if file is not found', async () => {
    console.log("🧪 Test: should throw if file is not found");
      FileModel.findByIdAndUpdate.mockResolvedValue(null);

      await expect(repository.incrementDownloadCount('file-x')).rejects.toThrow(
        'Fichier file-x non trouvé'
      );
    });
  });

  // ─── markAsCompleted ─────────────────────────────────────────
  describe('markAsCompleted', () => {
    it('should mark a file as COMPLETED', async () => {
    console.log("🧪 Test: should mark a file as COMPLETED");
      const doc = { _id: 'file-1', status: 'COMPLETED' };
      FileModel.findByIdAndUpdate.mockResolvedValue(doc);

      const result = await repository.markAsCompleted('file-1', { thumbnailUrl: '/th.webp' });

      expect(FileModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'file-1',
        expect.objectContaining({ $set: expect.objectContaining({ status: 'COMPLETED' }) }),
        { new: true }
      );
      expect(result.status).toBe('COMPLETED');
    });
  });

  // ─── markAsFailed ────────────────────────────────────────────
  describe('markAsFailed', () => {
    it('should mark a file as FAILED', async () => {
    console.log("🧪 Test: should mark a file as FAILED");
      const doc = { _id: 'file-1', status: 'FAILED' };
      FileModel.findByIdAndUpdate.mockResolvedValue(doc);

      const result = await repository.markAsFailed('file-1', new Error('Upload timeout'));

      expect(FileModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'file-1',
        expect.objectContaining({ $set: expect.objectContaining({ status: 'FAILED' }) }),
        { new: true }
      );
      expect(result.status).toBe('FAILED');
    });
  });
});
