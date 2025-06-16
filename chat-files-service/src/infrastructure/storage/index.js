/**
 * Storage Index - Chat Files Service
 * CENADI Chat-Files-Service
 * Export principal du module de stockage
 */

// Adaptateurs
const { 
  BaseStorageAdapter, 
  LocalStorageAdapter, 
  createAdapter 
} = require('./adapters');

// Manager
const StorageManager = require('./managers/StorageManager');

// Processeurs
const FileProcessor = require('./processors/FileProcessor');
const ImageProcessor = require('./processors/ImageProcessor');
const VideoProcessor = require('./processors/VideoProcessor');
const AudioProcessor = require('./processors/AudioProcessor');
const DocumentProcessor = require('./processors/DocumentProcessor');
const ArchiveProcessor = require('./processors/ArchiveProcessor');

// Factory pour créer un système de stockage complet
function createStorageSystem(config = {}) {
  const defaultConfig = {
    provider: 'local',
    basePath: './storage',
    maxFileSize: 100 * 1024 * 1024, // 100MB
    enableCompression: false,
    enableEncryption: false,
    enableBackup: false,
    enableMetadataFiles: true,
    cleanupInterval: 24 * 60 * 60 * 1000, // 24h
    ...config
  };

  // Créer l'adaptateur avec le LocalStorageProvider renommé
  const adapter = new LocalStorageAdapter({
    basePath: defaultConfig.basePath,
    maxFileSize: defaultConfig.maxFileSize,
    enableCompression: defaultConfig.enableCompression,
    enableEncryption: defaultConfig.enableEncryption,
    enableBackup: defaultConfig.enableBackup,
    enableMetadataFiles: defaultConfig.enableMetadataFiles,
    cleanupInterval: defaultConfig.cleanupInterval
  });

  // Créer le manager
  const manager = new StorageManager(adapter, {
    enableProcessing: true
  });

  // Enregistrer les processeurs
  manager.registerProcessor('file', new FileProcessor());
  manager.registerProcessor('image', new ImageProcessor());
  manager.registerProcessor('video', new VideoProcessor());
  manager.registerProcessor('audio', new AudioProcessor());
  manager.registerProcessor('document', new DocumentProcessor());
  manager.registerProcessor('archive', new ArchiveProcessor());

  return {
    adapter,
    manager,
    async initialize() {
      await adapter.initialize();
      return this;
    }
  };
}

// Factory simplifiée pour développement
function createSimpleStorage(basePath = './storage') {
  return createStorageSystem({
    basePath,
    maxFileSize: 50 * 1024 * 1024, // 50MB pour dev
    enableCompression: false,
    enableEncryption: false,
    enableBackup: false
  });
}

module.exports = {
  // Classes principales
  BaseStorageAdapter,
  LocalStorageAdapter,
  StorageManager,
  
  // Processeurs
  FileProcessor,
  ImageProcessor,
  VideoProcessor,
  AudioProcessor,
  DocumentProcessor,
  ArchiveProcessor,
  
  // Factories
  createAdapter,
  createStorageSystem,
  createSimpleStorage,
  
  // Pour compatibilité
  adapters: {
    BaseStorageAdapter,
    LocalStorageAdapter,
    createAdapter
  },
  
  processors: {
    FileProcessor,
    ImageProcessor,
    VideoProcessor,
    AudioProcessor,
    DocumentProcessor,
    ArchiveProcessor
  }
};
