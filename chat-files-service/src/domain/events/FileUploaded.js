/**
 * Événement : Fichier téléversé
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class FileUploaded extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.fileId,
      aggregateType: 'File',
      userId: data.uploadedBy,
      fileId: data.fileId,
      filename: data.filename,
      originalName: data.originalName,
      mimetype: data.mimetype,
      size: data.size,
      type: data.type,
      uploadedBy: data.uploadedBy,
      conversationId: data.conversationId,
      isPublic: data.isPublic,
      ...data
    });
  }

  getFileId() {
    return this.data.fileId;
  }

  getFilename() {
    return this.data.filename;
  }

  getOriginalName() {
    return this.data.originalName;
  }

  getSize() {
    return this.data.size;
  }

  getType() {
    return this.data.type;
  }

  getUploadedBy() {
    return this.data.uploadedBy;
  }

  getConversationId() {
    return this.data.conversationId;
  }

  isPublic() {
    return this.data.isPublic;
  }

  isImage() {
    return this.data.type === 'image';
  }
}

module.exports = FileUploaded;
