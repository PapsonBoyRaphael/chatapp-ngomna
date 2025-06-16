const { v4: uuidv4 } = require('uuid');

class File {
  constructor({
    id = uuidv4(),
    originalName,
    filename,
    mimetype,
    size,
    uploadedBy,
    conversationId,
    messageId = null,
    path,
    thumbnailPath = null,
    metadata = {},
    isDeleted = false,
    uploadedAt = new Date()
  }) {
    this.id = id;
    this.originalName = originalName;
    this.filename = filename;
    this.mimetype = mimetype;
    this.size = size;
    this.uploadedBy = uploadedBy;
    this.conversationId = conversationId;
    this.messageId = messageId;
    this.path = path;
    this.thumbnailPath = thumbnailPath;
    this.metadata = metadata;
    this.isDeleted = isDeleted;
    this.uploadedAt = uploadedAt;
  }

  static create(data) {
    return new File(data);
  }

  isImage() {
    return this.mimetype && this.mimetype.startsWith('image/');
  }

  isVideo() {
    return this.mimetype && this.mimetype.startsWith('video/');
  }

  isDocument() {
    return this.mimetype && (this.mimetype.includes('pdf') || this.mimetype.includes('document'));
  }

  getFileType() {
    if (this.isImage()) return 'image';
    if (this.isVideo()) return 'video';
    if (this.isDocument()) return 'document';
    return 'file';
  }

  validate() {
    const errors = [];

    if (!this.originalName) {
      errors.push('originalName is required');
    }

    if (!this.mimetype) {
      errors.push('mimetype is required');
    }

    if (!this.size || this.size <= 0) {
      errors.push('size must be greater than 0');
    }

    if (!this.uploadedBy) {
      errors.push('uploadedBy is required');
    }

    return errors;
  }

  formatSize() {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = this.size;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  toJSON() {
    return {
      id: this.id,
      originalName: this.originalName,
      filename: this.filename,
      mimetype: this.mimetype,
      size: this.size,
      formattedSize: this.formatSize(),
      uploadedBy: this.uploadedBy,
      conversationId: this.conversationId,
      messageId: this.messageId,
      path: this.path,
      thumbnailPath: this.thumbnailPath,
      metadata: this.metadata,
      isDeleted: this.isDeleted,
      uploadedAt: this.uploadedAt,
      type: this.getFileType(),
      isImage: this.isImage(),
      isVideo: this.isVideo(),
      isDocument: this.isDocument()
    };
  }
}

module.exports = File;
