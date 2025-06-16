/**
 * File Serializer - Chat Files Service
 * CENADI Chat-Files-Service
 * Formatage des réponses pour les fichiers de messagerie
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('FileSerializer');

class FileSerializer {
  constructor(options = {}) {
    this.options = {
      // URLs de base
      baseUrl: options.baseUrl || process.env.BASE_URL || 'http://localhost:3000',
      apiVersion: options.apiVersion || 'v1',
      
      // Formatage
      includeMetadata: options.includeMetadata !== false,
      includeUrls: options.includeUrls !== false,
      includeThumbnails: options.includeThumbnails !== false,
      
      // Sécurité
      hideSystemFields: options.hideSystemFields !== false,
      sanitizeFilenames: options.sanitizeFilenames !== false,
      
      ...options
    };

    logger.debug('📦 FileSerializer créé pour messagerie');
  }

  // Sérialiser un fichier unique
  serialize(file, context = {}) {
    if (!file) return null;

    try {
      const serialized = {
        fileId: file._id || file.fileId,
        originalName: this.sanitizeFilename(file.originalName),
        displayName: file.displayName || this.sanitizeFilename(file.originalName),
        size: file.size,
        type: file.mimetype || file.type,
        category: this.categorizeFile(file.mimetype || file.type),
        uploadedAt: file.createdAt || file.uploadedAt,
        chatId: file.chatId
      };

      // Ajouter les métadonnées si demandées
      if (this.options.includeMetadata && context.includeMetadata !== false) {
        serialized.metadata = this.serializeMetadata(file, context);
      }

      // Ajouter les URLs si demandées
      if (this.options.includeUrls && context.includeUrls !== false) {
        serialized.urls = this.generateUrls(file, context);
      }

      // Ajouter les thumbnails pour les images/vidéos
      if (this.options.includeThumbnails && this.supportsThumbnails(file.mimetype)) {
        serialized.thumbnails = this.generateThumbnailUrls(file, context);
      }

      // Informations d'accès (selon le contexte utilisateur)
      if (context.user) {
        serialized.access = this.serializeAccess(file, context);
      }

      // Tags et description si présents
      if (file.tags && file.tags.length > 0) {
        serialized.tags = file.tags;
      }

      if (file.description) {
        serialized.description = file.description;
      }

      return serialized;

    } catch (error) {
      logger.error('❌ Erreur sérialisation fichier:', {
        fileId: file._id || file.fileId,
        error: error.message
      });
      return null;
    }
  }

  // Sérialiser une liste de fichiers
  serializeList(files, context = {}) {
    if (!Array.isArray(files)) {
      return [];
    }

    return files
      .map(file => this.serialize(file, context))
      .filter(serialized => serialized !== null);
  }

  // Sérialiser avec pagination
  serializeWithPagination(files, pagination, context = {}) {
    return {
      files: this.serializeList(files, context),
      pagination: {
        total: pagination.total || 0,
        limit: pagination.limit || 20,
        offset: pagination.offset || 0,
        hasMore: pagination.hasMore || false,
        nextOffset: pagination.nextOffset || null
      }
    };
  }

  // Sérialiser les métadonnées
  serializeMetadata(file, context) {
    const metadata = {
      uploadedBy: file.uploadedBy,
      lastModified: file.updatedAt || file.lastModified,
      isPrivate: file.isPrivate || false,
      shareCount: file.shareCount || 0,
      downloadCount: file.downloadCount || 0
    };

    // Ajouter les métadonnées spécifiques au type
    if (file.metadata) {
      // Métadonnées d'image
      if (file.metadata.width && file.metadata.height) {
        metadata.dimensions = {
          width: file.metadata.width,
          height: file.metadata.height
        };
      }

      // Durée pour vidéo/audio
      if (file.metadata.duration) {
        metadata.duration = file.metadata.duration;
      }

      // Pages pour documents
      if (file.metadata.pages) {
        metadata.pages = file.metadata.pages;
      }

      // Métadonnées personnalisées (sans les champs système)
      if (file.metadata.custom && !this.options.hideSystemFields) {
        metadata.custom = file.metadata.custom;
      }
    }

    return metadata;
  }

  // Générer les URLs d'accès
  generateUrls(file, context) {
    const baseUrl = `${this.options.baseUrl}/api/${this.options.apiVersion}`;
    const fileId = file._id || file.fileId;

    const urls = {
      view: `${baseUrl}/files/${fileId}`,
      download: `${baseUrl}/files/${fileId}/download`,
      metadata: `${baseUrl}/files/${fileId}?metadata=true`
    };

    // URL de streaming pour vidéos/audio
    if (this.supportsStreaming(file.mimetype)) {
      urls.stream = `${baseUrl}/files/${fileId}?stream=true`;
    }

    // URL de partage (si l'utilisateur peut partager)
    if (context.user && this.canShare(file, context.user)) {
      urls.share = `${baseUrl}/files/${fileId}/share`;
    }

    return urls;
  }

  // Générer les URLs de thumbnails
  generateThumbnailUrls(file, context) {
    const baseUrl = `${this.options.baseUrl}/api/${this.options.apiVersion}`;
    const fileId = file._id || file.fileId;

    return {
      small: `${baseUrl}/files/${fileId}?thumbnail=true&size=small`,
      medium: `${baseUrl}/files/${fileId}?thumbnail=true&size=medium`,
      large: `${baseUrl}/files/${fileId}?thumbnail=true&size=large`
    };
  }

  // Sérialiser les informations d'accès
  serializeAccess(file, context) {
    const user = context.user;
    
    return {
      canView: this.canView(file, user),
      canDownload: this.canDownload(file, user),
      canShare: this.canShare(file, user),
      canEdit: this.canEdit(file, user),
      canDelete: this.canDelete(file, user),
      reason: this.getAccessReason(file, user)
    };
  }

  // Sérialiser pour upload response
  serializeUploadResponse(files, context = {}) {
    const uploadedFiles = this.serializeList(files, context);
    
    return {
      message: `${uploadedFiles.length} fichier(s) uploadé(s) avec succès`,
      files: uploadedFiles,
      summary: {
        totalFiles: uploadedFiles.length,
        totalSize: uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
        types: this.getTypeSummary(uploadedFiles)
      },
      uploadedAt: new Date().toISOString(),
      uploadedBy: context.user?.id
    };
  }

  // Sérialiser pour partage
  serializeShareResponse(shareData, file, context = {}) {
    return {
      shareToken: shareData.token,
      shareUrl: `${this.options.baseUrl}/api/${this.options.apiVersion}/files/shared/${shareData.token}`,
      file: this.serialize(file, { ...context, includeUrls: false }),
      settings: {
        expiresAt: shareData.expiresAt,
        maxDownloads: shareData.maxDownloads,
        requireAuth: shareData.requireAuth
      },
      sharedBy: context.user?.id,
      createdAt: shareData.createdAt || new Date().toISOString()
    };
  }

  // Utilitaires
  categorizeFile(mimetype) {
    if (!mimetype) return 'unknown';
    
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.includes('pdf')) return 'document';
    if (mimetype.includes('text/')) return 'text';
    if (mimetype.includes('zip') || mimetype.includes('archive')) return 'archive';
    
    return 'document';
  }

  supportsThumbnails(mimetype) {
    return mimetype && (
      mimetype.startsWith('image/') || 
      mimetype.startsWith('video/') ||
      mimetype.includes('pdf')
    );
  }

  supportsStreaming(mimetype) {
    return mimetype && (
      mimetype.startsWith('video/') || 
      mimetype.startsWith('audio/')
    );
  }

  sanitizeFilename(filename) {
    if (!this.options.sanitizeFilenames) return filename;
    
    // Enlever les caractères dangereux
    return filename
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\.\./g, '_')
      .substring(0, 255);
  }

  // Contrôles d'accès (simplifié car tous agents publics)
  canView(file, user) {
    // Tous les agents peuvent voir les fichiers des chats auxquels ils ont accès
    return true; // TODO: Vérifier via visibility-service
  }

  canDownload(file, user) {
    return this.canView(file, user);
  }

  canShare(file, user) {
    // Tous les agents peuvent partager
    return user && user.role === 'agent';
  }

  canEdit(file, user) {
    // Seul le propriétaire peut éditer les métadonnées
    return user && file.uploadedBy === user.id;
  }

  canDelete(file, user) {
    // Seul le propriétaire peut supprimer
    return user && file.uploadedBy === user.id;
  }

  getAccessReason(file, user) {
    if (!user) return 'Non authentifié';
    if (file.uploadedBy === user.id) return 'Propriétaire';
    return 'Agent autorisé';
  }

  getTypeSummary(files) {
    const summary = {};
    files.forEach(file => {
      const category = file.category || 'unknown';
      summary[category] = (summary[category] || 0) + 1;
    });
    return summary;
  }

  // Formats de réponse spécialisés
  serializeForChat(files, chatId, context = {}) {
    return {
      chatId,
      files: this.serializeList(files, context),
      summary: {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
        byType: this.getTypeSummary(this.serializeList(files, context))
      }
    };
  }

  serializeStats(stats, context = {}) {
    return {
      storage: {
        used: stats.totalSize || 0,
        quota: context.user?.quota || 5368709120, // 5GB défaut
        filesCount: stats.totalFiles || 0,
        utilizationPercent: Math.round(((stats.totalSize || 0) / (context.user?.quota || 5368709120)) * 100)
      },
      breakdown: stats.breakdown || {
        images: { count: 0, size: 0 },
        videos: { count: 0, size: 0 },
        documents: { count: 0, size: 0 },
        others: { count: 0, size: 0 }
      },
      activity: stats.activity || {
        uploadsThisMonth: 0,
        downloadsThisMonth: 0,
        sharesThisMonth: 0
      },
      generatedAt: new Date().toISOString()
    };
  }
}

module.exports = FileSerializer;
