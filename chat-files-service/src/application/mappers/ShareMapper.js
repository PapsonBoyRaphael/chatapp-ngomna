/**
 * Mapper: Partages
 * CENADI Chat-Files-Service
 */

const BaseMapper = require('./BaseMapper');

class ShareMapper extends BaseMapper {
  constructor() {
    super();
  }

  // Mapper entité vers DTO
  mapToDto(share, options = {}) {
    const context = this.mapWithContext(share, options);
    
    const dto = {
      id: share.id,
      fileId: share.fileId,
      shareType: share.shareType,
      title: share.title,
      description: share.description,
      permissions: share.permissions || [],
      isActive: share.isActive !== undefined ? share.isActive : true,
      
      // Dates
      createdAt: share.createdAt ? share.createdAt.toISOString() : null,
      expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
      
      // État d'expiration
      isExpired: share.expiresAt ? new Date() > new Date(share.expiresAt) : false
    };

    // URLs de partage selon le type
    this.addShareUrls(dto, share, context);

    // Limites
    if (share.maxDownloads || share.maxViews) {
      dto.limits = {
        maxDownloads: share.maxDownloads,
        maxViews: share.maxViews,
        remainingDownloads: this.calculateRemaining(share.maxDownloads, share.stats?.downloadCount),
        remainingViews: this.calculateRemaining(share.maxViews, share.stats?.viewCount)
      };
    }

    // Statistiques
    if (context.includeStats || context.isOwner || context.isAdmin) {
      dto.stats = this.mapShareStats(share.stats, context);
    }

    // Informations du fichier (si incluses)
    if (options.includeFile && share.file) {
      dto.file = this.mapSharedFile(share.file, context);
    }

    // Informations propriétaire
    if (context.includeRelated || context.isOwner || context.isAdmin) {
      dto.sharedBy = share.sharedBy;
      dto.conversationId = share.conversationId;
      dto.recipients = share.recipients;
    }

    // Code de partage (propriétaire seulement)
    if (context.isOwner && share.shareCode) {
      dto.shareCode = share.shareCode;
    }

    return dto;
  }

  // Mapper DTO vers entité
  mapToEntity(dto, options = {}) {
    return {
      id: dto.id,
      fileId: dto.fileId,
      sharedBy: dto.sharedBy,
      shareType: dto.shareType,
      title: dto.title,
      description: dto.description,
      permissions: dto.permissions || ['view'],
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      maxDownloads: dto.maxDownloads,
      maxViews: dto.maxViews,
      shareCode: dto.shareCode,
      conversationId: dto.conversationId,
      recipients: dto.recipients,
      createdAt: dto.createdAt ? new Date(dto.createdAt) : new Date(),
      updatedAt: new Date()
    };
  }

  // Méthodes utilitaires

  addShareUrls(dto, share, context) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    switch (share.shareType) {
      case 'public':
        dto.shareUrl = `${baseUrl}/share/public/${share.id}`;
        dto.embedUrl = `${baseUrl}/embed/${share.id}`;
        break;

      case 'private':
        if (context.isOwner && share.shareCode) {
          dto.shareUrl = `${baseUrl}/share/private/${share.id}/${share.shareCode}`;
        } else {
          dto.shareUrl = `${baseUrl}/share/private/${share.id}/[CODE_REQUIRED]`;
        }
        break;

      case 'direct':
        if (context.isOwner && share.individualUrls) {
          dto.individualUrls = share.individualUrls;
        }
        dto.shareUrl = `${baseUrl}/share/direct/${share.id}`;
        break;

      case 'conversation':
        dto.shareUrl = `${baseUrl}/conversation/${share.conversationId}/file/${share.fileId}`;
        break;
    }

    // QR Code URL
    if (dto.shareUrl && !dto.shareUrl.includes('[CODE_REQUIRED]')) {
      dto.qrCodeUrl = `${baseUrl}/api/qr?url=${encodeURIComponent(dto.shareUrl)}`;
    }
  }

  calculateRemaining(max, used) {
    if (!max) return null;
    return Math.max(0, max - (used || 0));
  }

  mapShareStats(stats, context) {
    if (!stats) {
      return {
        viewCount: 0,
        downloadCount: 0,
        uniqueViewers: 0
      };
    }

    const mapped = {
      viewCount: stats.viewCount || 0,
      downloadCount: stats.downloadCount || 0,
      uniqueViewers: stats.uniqueViewers ? stats.uniqueViewers.length : 0,
      lastAccess: stats.lastAccess ? stats.lastAccess.toISOString() : null
    };

    // Détails des accès (propriétaire/admin)
    if ((context.isOwner || context.isAdmin) && stats.accessLog) {
      mapped.recentAccess = stats.accessLog.slice(-10).map(access => ({
        timestamp: access.timestamp.toISOString(),
        ipAddress: access.ipAddress,
        userAgent: access.userAgent ? access.userAgent.substring(0, 100) : null,
        action: access.action
      }));
    }

    return mapped;
  }

  mapSharedFile(file, context) {
    // Version minimale des informations du fichier pour le partage
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      formattedSize: this.formatFileSize(file.size),
      category: file.category,
      thumbnail: this.getThumbnailUrl(file.versions),
      preview: this.getPreviewUrl(file.versions)
    };
  }

  // Versions spécialisées

  toPublicDto(share) {
    // Version publique pour l'accès anonyme
    return {
      id: share.id,
      title: share.title,
      description: share.description,
      permissions: share.permissions || [],
      isExpired: share.expiresAt ? new Date() > new Date(share.expiresAt) : false,
      file: share.file ? {
        originalName: share.file.originalName,
        mimeType: share.file.mimeType,
        size: share.file.size,
        formattedSize: this.formatFileSize(share.file.size),
        category: share.file.category
      } : null
    };
  }

  toListDto(share, options = {}) {
    return {
      id: share.id,
      fileId: share.fileId,
      title: share.title,
      shareType: share.shareType,
      isActive: share.isActive,
      createdAt: share.createdAt ? share.createdAt.toISOString() : null,
      expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
      isExpired: share.expiresAt ? new Date() > new Date(share.expiresAt) : false,
      stats: {
        viewCount: share.stats?.viewCount || 0,
        downloadCount: share.stats?.downloadCount || 0
      },
      file: options.includeFile && share.file ? {
        originalName: share.file.originalName,
        category: share.file.category,
        thumbnail: this.getThumbnailUrl(share.file.versions)
      } : null
    };
  }

  toStatsDto(share) {
    return {
      id: share.id,
      title: share.title,
      shareType: share.shareType,
      stats: this.mapShareStats(share.stats, { includeStats: true, isOwner: true }),
      activity: {
        createdAt: share.createdAt ? share.createdAt.toISOString() : null,
        expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
        isExpired: share.expiresAt ? new Date() > new Date(share.expiresAt) : false
      }
    };
  }

  // Utilitaires pour les URLs

  getThumbnailUrl(versions) {
    if (!versions || versions.length === 0) return null;
    const thumbnail = versions.find(v => v.type === 'thumbnail');
    return thumbnail ? this.generateSecureUrl(thumbnail.storageKey || thumbnail.url) : null;
  }

  getPreviewUrl(versions) {
    if (!versions || versions.length === 0) return null;
    const preview = versions.find(v => v.type === 'preview');
    return preview ? this.generateSecureUrl(preview.storageKey || preview.url) : null;
  }
}

module.exports = ShareMapper;
