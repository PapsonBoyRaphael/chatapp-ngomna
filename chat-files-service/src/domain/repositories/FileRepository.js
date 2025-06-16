/**
 * Interface Repository : File
 * CENADI Chat-Files-Service
 */

const BaseRepository = require('./BaseRepository');

class FileRepository extends BaseRepository {
  // Méthodes spécifiques aux fichiers

  async findByUploader(uploaderId, options = {}) {
    throw new Error('Method findByUploader() must be implemented');
  }

  async findByConversation(conversationId, options = {}) {
    throw new Error('Method findByConversation() must be implemented');
  }

  async findByType(type, options = {}) {
    throw new Error('Method findByType() must be implemented');
  }

  async findByExtension(extension, options = {}) {
    throw new Error('Method findByExtension() must be implemented');
  }

  async findByHash(hash, uploaderId = null) {
    throw new Error('Method findByHash() must be implemented');
  }

  async findByFilename(filename, options = {}) {
    throw new Error('Method findByFilename() must be implemented');
  }

  async searchFiles(query, filters = {}, options = {}) {
    throw new Error('Method searchFiles() must be implemented');
  }

  async findPublicFiles(options = {}) {
    throw new Error('Method findPublicFiles() must be implemented');
  }

  async findRecentFiles(userId, days = 7, options = {}) {
    throw new Error('Method findRecentFiles() must be implemented');
  }

  async findLargeFiles(minSize, options = {}) {
    throw new Error('Method findLargeFiles() must be implemented');
  }

  async findOrphanedFiles(options = {}) {
    throw new Error('Method findOrphanedFiles() must be implemented');
  }

  async countByUser(userId) {
    throw new Error('Method countByUser() must be implemented');
  }

  async countByConversation(conversationId) {
    throw new Error('Method countByConversation() must be implemented');
  }

  async countByType(type, filters = {}) {
    throw new Error('Method countByType() must be implemented');
  }

  async getStorageUsedByUser(userId) {
    throw new Error('Method getStorageUsedByUser() must be implemented');
  }

  async getStorageUsedByConversation(conversationId) {
    throw new Error('Method getStorageUsedByConversation() must be implemented');
  }

  async getTotalStorageUsed() {
    throw new Error('Method getTotalStorageUsed() must be implemented');
  }

  async incrementDownloadCount(fileId) {
    throw new Error('Method incrementDownloadCount() must be implemented');
  }

  async updateLastAccessed(fileId, accessedAt = new Date()) {
    throw new Error('Method updateLastAccessed() must be implemented');
  }

  async markAsProcessing(fileId) {
    throw new Error('Method markAsProcessing() must be implemented');
  }

  async markAsProcessed(fileId, processedData = {}) {
    throw new Error('Method markAsProcessed() must be implemented');
  }

  async markAsError(fileId, error) {
    throw new Error('Method markAsError() must be implemented');
  }

  async setThumbnail(fileId, thumbnailPath) {
    throw new Error('Method setThumbnail() must be implemented');
  }

  async updateMetadata(fileId, metadata) {
    throw new Error('Method updateMetadata() must be implemented');
  }

  async deleteFile(fileId, deletedBy, reason = 'user_request') {
    throw new Error('Method deleteFile() must be implemented');
  }

  async hardDeleteFile(fileId) {
    throw new Error('Method hardDeleteFile() must be implemented');
  }

  async findDeletedFiles(options = {}) {
    throw new Error('Method findDeletedFiles() must be implemented');
  }

  async restoreFile(fileId, restoredBy) {
    throw new Error('Method restoreFile() must be implemented');
  }

  async findDuplicates(hash, excludeId = null) {
    throw new Error('Method findDuplicates() must be implemented');
  }

  async findSimilarFiles(fileId, similarity = 0.8) {
    throw new Error('Method findSimilarFiles() must be implemented');
  }

  async getFileStatistics(period = '24h') {
    throw new Error('Method getFileStatistics() must be implemented');
  }

  async getUploadStatistics(userId, period = '30d') {
    throw new Error('Method getUploadStatistics() must be implemented');
  }

  async getDownloadStatistics(fileId, period = '30d') {
    throw new Error('Method getDownloadStatistics() must be implemented');
  }

  async findExpiredFiles(retentionDays) {
    throw new Error('Method findExpiredFiles() must be implemented');
  }

  async findUnusedFiles(unusedDays = 90) {
    throw new Error('Method findUnusedFiles() must be implemented');
  }

  async bulkUpdateStatus(fileIds, status, updatedBy) {
    throw new Error('Method bulkUpdateStatus() must be implemented');
  }

  async bulkDelete(fileIds, deletedBy, reason = 'bulk_delete') {
    throw new Error('Method bulkDelete() must be implemented');
  }

  async findByMimeType(mimetype, options = {}) {
    throw new Error('Method findByMimeType() must be implemented');
  }

  async findBySizeRange(minSize, maxSize, options = {}) {
    throw new Error('Method findBySizeRange() must be implemented');
  }

  async findByDateRange(startDate, endDate, options = {}) {
    throw new Error('Method findByDateRange() must be implemented');
  }

  async getPopularFiles(period = '30d', limit = 10) {
    throw new Error('Method getPopularFiles() must be implemented');
  }
}

module.exports = FileRepository;
