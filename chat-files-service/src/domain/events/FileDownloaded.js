/**
 * Événement : Fichier téléchargé
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class FileDownloaded extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.fileId,
      aggregateType: 'File',
      userId: data.downloadedBy,
      fileId: data.fileId,
      downloadedBy: data.downloadedBy,
      downloadType: data.downloadType, // 'original', 'thumbnail'
      downloadedAt: data.downloadedAt || new Date(),
      ...data
    });
  }

  getFileId() {
    return this.data.fileId;
  }

  getDownloadedBy() {
    return this.data.downloadedBy;
  }

  getDownloadType() {
    return this.data.downloadType;
  }

  getDownloadedAt() {
    return this.data.downloadedAt;
  }

  isThumbnailDownload() {
    return this.data.downloadType === 'thumbnail';
  }
}

module.exports = FileDownloaded;
