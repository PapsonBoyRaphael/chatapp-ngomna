/**
 * Interface Repository : Conversation
 * CENADI Chat-Files-Service
 */

const BaseRepository = require('./BaseRepository');

class ConversationRepository extends BaseRepository {
  // Méthodes spécifiques aux conversations

  async findByParticipant(userId, options = {}) {
    throw new Error('Method findByParticipant() must be implemented');
  }

  async findByType(type, options = {}) {
    throw new Error('Method findByType() must be implemented');
  }

  async findPrivateConversation(userId1, userId2) {
    throw new Error('Method findPrivateConversation() must be implemented');
  }

  async isParticipant(conversationId, userId) {
    throw new Error('Method isParticipant() must be implemented');
  }

  async isAdmin(conversationId, userId) {
    throw new Error('Method isAdmin() must be implemented');
  }

  async addParticipant(conversationId, userId, addedBy) {
    throw new Error('Method addParticipant() must be implemented');
  }

  async removeParticipant(conversationId, userId, removedBy, reason) {
    throw new Error('Method removeParticipant() must be implemented');
  }

  async updateParticipants(conversationId, participants) {
    throw new Error('Method updateParticipants() must be implemented');
  }

  async getParticipants(conversationId) {
    throw new Error('Method getParticipants() must be implemented');
  }

  async getParticipantCount(conversationId) {
    throw new Error('Method getParticipantCount() must be implemented');
  }

  async findByName(name, options = {}) {
    throw new Error('Method findByName() must be implemented');
  }

  async searchConversations(query, userId, options = {}) {
    throw new Error('Method searchConversations() must be implemented');
  }

  async findRecentConversations(userId, limit = 20) {
    throw new Error('Method findRecentConversations() must be implemented');
  }

  async findArchivedConversations(userId, options = {}) {
    throw new Error('Method findArchivedConversations() must be implemented');
  }

  async archiveConversation(conversationId, archivedBy) {
    throw new Error('Method archiveConversation() must be implemented');
  }

  async unarchiveConversation(conversationId, unarchivedBy) {
    throw new Error('Method unarchiveConversation() must be implemented');
  }

  async muteConversation(conversationId, userId, mutedUntil = null) {
    throw new Error('Method muteConversation() must be implemented');
  }

  async unmuteConversation(conversationId, userId) {
    throw new Error('Method unmuteConversation() must be implemented');
  }

  async isMuted(conversationId, userId) {
    throw new Error('Method isMuted() must be implemented');
  }

  async updateLastActivity(conversationId, lastActivity = new Date()) {
    throw new Error('Method updateLastActivity() must be implemented');
  }

  async getConversationStats(conversationId) {
    throw new Error('Method getConversationStats() must be implemented');
  }

  async findConversationsWithUnreadMessages(userId) {
    throw new Error('Method findConversationsWithUnreadMessages() must be implemented');
  }

  async markConversationAsRead(conversationId, userId) {
    throw new Error('Method markConversationAsRead() must be implemented');
  }

  async getConversationMetadata(conversationId) {
    throw new Error('Method getConversationMetadata() must be implemented');
  }

  async updateConversationMetadata(conversationId, metadata) {
    throw new Error('Method updateConversationMetadata() must be implemented');
  }

  async findExpiredConversations(retentionDays) {
    throw new Error('Method findExpiredConversations() must be implemented');
  }

  async bulkUpdateStatus(conversationIds, status, updatedBy) {
    throw new Error('Method bulkUpdateStatus() must be implemented');
  }
}

module.exports = ConversationRepository;
