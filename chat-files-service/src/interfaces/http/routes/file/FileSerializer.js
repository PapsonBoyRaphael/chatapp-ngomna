/**
 * File Serializer - Chat Files Service
 * CENADI Chat-Files-Service
 * Sérialisation des données de fichiers
 */

const BaseSerializer = require('../base/BaseSerializer');
const { createLogger } = require('../../../../shared/utils/logger');

const logger = createLogger('FileSerializer');

class FileSerializer extends BaseSerializer {
  constructor(options = {}) {
    super(options);
    
    this.fileOptions = {
      // URLs
      includeUrls: options.includeUrls !== false,
      includeThumbnails: options.includeThumbnails !== false,
      includeDownloadUrls: options.includeDownloadUrls !== false,
      
      // Métadonnées
      includeUploader: options.includeUploader !== false,
      includeExif: options.includeExif || false,
      includeVirusScan: options.includeVirusScan || false,
      
      // Sécurité
      hideInternalPaths: options.hideInternalPaths !== false,
      showPrivateFiles: options.showPrivateFiles || false,
      
      ...options
    };

    logger.debug('📄 FileSerializer créé');
  }

  // Sérialiser un fichier
  serializeObject(file, context = {}) {
    if (!this.validateData(file)) {
      return null;
    }

    // Structure de base du fichier
    const serialized = {
      id: file.id || file._id,
      filename: file.filename || file.originalName,
      originalName: file.originalName,
      size: file.size,
      formattedSize: this.formatFileSize(file.size),
      mimeType: file.mimeType || file.mimetype,
      type: this.getFileType(file.mimeType || file.mimetype),
      extension: this.getFileExtension(file.filename || file.originalName)
    };

    // Métadonnées de base
    if (this.options.includeTimestamps) {
      serialized.createdAt = this.formatDate(file.createdAt);
      serialized.updatedAt = this.formatDate(file.updatedAt);
    }

    // Informations d'upload
    if (this.fileOptions.includeUploader && file.uploadedBy) {
      serialized.uploadedBy = this.serializeUploader(file.uploadedBy, context);
    }

    // Chat association
    if (file.chatId) {
      serialized.chat = {
        id: file.chatId,
        name: file.chatName || null
      };
    }

    // Message association
    if (file.messageId) {
      serialized.messageId = file.messageId;
    }

    // Statut et visibilité
    serialized.status = file.status || 'active';
    serialized.isPrivate = file.isPrivate || false;

    // URLs si demandées
    if (this.fileOptions.includeUrls) {
      serialized.urls = this.generateFileUrls(file, context);
    }

    // Thumbnails pour images/vidéos
    if (this.fileOptions.includeThumbnails && this.supportsThumbnails(file.mimeType)) {
      serialized.thumbnails = this.generateThumbnailUrls(file, context);
    }

    // Métadonnées étendues
    if (file.metadata) {
      serialized.metadata = this.serializeMetadata(file.metadata, context);
    }

    // Tags
    if (file.tags && file.tags.length > 0) {
      serialized.tags = file.tags;
    }

    // Description
    if (file.description) {
      serialized.description = this.sanitizeHtml(file.description);
    }

    // Informations d'accès
    serialized.access = this.serializeAccessInfo(file, context);

    // Statistiques
    if (file.downloadCount !== undefined) {
      serialized.stats = {
        downloads: file.downloadCount,
        views: file.viewCount || 0,
        shares: file.shareCount || 0
      };
    }

    // EXIF pour images
    if (this.fileOptions.includeExif && file.exif && this.isImage(file.mimeType)) {
      serialized.exif = this.serializeExif(file.exif);
    }

    // Scan antivirus
    if (this.fileOptions.includeVirusScan && file.virusScan) {
      serialized.virusScan = {
        status: file.virusScan.status,
        scannedAt: this.formatDate(file.virusScan.scannedAt),
        engine: file.virusScan.engine
      };
    }

    // Partages actifs
    if (file.shares && file.shares.length > 0) {
      serialized.activeShares = file.shares.filter(share => 
        !share.expiresAt || new Date(share.expiresAt) > new Date()
      ).length;
    }

    // Liens HATEOAS
    const links = this.generateLinks(file, context);
    return this.addLinks(serialized, links, context);
  }

  // Sérialiser les informations d'uploader
  serializeUploader(uploader, context) {
    return {
      userId: uploader.userId || uploader.id,
      username: uploader.username,
      role: uploader.role,
      avatar: uploader.avatar ? this.formatUrl(`/users/${uploader.userId}/avatar`, context) : null
    };
  }

  // Générer les URLs de fichier
  generateFileUrls(file, context) {
    const fileId = file.id || file._id;
    
    const urls = {
      view: this.formatUrl(`/files/${fileId}`, context),
      metadata: this.formatUrl(`/files/${fileId}`, context)
    };

    if (this.fileOptions.includeDownloadUrls) {
      urls.download = this.formatUrl(`/files/${fileId}/download`, context);
      urls.stream = this.formatUrl(`/files/${fileId}?stream=true`, context);
    }

    // URL de partage si le fichier peut être partagé
    if (this.canShare(file, context)) {
      urls.share = this.formatUrl(`/files/${fileId}/share`, context);
    }

    return urls;
  }

  // Générer les URLs de thumbnails
  generateThumbnailUrls(file, context) {
    const fileId = file.id || file._id;
    
    return {
      small: this.formatUrl(`/files/${fileId}?thumbnail=true&size=small`, context),
      medium: this.formatUrl(`/files/${fileId}?thumbnail=true&size=medium`, context),
      large: this.formatUrl(`/files/${fileId}?thumbnail=true&size=large`, context)
    };
  }

  // Sérialiser les métadonnées
  serializeMetadata(metadata, context) {
    const cleaned = { ...metadata };
    
    // Cacher les chemins internes
    if (this.fileOptions.hideInternalPaths) {
      delete cleaned.path;
      delete cleaned.storagePath;
      delete cleaned.internalId;
    }

    // Ajouter des métadonnées calculées
    if (metadata.dimensions) {
      cleaned.dimensions = {
        width: metadata.dimensions.width,
        height: metadata.dimensions.height,
        aspectRatio: (metadata.dimensions.width / metadata.dimensions.height).toFixed(2)
      };
    }

    if (metadata.duration) {
      cleaned.duration = {
        seconds: metadata.duration,
        formatted: this.formatDuration(metadata.duration)
      };
    }

    return cleaned;
  }

  // Sérialiser les informations d'accès
  serializeAccessInfo(file, context) {
    const user = context.user;
    
    if (!user) {
      return {
        canView: false,
        canDownload: false,
        canShare: false,
        canEdit: false,
        canDelete: false
      };
    }

    const isOwner = file.uploadedBy?.userId === user.id;
    const hasAccess = this.hasFileAccess(file, user, context);

    return {
      canView: hasAccess,
      canDownload: hasAccess,
      canShare: hasAccess && user.role === 'agent',
      canEdit: isOwner || user.role === 'agent',
      canDelete: isOwner,
      reason: hasAccess ? 'authorized' : 'no_access'
    };
  }

  // Sérialiser les données EXIF
  serializeExif(exif) {
    return {
      camera: {
        make: exif.make,
        model: exif.model
      },
      settings: {
        iso: exif.iso,
        aperture: exif.aperture,
        shutterSpeed: exif.shutterSpeed,
        focalLength: exif.focalLength
      },
      location: exif.gps ? {
        latitude: exif.gps.latitude,
        longitude: exif.gps.longitude
      } : null,
      dateTaken: this.formatDate(exif.dateTaken)
    };
  }

  // Générer les liens HATEOAS
  generateLinks(file, context) {
    const fileId = file.id || file._id;
    const links = {};

    // Lien vers soi-même
    links.self = `/files/${fileId}`;

    // Lien de téléchargement
    if (this.canDownload(file, context)) {
      links.download = `/files/${fileId}/download`;
    }

    // Lien de partage
    if (this.canShare(file, context)) {
      links.share = `/files/${fileId}/share`;
    }

    // Lien de modification
    if (this.canEdit(file, context)) {
      links.edit = `/files/${fileId}`;
    }

    // Lien de suppression
    if (this.canDelete(file, context)) {
      links.delete = `/files/${fileId}`;
    }

    // Lien vers le chat
    if (file.chatId) {
      links.chat = `/chats/${file.chatId}`;
    }

    // Lien vers l'uploader
    if (file.uploadedBy?.userId) {
      links.uploader = `/users/${file.uploadedBy.userId}`;
    }

    return links;
  }

  // Utilitaires
  getFileType(mimeType) {
    if (!mimeType) return 'unknown';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('text')) return 'text';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'archive';
    
    return 'document';
  }

  getFileExtension(filename) {
    if (!filename) return '';
    return filename.toLowerCase().split('.').pop() || '';
  }

  isImage(mimeType) {
    return mimeType && mimeType.startsWith('image/');
  }

  supportsThumbnails(mimeType) {
    return this.isImage(mimeType) || (mimeType && mimeType.startsWith('video/'));
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  // Vérifications d'accès
  hasFileAccess(file, user, context) {
    // TODO: Implémenter la logique d'accès via visibility-service
    return true;
  }

  canDownload(file, context) {
    return this.hasFileAccess(file, context.user, context);
  }

  canShare(file, context) {
    return this.hasFileAccess(file, context.user, context) && 
           context.user?.role === 'agent';
  }

  canEdit(file, context) {
    const user = context.user;
    if (!user) return false;
    
    return file.uploadedBy?.userId === user.id || user.role === 'agent';
  }

  canDelete(file, context) {
    const user = context.user;
    if (!user) return false;
    
    return file.uploadedBy?.userId === user.id;
  }
}

module.exports = FileSerializer;
