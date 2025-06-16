/**
 * DTO pour les réponses de fichier
 * CENADI Chat-Files-Service
 */

class FileResponse {
  constructor(file) {
    this.id = file._id || file.id;
    this.filename = file.filename;
    this.originalName = file.originalName;
    this.mimeType = file.mimeType;
    this.size = file.size;
    this.uploadedBy = file.uploadedBy;
    this.conversationId = file.conversationId;
    this.description = file.description;
    this.isPublic = file.isPublic || false;
    this.downloadCount = file.downloadCount || 0;
    this.thumbnailId = file.thumbnailId;
    this.metadata = file.metadata || {};
    this.expiresAt = file.expiresAt;
    this.createdAt = file.createdAt;
    this.updatedAt = file.updatedAt;

    // Informations enrichies
    this.category = this.getFileCategory();
    this.extension = this.getFileExtension();
    this.sizeFormatted = this.formatFileSize();
    this.isImage = this.category === 'image';
    this.isVideo = this.category === 'video';
    this.isAudio = this.category === 'audio';
    this.isDocument = this.category === 'document';
    this.hasExpiration = !!this.expiresAt;
    this.isExpired = this.hasExpiration && new Date(this.expiresAt) < new Date();
    this.hasThumbnail = !!this.thumbnailId;
  }

  static fromArray(files) {
    return files.map(file => new FileResponse(file));
  }

  getFileCategory() {
    if (!this.mimeType) return 'unknown';

    if (this.mimeType.startsWith('image/')) return 'image';
    if (this.mimeType.startsWith('video/')) return 'video';
    if (this.mimeType.startsWith('audio/')) return 'audio';
    if (this.mimeType.includes('pdf') || this.mimeType.includes('document') || this.mimeType.includes('text')) return 'document';

    return 'other';
  }

  getFileExtension() {
    if (!this.filename) return '';
    const parts = this.filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  formatFileSize() {
    if (!this.size) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = this.size;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  toPlainObject() {
    return {
      id: this.id,
      filename: this.filename,
      originalName: this.originalName,
      mimeType: this.mimeType,
      size: this.size,
      uploadedBy: this.uploadedBy,
      conversationId: this.conversationId,
      description: this.description,
      isPublic: this.isPublic,
      downloadCount: this.downloadCount,
      thumbnailId: this.thumbnailId,
      metadata: this.metadata,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      computed: {
        category: this.category,
        extension: this.extension,
        sizeFormatted: this.sizeFormatted
      },
      flags: {
        isImage: this.isImage,
        isVideo: this.isVideo,
        isAudio: this.isAudio,
        isDocument: this.isDocument,
        hasExpiration: this.hasExpiration,
        isExpired: this.isExpired,
        hasThumbnail: this.hasThumbnail
      }
    };
  }

  // Version publique (sans informations sensibles)
  toPublicObject() {
    return {
      id: this.id,
      filename: this.filename,
      originalName: this.originalName,
      mimeType: this.mimeType,
      size: this.size,
      description: this.description,
      downloadCount: this.downloadCount,
      thumbnailId: this.thumbnailId,
      createdAt: this.createdAt,
      computed: {
        category: this.category,
        extension: this.extension,
        sizeFormatted: this.sizeFormatted
      },
      flags: {
        isImage: this.isImage,
        isVideo: this.isVideo,
        isAudio: this.isAudio,
        isDocument: this.isDocument,
        hasThumbnail: this.hasThumbnail
      }
    };
  }

  // Version minimale pour les listes
  toListObject() {
    return {
      id: this.id,
      filename: this.filename,
      mimeType: this.mimeType,
      size: this.size,
      sizeFormatted: this.sizeFormatted,
      category: this.category,
      extension: this.extension,
      createdAt: this.createdAt,
      hasThumbnail: this.hasThumbnail
    };
  }
}

module.exports = FileResponse;
