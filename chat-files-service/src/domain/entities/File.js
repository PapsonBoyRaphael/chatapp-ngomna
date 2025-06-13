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
    gridFSId,
    isProcessed = false,
    thumbnailId = null,
    metadata = {},
    createdAt = new Date()
  }) {
    this.id = id;
    this.originalName = originalName;
    this.filename = filename;
    this.mimetype = mimetype;
    this.size = size;
    this.uploadedBy = uploadedBy;
    this.conversationId = conversationId;
    this.gridFSId = gridFSId;
    this.isProcessed = isProcessed;
    this.thumbnailId = thumbnailId;
    this.metadata = metadata;
    this.createdAt = createdAt;
  }

  static create(data) {
    return new File(data);
  }

  markAsProcessed() {
    this.isProcessed = true;
  }

  setThumbnail(thumbnailId) {
    this.thumbnailId = thumbnailId;
  }

  isImage() {
    return this.mimetype.startsWith('image/');
  }

  isVideo() {
    return this.mimetype.startsWith('video/');
  }

  isDocument() {
    return this.mimetype.includes('pdf') || 
           this.mimetype.includes('document') ||
           this.mimetype.includes('text');
  }

  getFormattedSize() {
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
      formattedSize: this.getFormattedSize(),
      uploadedBy: this.uploadedBy,
      conversationId: this.conversationId,
      gridFSId: this.gridFSId,
      isProcessed: this.isProcessed,
      thumbnailId: this.thumbnailId,
      metadata: this.metadata,
      createdAt: this.createdAt
    };
  }
}

module.exports = File;
