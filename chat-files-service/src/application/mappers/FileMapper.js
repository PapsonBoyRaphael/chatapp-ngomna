/**
 * Mapper: Fichiers
 * CENADI Chat-Files-Service
 */

const BaseMapper = require('./BaseMapper');

class FileMapper extends BaseMapper {
  constructor() {
    super();
  }

  // Mapper entité vers DTO complet
  mapToDto(file, options = {}) {
    const context = this.mapWithContext(file, options);
    
    // Mapping de base (toujours inclus)
    const dto = {
      id: file.id,
      originalName: file.originalName,
      fileName: file.fileName || file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      formattedSize: this.formatFileSize(file.size),
      category: file.category,
      extension: file.extension,
      status: file.status,
      
      // Dates
      uploadedAt: file.uploadedAt ? file.uploadedAt.toISOString() : null,
      updatedAt: file.updatedAt ? file.updatedAt.toISOString() : null,
      
      // Traitement
      processingStatus: file.processingStatus || 'completed',
      processingProgress: file.processingProgress || 100
    };

    // URLs publiques
    if (file.storageUrl || file.storagePath) {
      dto.downloadUrl = this.generateSecureUrl(file.storagePath || file.storageUrl);
    }

    // Versions (thumbnails, previews, etc.)
    if (file.versions && file.versions.length > 0) {
      dto.versions = this.mapVersions(file.versions, context);
    }

    // Métadonnées conditionnelles
    if (context.includeMetadata || context.isOwner || context.isAdmin) {
      dto.metadata = this.mapMetadata(file.metadata, context);
    }

    // Statistiques conditionnelles
    if (context.includeStats || context.isOwner || context.isAdmin) {
      dto.stats = this.mapStats(file.stats, context);
    }

    // Informations de propriétaire
    if (context.includeRelated || context.isOwner || context.isAdmin) {
      dto.uploadedBy = file.uploadedBy;
      dto.conversationId = file.conversationId;
      dto.messageId = file.messageId;
    }

    // Permissions (si disponibles)
    if (context.includePermissions && options.permissions) {
      dto.permissions = options.permissions;
    }

    // Informations de sécurité (propriétaire/admin seulement)
    if ((context.isOwner || context.isAdmin) && file.security) {
      dto.security = this.mapSecurity(file.security, context);
    }

    // Informations administratives
    if (context.isAdmin) {
      dto.admin = {
        storageProvider: file.storageProvider,
        storagePath: file.storagePath,
        deletedAt: file.deletedAt ? file.deletedAt.toISOString() : null,
        deletedBy: file.deletedBy,
        expiresAt: file.expiresAt ? file.expiresAt.toISOString() : null
      };
    }

    // Description et tags (si disponibles)
    if (file.description) {
      dto.description = file.description;
    }

    if (file.tags && file.tags.length > 0) {
      dto.tags = file.tags;
    }

    if (file.isPublic !== undefined) {
      dto.isPublic = file.isPublic;
    }

    return dto;
  }

  // Mapper DTO vers entité
  mapToEntity(dto, options = {}) {
    const entity = {
      originalName: dto.originalName,
      fileName: dto.fileName || dto.originalName,
      mimeType: dto.mimeType,
      size: dto.size,
      category: dto.category,
      extension: dto.extension,
      
      // Relations
      uploadedBy: dto.uploadedBy,
      conversationId: dto.conversationId || null,
      messageId: dto.messageId || null,
      
      // État
      status: dto.status || 'active',
      processingStatus: dto.processingStatus || 'pending',
      
      // Métadonnées
      metadata: dto.metadata || {},
      
      // Description et tags
      description: dto.description || null,
      tags: dto.tags || [],
      isPublic: dto.isPublic || false,
      
      // Dates
      uploadedAt: dto.uploadedAt ? new Date(dto.uploadedAt) : new Date(),
      updatedAt: new Date()
    };

    // Champs optionnels pour la création
    if (dto.id) entity.id = dto.id;
    if (dto.storageProvider) entity.storageProvider = dto.storageProvider;
    if (dto.storagePath) entity.storagePath = dto.storagePath;
    if (dto.storageUrl) entity.storageUrl = dto.storageUrl;
    if (dto.versions) entity.versions = dto.versions;
    if (dto.security) entity.security = dto.security;
    if (dto.expiresAt) entity.expiresAt = new Date(dto.expiresAt);

    return entity;
  }

  // Mapper spécialisés

  mapVersions(versions, context) {
    return versions.map(version => ({
      type: version.type,
      mimeType: version.mimeType,
      size: version.size,
      formattedSize: this.formatFileSize(version.size),
      url: this.generateSecureUrl(version.storageKey || version.url),
      width: version.width,
      height: version.height,
      duration: version.duration ? this.formatDuration(version.duration) : null,
      bitrate: version.bitrate,
      isAvailable: true
    }));
  }

  mapMetadata(metadata, context) {
    if (!metadata) return {};

    const mapped = {
      contentHash: metadata.contentHash,
      uploadMethod: metadata.uploadMethod || 'api'
    };

    // Métadonnées spécifiques par type
    if (metadata.image) {
      mapped.image = {
        width: metadata.image.width,
        height: metadata.image.height,
        format: metadata.image.format,
        colorSpace: metadata.image.colorSpace,
        hasAlpha: metadata.image.hasAlpha
      };
    }

    if (metadata.video) {
      mapped.video = {
        duration: this.formatDuration(metadata.video.duration),
        width: metadata.video.width,
        height: metadata.video.height,
        frameRate: metadata.video.frameRate,
        bitrate: metadata.video.bitrate,
        codec: metadata.video.codec
      };
    }

    if (metadata.document) {
      mapped.document = {
        pageCount: metadata.document.pageCount,
        title: metadata.document.title,
        author: metadata.document.author,
        subject: metadata.document.subject,
        keywords: metadata.document.keywords
      };
    }

    if (metadata.audio) {
      mapped.audio = {
        duration: this.formatDuration(metadata.audio.duration),
        bitrate: metadata.audio.bitrate,
        sampleRate: metadata.audio.sampleRate,
        channels: metadata.audio.channels,
        codec: metadata.audio.codec
      };
    }

    // Informations techniques (propriétaire/admin seulement)
    if (context.isOwner || context.isAdmin) {
      mapped.technical = {
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        processingLogs: metadata.processingLogs
      };
    }

    return mapped;
  }

  mapStats(stats, context) {
    if (!stats) {
      return {
        downloadCount: 0,
        viewCount: 0,
        shareCount: 0
      };
    }

    const mapped = {
      downloadCount: stats.downloadCount || 0,
      viewCount: stats.viewCount || 0,
      shareCount: stats.shareCount || 0
    };

    // Statistiques détaillées (propriétaire/admin seulement)
    if ((context.isOwner || context.isAdmin) && stats.lastAccessed) {
      mapped.lastAccessed = stats.lastAccessed.toISOString();
    }

    return mapped;
  }

  mapSecurity(security, context) {
    if (!security) return {};

    const mapped = {
      isScanned: security.isScanned || false,
      isSafe: security.isSafe
    };

    // Détails des menaces (propriétaire/admin seulement)
    if (context.isOwner || context.isAdmin) {
      mapped.threats = security.threats || [];
      mapped.scanProvider = security.scanProvider;
      mapped.scannedAt = security.scannedAt ? security.scannedAt.toISOString() : null;
    }

    return mapped;
  }

  // Mappers spécialisés pour différents contextes

  toListDto(file, options = {}) {
    // Version allégée pour les listes
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      formattedSize: this.formatFileSize(file.size),
      category: file.category,
      uploadedAt: file.uploadedAt ? file.uploadedAt.toISOString() : null,
      processingStatus: file.processingStatus || 'completed',
      
      // Thumbnail si disponible
      thumbnail: this.getThumbnailUrl(file.versions),
      
      // Permissions si fournies
      permissions: options.permissions || null
    };
  }

  toDownloadDto(file, downloadUrl, options = {}) {
    return {
      id: file.id,
      originalName: file.originalName,
      fileName: file.fileName || file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      formattedSize: this.formatFileSize(file.size),
      downloadUrl,
      expiresAt: options.expiresAt,
      disposition: options.disposition || 'attachment'
    };
  }

  toSearchDto(file, searchScore = 0) {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      formattedSize: this.formatFileSize(file.size),
      category: file.category,
      uploadedAt: file.uploadedAt ? file.uploadedAt.toISOString() : null,
      thumbnail: this.getThumbnailUrl(file.versions),
      searchScore,
      
      // Highlights pour la recherche
      highlights: {
        name: file.originalName,
        description: file.description
      }
    };
  }

  // Utilitaires

  getThumbnailUrl(versions) {
    if (!versions || versions.length === 0) {
      return null;
    }

    const thumbnail = versions.find(v => v.type === 'thumbnail');
    return thumbnail ? this.generateSecureUrl(thumbnail.storageKey || thumbnail.url) : null;
  }

  getPreviewUrl(versions) {
    if (!versions || versions.length === 0) {
      return null;
    }

    const preview = versions.find(v => v.type === 'preview');
    return preview ? this.generateSecureUrl(preview.storageKey || preview.url) : null;
  }

  // Mapper pour différents formats d'export

  toJsonExport(file) {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      category: file.category,
      uploadedAt: file.uploadedAt ? file.uploadedAt.toISOString() : null,
      metadata: file.metadata,
      stats: file.stats
    };
  }

  toCsvRow(file) {
    return [
      file.id,
      file.originalName,
      file.mimeType,
      file.size,
      file.category,
      file.uploadedAt ? file.uploadedAt.toISOString() : '',
      file.stats?.downloadCount || 0,
      file.stats?.viewCount || 0
    ];
  }

  static getCsvHeaders() {
    return [
      'ID',
      'Nom',
      'Type MIME',
      'Taille',
      'Catégorie',
      'Date Upload',
      'Téléchargements',
      'Vues'
    ];
  }
}

module.exports = FileMapper;
