/**
 * Schéma MongoDB : File
 * CENADI Chat-Files-Service
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { baseOptions, basePlugin } = require('./BaseSchema');

// Sous-schéma pour les métadonnées de fichier
const fileMetadataSchema = new Schema({
  // Informations techniques
  dimensions: {
    width: {
      type: Number,
      min: 0
    },
    height: {
      type: Number,
      min: 0
    }
  },
  
  duration: {
    type: Number, // en secondes pour audio/vidéo
    min: 0
  },
  
  resolution: {
    type: String, // ex: "1920x1080"
  },
  
  bitrate: {
    type: Number, // pour audio/vidéo
    min: 0
  },
  
  fps: {
    type: Number, // frames per second pour vidéo
    min: 0
  },
  
  // Informations de compression
  isCompressed: {
    type: Boolean,
    default: false
  },
  
  compressionRatio: {
    type: Number,
    min: 0,
    max: 1
  },
  
  originalSize: {
    type: Number,
    min: 0
  },
  
  // Métadonnées extraites
  exifData: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  // Informations de géolocalisation (si présentes dans EXIF)
  location: {
    latitude: Number,
    longitude: Number,
    altitude: Number
  },
  
  // Tags automatiques (IA/ML)
  autoTags: [String],
  
  // Hash pour déduplication
  contentHash: {
    type: String,
    index: true
  }
}, { _id: false });

// Sous-schéma pour les versions de fichier (thumbnails, previews)
const fileVersionSchema = new Schema({
  type: {
    type: String,
    enum: ['thumbnail', 'preview', 'compressed', 'converted'],
    required: true
  },
  
  format: {
    type: String,
    required: true // ex: 'jpg', 'webp', 'mp4'
  },
  
  size: {
    type: Number,
    required: true,
    min: 0
  },
  
  dimensions: {
    width: Number,
    height: Number
  },
  
  quality: {
    type: Number,
    min: 0,
    max: 100
  },
  
  url: {
    type: String,
    required: true
  },
  
  path: {
    type: String,
    required: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Sous-schéma pour l'analyse de sécurité
const securityScanSchema = new Schema({
  isScanned: {
    type: Boolean,
    default: false
  },
  
  scannedAt: {
    type: Date
  },
  
  scanProvider: {
    type: String,
    enum: ['clamav', 'virustotal', 'custom']
  },
  
  isSafe: {
    type: Boolean,
    default: null
  },
  
  threats: [{
    type: {
      type: String,
      enum: ['virus', 'malware', 'trojan', 'suspicious']
    },
    name: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    description: String
  }],
  
  scanResults: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

const fileSchema = new Schema({
  // Informations de base
  originalName: {
    type: String,
    required: [true, 'Nom de fichier original requis'],
    trim: true,
    maxlength: [255, 'Nom de fichier trop long']
  },

  filename: {
    type: String,
    required: [true, 'Nom de fichier système requis'],
    unique: true,
    index: true
  },

  mimeType: {
    type: String,
    required: [true, 'Type MIME requis'],
    index: true
  },

  size: {
    type: Number,
    required: [true, 'Taille de fichier requise'],
    min: [1, 'Fichier vide non autorisé'],
    max: [100 * 1024 * 1024, 'Fichier trop volumineux (100MB max)'],
    index: true
  },

  category: {
    type: String,
    enum: ['image', 'document', 'video', 'audio', 'other'],
    required: true,
    index: true
  },

  extension: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },

  // Upload et stockage
  uploadedBy: {
    type: String, // userId du auth-users-service
    required: [true, 'Utilisateur uploadeur requis'],
    index: true
  },

  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  storageProvider: {
    type: String,
    enum: ['local', 's3', 'gcs', 'azure'],
    default: 'local',
    index: true
  },

  storagePath: {
    type: String,
    required: [true, 'Chemin de stockage requis']
  },

  storageUrl: {
    type: String,
    required: false // Peut être généré dynamiquement
  },

  // Relations
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: false, // Peut être null pour fichiers hors conversation
    index: true
  },

  messageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    required: false, // Peut être null pour fichiers standalone
    index: true
  },

  // Métadonnées
  metadata: {
    type: fileMetadataSchema,
    default: () => ({})
  },

  // Versions du fichier (thumbnails, previews)
  versions: [fileVersionSchema],

  // Sécurité
  security: {
    type: securityScanSchema,
    default: () => ({})
  },

  // État du fichier
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },

  processingError: {
    type: String,
    default: null
  },

  isPublic: {
    type: Boolean,
    default: false,
    index: true
  },

  // Partage et accès
  sharedWith: [{
    userId: {
      type: String, // userId du auth-users-service
      required: true
    },
    permission: {
      type: String,
      enum: ['read', 'write', 'admin'],
      default: 'read'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    },
    sharedBy: {
      type: String // userId du auth-users-service
    }
  }],

  // Statistiques d'utilisation
  stats: {
    downloadCount: {
      type: Number,
      default: 0,
      min: 0
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0
    },
    shareCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lastAccessed: {
      type: Date,
      default: Date.now
    }
  },

  // Rétention et expiration
  retentionPolicy: {
    type: String,
    enum: ['permanent', 'temporary', 'auto_delete'],
    default: 'permanent'
  },

  expiresAt: {
    type: Date,
    default: null,
    index: true
  },

  // Tags et labels
  tags: [String],

  description: {
    type: String,
    maxlength: [1000, 'Description trop longue'],
    trim: true,
    default: ''
  }
}, {
  ...baseOptions,
  collection: 'files'
});

// Appliquer le plugin de base
fileSchema.plugin(basePlugin);

// Index composites
fileSchema.index({ uploadedBy: 1, uploadedAt: -1 });
fileSchema.index({ conversationId: 1, uploadedAt: -1 });
fileSchema.index({ messageId: 1 });
fileSchema.index({ category: 1, mimeType: 1 });
fileSchema.index({ size: 1, category: 1 });
fileSchema.index({ processingStatus: 1, uploadedAt: -1 });
fileSchema.index({ 'security.isSafe': 1, processingStatus: 1 });
fileSchema.index({ expiresAt: 1 }, { sparse: true });
fileSchema.index({ 'metadata.contentHash': 1 }, { sparse: true });

// Index de recherche textuelle
fileSchema.index({
  originalName: 'text',
  description: 'text',
  tags: 'text'
});

// Index géospatial pour localisation
fileSchema.index({ 'metadata.location': '2dsphere' });

// Méthodes virtuelles
fileSchema.virtual('isImage').get(function() {
  return this.category === 'image';
});

fileSchema.virtual('isVideo').get(function() {
  return this.category === 'video';
});

fileSchema.virtual('isAudio').get(function() {
  return this.category === 'audio';
});

fileSchema.virtual('isDocument').get(function() {
  return this.category === 'document';
});

fileSchema.virtual('isMedia').get(function() {
  return ['image', 'video', 'audio'].includes(this.category);
});

fileSchema.virtual('humanReadableSize').get(function() {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = this.size;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
});

fileSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

fileSchema.virtual('hasThumbnail').get(function() {
  return this.versions.some(v => v.type === 'thumbnail');
});

fileSchema.virtual('isProcessed').get(function() {
  return this.processingStatus === 'completed';
});

// Méthodes d'instance
fileSchema.methods.addVersion = function(versionData) {
  this.versions.push({
    type: versionData.type,
    format: versionData.format,
    size: versionData.size,
    dimensions: versionData.dimensions,
    quality: versionData.quality,
    url: versionData.url,
    path: versionData.path
  });
  return this.save();
};

fileSchema.methods.getThumbnail = function() {
  return this.versions.find(v => v.type === 'thumbnail');
};

fileSchema.methods.getPreview = function() {
  return this.versions.find(v => v.type === 'preview');
};

fileSchema.methods.markAsProcessed = function() {
  this.processingStatus = 'completed';
  return this.save();
};

fileSchema.methods.markAsFailed = function(error) {
  this.processingStatus = 'failed';
  this.processingError = error;
  return this.save();
};

fileSchema.methods.incrementDownloadCount = function() {
  this.stats.downloadCount += 1;
  this.stats.lastAccessed = new Date();
  return this.save();
};

fileSchema.methods.incrementViewCount = function() {
  this.stats.viewCount += 1;
  this.stats.lastAccessed = new Date();
  return this.save();
};

fileSchema.methods.shareWith = function(userId, permission, sharedBy) {
  // Supprimer le partage existant
  this.sharedWith = this.sharedWith.filter(s => s.userId !== userId);
  
  // Ajouter le nouveau partage
  this.sharedWith.push({
    userId,
    permission,
    sharedBy,
    sharedAt: new Date()
  });
  
  this.stats.shareCount += 1;
  return this.save();
};

fileSchema.methods.unshareWith = function(userId) {
  const initialLength = this.sharedWith.length;
  this.sharedWith = this.sharedWith.filter(s => s.userId !== userId);
  
  if (this.sharedWith.length < initialLength) {
    return this.save();
  }
  
  return Promise.resolve(this);
};

fileSchema.methods.isSharedWith = function(userId) {
  return this.sharedWith.some(s => s.userId === userId);
};

fileSchema.methods.getPermissionFor = function(userId) {
  if (this.uploadedBy === userId) return 'admin';
  
  const share = this.sharedWith.find(s => s.userId === userId);
  return share ? share.permission : null;
};

fileSchema.methods.markAsSafe = function(scanProvider, scanResults = {}) {
  this.security.isScanned = true;
  this.security.scannedAt = new Date();
  this.security.scanProvider = scanProvider;
  this.security.isSafe = true;
  this.security.threats = [];
  this.security.scanResults = scanResults;
  return this.save();
};

fileSchema.methods.markAsUnsafe = function(threats, scanProvider, scanResults = {}) {
  this.security.isScanned = true;
  this.security.scannedAt = new Date();
  this.security.scanProvider = scanProvider;
  this.security.isSafe = false;
  this.security.threats = threats;
  this.security.scanResults = scanResults;
  this.status = 'inactive'; // Désactiver le fichier
  return this.save();
};

fileSchema.methods.setExpiration = function(expirationDate) {
  this.expiresAt = expirationDate;
  this.retentionPolicy = 'temporary';
  return this.save();
};

fileSchema.methods.makePublic = function() {
  this.isPublic = true;
  return this.save();
};

fileSchema.methods.makePrivate = function() {
  this.isPublic = false;
  return this.save();
};

// Méthodes statiques
fileSchema.statics.findByUploader = function(uploadedBy, options = {}) {
  const query = { uploadedBy, status: { $ne: 'deleted' } };
  
  if (options.category) {
    query.category = options.category;
  }
  
  let findQuery = this.find(query);
  
  if (options.populate) {
    findQuery = findQuery.populate(options.populate);
  }
  
  return findQuery.sort({ uploadedAt: -1 });
};

fileSchema.statics.findByConversation = function(conversationId, options = {}) {
  return this.find({
    conversationId,
    status: { $ne: 'deleted' }
  })
  .sort({ uploadedAt: -1 })
  .limit(options.limit || 50);
};

fileSchema.statics.findByMessage = function(messageId) {
  return this.findOne({
    messageId,
    status: { $ne: 'deleted' }
  });
};

fileSchema.statics.findByCategory = function(category, options = {}) {
  return this.find({
    category,
    status: { $ne: 'deleted' }
  })
  .sort({ uploadedAt: -1 })
  .limit(options.limit || 100);
};

fileSchema.statics.findExpiredFiles = function() {
  return this.find({
    expiresAt: { $lt: new Date() },
    status: { $ne: 'deleted' }
  });
};

fileSchema.statics.findUnscannedFiles = function() {
  return this.find({
    'security.isScanned': false,
    status: 'active'
  })
  .sort({ uploadedAt: 1 });
};

fileSchema.statics.findPendingProcessing = function() {
  return this.find({
    processingStatus: 'pending',
    status: 'active'
  })
  .sort({ uploadedAt: 1 });
};

fileSchema.statics.findByContentHash = function(contentHash) {
  return this.findOne({
    'metadata.contentHash': contentHash,
    status: { $ne: 'deleted' }
  });
};

fileSchema.statics.searchFiles = function(query, uploadedBy, options = {}) {
  const searchQuery = {
    $and: [
      uploadedBy ? { uploadedBy } : {},
      { status: { $ne: 'deleted' } },
      { $text: { $search: query } }
    ]
  };
  
  return this.find(searchQuery, {
    score: { $meta: 'textScore' }
  })
  .sort({ score: { $meta: 'textScore' } })
  .limit(options.limit || 20);
};

fileSchema.statics.getStorageStats = function(uploadedBy) {
  return this.aggregate([
    {
      $match: {
        uploadedBy,
        status: { $ne: 'deleted' }
      }
    },
    {
      $group: {
        _id: '$category',
        totalSize: { $sum: '$size' },
        count: { $sum: 1 }
      }
    }
  ]);
};

fileSchema.statics.getTotalStorageUsed = function(uploadedBy) {
  return this.aggregate([
    {
      $match: {
        uploadedBy,
        status: { $ne: 'deleted' }
      }
    },
    {
      $group: {
        _id: null,
        totalSize: { $sum: '$size' },
        totalFiles: { $sum: 1 }
      }
    }
  ]);
};

// Hooks
fileSchema.pre('save', function(next) {
  // Déterminer la catégorie basée sur le mimeType
  if (this.isNew && !this.category) {
    if (this.mimeType.startsWith('image/')) {
      this.category = 'image';
    } else if (this.mimeType.startsWith('video/')) {
      this.category = 'video';
    } else if (this.mimeType.startsWith('audio/')) {
      this.category = 'audio';
    } else if (this.mimeType.includes('pdf') || this.mimeType.includes('document') || this.mimeType.includes('text')) {
      this.category = 'document';
    } else {
      this.category = 'other';
    }
  }
  
  // Extraire l'extension du nom original
  if (this.isNew && !this.extension) {
    const match = this.originalName.match(/\.([^.]+)$/);
    this.extension = match ? match[1].toLowerCase() : '';
  }
  
  next();
});

fileSchema.pre('remove', function(next) {
  // TODO: Supprimer les fichiers physiques et versions
  next();
});

module.exports = mongoose.model('File', fileSchema);
