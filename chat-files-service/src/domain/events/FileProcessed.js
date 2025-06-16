/**
 * Événement : Fichier traité (compression, miniatures, etc.)
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class FileProcessed extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.fileId,
      aggregateType: 'File',
      userId: data.uploadedBy,
      fileId: data.fileId,
      filename: data.filename,
      processedBy: data.processedBy,
      processedAt: data.processedAt || new Date(),
      processingDuration: data.processingDuration,
      operations: data.operations, // ['compression', 'thumbnail', 'virus_scan']
      results: data.results,
      ...data
    });
  }

  getFileId() {
    return this.data.fileId;
  }

  getFilename() {
    return this.data.filename;
  }

  getProcessedBy() {
    return this.data.processedBy;
  }

  getProcessedAt() {
    return this.data.processedAt;
  }

  getProcessingDuration() {
    return this.data.processingDuration;
  }

  getOperations() {
    return this.data.operations || [];
  }

  getResults() {
    return this.data.results || {};
  }

  hasOperation(operation) {
    return this.getOperations().includes(operation);
  }

  wasCompressed() {
    return this.hasOperation('compression');
  }

  hasThumbnail() {
    return this.hasOperation('thumbnail');
  }

  wasVirusScanned() {
    return this.hasOperation('virus_scan');
  }
}

module.exports = FileProcessed;
