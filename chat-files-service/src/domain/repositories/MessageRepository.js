/**
 * Interface Repository : Message
 * CENADI Chat-Files-Service
 */

const BaseRepository = require('./BaseRepository');

class MessageRepository extends BaseRepository {
  // Méthodes spécifiques aux messages

  async findByConversation(conversationId, options = {}) {
    throw new Error('Method findByConversation() must be implemented');
  }

  async findByConversationPaginated(conversationId, pagination = {}, filters = {}) {
    throw new Error('Method findByConversationPaginated() must be implemented');
  }

  async findBySender(senderId, options = {}) {
    throw new Error('Method findBySender() must be implemented');
  }

  async findByType(type, options = {}) {
    throw new Error('Method findByType() must be implemented');
  }

  async findByFileId(fileId) {
    throw new Error('Method findByFileId() must be implemented');
  }

  async findLastByConversation(conversationId) {
    throw new Error('Method findLastByConversation() must be implemented');
  }

  async findUnreadByConversation(conversationId, userId) {
    throw new Error('Method findUnreadByConversation() must be implemented');
  }

  async countUnreadByConversation(conversationId, userId) {
    throw new Error('Method countUnreadByConversation() must be implemented');
  }

  async countByConversation(conversationId, filters = {}) {
    throw new Error('Method countByConversation() must be implemented');
  }

  async markAsRead(messageId, userId) {
    throw new Error('Method markAsRead() must be implemented');
  }

  async markAsDelivered(messageId) {
    throw new Error('Method markAsDelivered() must be implemented');
  }

  async markConversationAsRead(conversationId, userId, upToMessageId = null) {
    throw new Error('Method markConversationAsRead() must be implemented');
  }

  async getReadStatus(messageId) {
    throw new Error('Method getReadStatus() must be implemented');
  }

  async addReaction(messageId, userId, reaction) {
    throw new Error('Method addReaction() must be implemented');
  }

  async removeReaction(messageId, userId) {
    throw new Error('Method removeReaction() must be implemented');
  }

  async getReactions(messageId) {
    throw new Error('Method getReactions() must be implemented');
  }

  async searchMessages(query, filters = {}, options = {}) {
    throw new Error('Method searchMessages() must be implemented');
  }

  async searchInConversation(conversationId, query, options = {}) {
    throw new Error('Method searchInConversation() must be implemented');
  }

  async findReplies(messageId, options = {}) {
    throw new Error('Method findReplies() must be implemented');
  }

  async findMessageThread(messageId, options = {}) {
    throw new Error('Method findMessageThread() must be implemented');
  }

  async editMessage(messageId, newContent, editedBy) {
    throw new Error('Method editMessage() must be implemented');
  }

  async deleteMessage(messageId, deletedBy, reason = 'user_request') {
    throw new Error('Method deleteMessage() must be implemented');
  }

  async getEditHistory(messageId) {
    throw new Error('Method getEditHistory() must be implemented');
  }

  async findSystemMessages(conversationId, options = {}) {
    throw new Error('Method findSystemMessages() must be implemented');
  }

  async findMediaMessages(conversationId, options = {}) {
    throw new Error('Method findMediaMessages() must be implemented');
  }

  async findFileMessages(conversationId, options = {}) {
    throw new Error('Method findFileMessages() must be implemented');
  }

  async getMessageStats(conversationId, options = {}) {
    throw new Error('Method getMessageStats() must be implemented');
  }

  async findMessagesAfter(conversationId, afterMessageId, limit = 50) {
    throw new Error('Method findMessagesAfter() must be implemented');
  }

  async findMessagesBefore(conversationId, beforeMessageId, limit = 50) {
    throw new Error('Method findMessagesBefore() must be implemented');
  }

  async findMessagesByDateRange(conversationId, startDate, endDate, options = {}) {
    throw new Error('Method findMessagesByDateRange() must be implemented');
  }

  async findMentions(userId, options = {}) {
    throw new Error('Method findMentions() must be implemented');
  }

  async bulkMarkAsRead(messageIds, userId) {
    throw new Error('Method bulkMarkAsRead() must be implemented');
  }

  async bulkDelete(messageIds, deletedBy, reason = 'bulk_delete') {
    throw new Error('Method bulkDelete() must be implemented');
  }

  async findExpiredMessages(retentionDays) {
    throw new Error('Method findExpiredMessages() must be implemented');
  }

  async getMessageStatistics(conversationId, period = '24h') {
    throw new Error('Method getMessageStatistics() must be implemented');
  }

  async findPopularMessages(conversationId, options = {}) {
    throw new Error('Method findPopularMessages() must be implemented');
  }
}

module.exports = MessageRepository;
