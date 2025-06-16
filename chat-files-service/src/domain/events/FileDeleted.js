/**
 * Événement : Fichier supprimé
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class FileDeleted extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.fileId,
      aggregateType: 'File',
      userId: data.deletedBy,
      fileId: data.fileId,
      filename: data.filename,
      deletedBy: data.deletedBy,
      deleteType: data.deleteType, // 'soft', 'hard'
      reason: data.reason,
      ...data
    });
  }

  getFileId() {
    return this.data.fileId;
  }

  getFilename() {
    return this.data.filename;
  }

  getDeletedBy() {
    return this.data.deletedBy;
  }

  getDeleteType() {
    return this.data.deleteType;
  }

  getReason() {
    return this.data.reason;
  }

  isHardDelete() {
    return this.data.deleteType === 'hard';
  }

  isSoftDelete() {
    return this.data.deleteType === 'soft';
  }
}

module.exports = FileDeleted;
