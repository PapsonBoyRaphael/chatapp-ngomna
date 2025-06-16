/**
 * Repository MongoDB : Conversation
 * CENADI Chat-Files-Service
 */

const MongoBaseRepository = require('./MongoBaseRepository');
const { ConversationRepository } = require('../../../domain/repositories');
const { createLogger } = require('../../../../shared/utils/logger');
const { NotFoundException } = require('../../../../shared/exceptions/NotFoundException');
const { ValidationException } = require('../../../../shared/exceptions/ValidationException');

const logger = createLogger('MongoConversationRepository');

class MongoConversationRepository extends MongoBaseRepository {
  constructor(conversationModel, conversationEntityClass) {
    super(conversationModel, conversationEntityClass);
  }

  // Méthodes spécifiques aux conversations

  async findByParticipant(userId, options = {}) {
    try {
      logger.debug('Recherche conversations par participant:', { userId });

      const filters = {
        'participants.userId': userId,
        status: { $ne: 'deleted' }
      };

      if (options.type) {
        filters.type = options.type;
      }

      if (options.status) {
        filters.status = options.status;
      }

      const sort = options.sort || { lastActivity: -1 };
      
      return await this.findAll({
        filters,
        sort,
        populate: options.populate,
        limit: options.limit
      });

    } catch (error) {
      logger.error('Erreur recherche conversations par participant:', { 
        error: error.message, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async findByType(type, options = {}) {
    try {
      logger.debug('Recherche conversations par type:', { type });

      const filters = {
        type,
        status: { $ne: 'deleted' }
      };

      return await this.findAll({
        filters,
        sort: options.sort || { createdAt: -1 },
        populate: options.populate,
        limit: options.limit
      });

    } catch (error) {
      logger.error('Erreur recherche conversations par type:', { 
        error: error.message, 
        type 
      });
      throw this.handleError(error);
    }
  }

  async findPrivateConversation(userId1, userId2) {
    try {
      logger.debug('Recherche conversation privée:', { userId1, userId2 });

      const conversation = await this.model.findOne({
        type: 'private',
        'participants.userId': { $all: [userId1, userId2] },
        status: { $ne: 'deleted' }
      });

      return conversation ? this.toEntity(conversation) : null;

    } catch (error) {
      logger.error('Erreur recherche conversation privée:', { 
        error: error.message, 
        userId1, 
        userId2 
      });
      throw this.handleError(error);
    }
  }

  async isParticipant(conversationId, userId) {
    try {
      logger.debug('Vérification participation:', { conversationId, userId });

      const count = await this.model.countDocuments({
        _id: conversationId,
        'participants.userId': userId,
        status: { $ne: 'deleted' }
      });

      return count > 0;

    } catch (error) {
      logger.error('Erreur vérification participation:', { 
        error: error.message, 
        conversationId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async isAdmin(conversationId, userId) {
    try {
      logger.debug('Vérification admin:', { conversationId, userId });

      const count = await this.model.countDocuments({
        _id: conversationId,
        'participants': {
          $elemMatch: {
            userId: userId,
            role: { $in: ['admin', 'owner'] }
          }
        },
        status: { $ne: 'deleted' }
      });

      return count > 0;

    } catch (error) {
      logger.error('Erreur vérification admin:', { 
        error: error.message, 
        conversationId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async addParticipant(conversationId, userId, addedBy) {
    try {
      logger.debug('Ajout participant:', { conversationId, userId, addedBy });

      const participant = {
        userId,
        role: 'member',
        joinedAt: new Date(),
        addedBy
      };

      const updatedConversation = await this.model.findByIdAndUpdate(
        conversationId,
        {
          $addToSet: { participants: participant },
          $set: { updatedAt: new Date() }
        },
        { new: true, runValidators: true }
      );

      if (!updatedConversation) {
        throw new NotFoundException('Conversation non trouvée');
      }

      logger.info('Participant ajouté:', { conversationId, userId });
      return this.toEntity(updatedConversation);

    } catch (error) {
      logger.error('Erreur ajout participant:', { 
        error: error.message, 
        conversationId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async removeParticipant(conversationId, userId, removedBy, reason = 'left') {
    try {
      logger.debug('Suppression participant:', { conversationId, userId, removedBy, reason });

      const updatedConversation = await this.model.findByIdAndUpdate(
        conversationId,
        {
          $pull: { participants: { userId } },
          $set: { updatedAt: new Date() }
        },
        { new: true }
      );

      if (!updatedConversation) {
        throw new NotFoundException('Conversation non trouvée');
      }

      logger.info('Participant supprimé:', { conversationId, userId, reason });
      return this.toEntity(updatedConversation);

    } catch (error) {
      logger.error('Erreur suppression participant:', { 
        error: error.message, 
        conversationId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async updateParticipants(conversationId, participants) {
    try {
      logger.debug('Mise à jour participants:', { conversationId, participantCount: participants.length });

      const updatedConversation = await this.model.findByIdAndUpdate(
        conversationId,
        {
          $set: { 
            participants,
            updatedAt: new Date()
          }
        },
        { new: true, runValidators: true }
      );

      if (!updatedConversation) {
        throw new NotFoundException('Conversation non trouvée');
      }

      logger.info('Participants mis à jour:', { conversationId });
      return this.toEntity(updatedConversation);

    } catch (error) {
      logger.error('Erreur mise à jour participants:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async getParticipants(conversationId) {
    try {
      logger.debug('Récupération participants:', { conversationId });

      const conversation = await this.model.findById(conversationId)
        .select('participants')
        .populate('participants.userId', 'name email avatar');

      if (!conversation) {
        throw new NotFoundException('Conversation non trouvée');
      }

      return conversation.participants;

    } catch (error) {
      logger.error('Erreur récupération participants:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async getParticipantCount(conversationId) {
    try {
      logger.debug('Comptage participants:', { conversationId });

      const conversation = await this.model.findById(conversationId)
        .select('participants');

      if (!conversation) {
        throw new NotFoundException('Conversation non trouvée');
      }

      return conversation.participants.length;

    } catch (error) {
      logger.error('Erreur comptage participants:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async findByName(name, options = {}) {
    try {
      logger.debug('Recherche par nom:', { name });

      const filters = {
        name: { $regex: name, $options: 'i' },
        status: { $ne: 'deleted' }
      };

      if (options.type) {
        filters.type = options.type;
      }

      return await this.findAll({
        filters,
        sort: options.sort || { name: 1 },
        limit: options.limit
      });

    } catch (error) {
      logger.error('Erreur recherche par nom:', { 
        error: error.message, 
        name 
      });
      throw this.handleError(error);
    }
  }

  async searchConversations(query, userId, options = {}) {
    try {
      logger.debug('Recherche conversations:', { query, userId });

      const filters = {
        $and: [
          { 'participants.userId': userId },
          { status: { $ne: 'deleted' } },
          {
            $or: [
              { name: { $regex: query, $options: 'i' } },
              { description: { $regex: query, $options: 'i' } }
            ]
          }
        ]
      };

      return await this.findPaginated(
        filters,
        options.pagination || {},
        options.sort || { lastActivity: -1 }
      );

    } catch (error) {
      logger.error('Erreur recherche conversations:', { 
        error: error.message, 
        query, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async findRecentConversations(userId, limit = 20) {
    try {
      logger.debug('Recherche conversations récentes:', { userId, limit });

      const conversations = await this.model.find({
        'participants.userId': userId,
        status: { $ne: 'deleted' }
      })
      .sort({ lastActivity: -1 })
      .limit(limit)
      .populate('participants.userId', 'name avatar')
      .exec();

      return conversations.map(conv => this.toEntity(conv));

    } catch (error) {
      logger.error('Erreur recherche conversations récentes:', { 
        error: error.message, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async findArchivedConversations(userId, options = {}) {
    try {
      logger.debug('Recherche conversations archivées:', { userId });

      const filters = {
        'participants': {
          $elemMatch: {
            userId,
            isArchived: true
          }
        },
        status: { $ne: 'deleted' }
      };

      return await this.findPaginated(
        filters,
        options.pagination || {},
        options.sort || { archivedAt: -1 }
      );

    } catch (error) {
      logger.error('Erreur recherche conversations archivées:', { 
        error: error.message, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async archiveConversation(conversationId, archivedBy) {
    try {
      logger.debug('Archivage conversation:', { conversationId, archivedBy });

      const updatedConversation = await this.model.findOneAndUpdate(
        {
          _id: conversationId,
          'participants.userId': archivedBy
        },
        {
          $set: {
            'participants.$.isArchived': true,
            'participants.$.archivedAt': new Date(),
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedConversation) {
        throw new NotFoundException('Conversation non trouvée ou utilisateur non participant');
      }

      logger.info('Conversation archivée:', { conversationId, archivedBy });
      return this.toEntity(updatedConversation);

    } catch (error) {
      logger.error('Erreur archivage conversation:', { 
        error: error.message, 
        conversationId, 
        archivedBy 
      });
      throw this.handleError(error);
    }
  }

  async unarchiveConversation(conversationId, unarchivedBy) {
    try {
      logger.debug('Désarchivage conversation:', { conversationId, unarchivedBy });

      const updatedConversation = await this.model.findOneAndUpdate(
        {
          _id: conversationId,
          'participants.userId': unarchivedBy
        },
        {
          $set: {
            'participants.$.isArchived': false,
            updatedAt: new Date()
          },
          $unset: {
            'participants.$.archivedAt': 1
          }
        },
        { new: true }
      );

      if (!updatedConversation) {
        throw new NotFoundException('Conversation non trouvée ou utilisateur non participant');
      }

      logger.info('Conversation désarchivée:', { conversationId, unarchivedBy });
      return this.toEntity(updatedConversation);

    } catch (error) {
      logger.error('Erreur désarchivage conversation:', { 
        error: error.message, 
        conversationId, 
        unarchivedBy 
      });
      throw this.handleError(error);
    }
  }

  async muteConversation(conversationId, userId, mutedUntil = null) {
    try {
      logger.debug('Silence conversation:', { conversationId, userId, mutedUntil });

      const updateData = {
        'participants.$.isMuted': true,
        'participants.$.mutedAt': new Date(),
        updatedAt: new Date()
      };

      if (mutedUntil) {
        updateData['participants.$.mutedUntil'] = mutedUntil;
      }

      const updatedConversation = await this.model.findOneAndUpdate(
        {
          _id: conversationId,
          'participants.userId': userId
        },
        { $set: updateData },
        { new: true }
      );

      if (!updatedConversation) {
        throw new NotFoundException('Conversation non trouvée ou utilisateur non participant');
      }

      logger.info('Conversation mise en silence:', { conversationId, userId });
      return this.toEntity(updatedConversation);

    } catch (error) {
      logger.error('Erreur silence conversation:', { 
        error: error.message, 
        conversationId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async unmuteConversation(conversationId, userId) {
    try {
      logger.debug('Remise en son conversation:', { conversationId, userId });

      const updatedConversation = await this.model.findOneAndUpdate(
        {
          _id: conversationId,
          'participants.userId': userId
        },
        {
          $set: {
            'participants.$.isMuted': false,
            updatedAt: new Date()
          },
          $unset: {
            'participants.$.mutedAt': 1,
            'participants.$.mutedUntil': 1
          }
        },
        { new: true }
      );

      if (!updatedConversation) {
        throw new NotFoundException('Conversation non trouvée ou utilisateur non participant');
      }

      logger.info('Conversation remise en son:', { conversationId, userId });
      return this.toEntity(updatedConversation);

    } catch (error) {
      logger.error('Erreur remise en son conversation:', { 
        error: error.message, 
        conversationId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async isMuted(conversationId, userId) {
    try {
      logger.debug('Vérification silence:', { conversationId, userId });

      const conversation = await this.model.findOne({
        _id: conversationId,
        'participants': {
          $elemMatch: {
            userId,
            isMuted: true,
            $or: [
              { mutedUntil: { $exists: false } },
              { mutedUntil: null },
              { mutedUntil: { $gt: new Date() } }
            ]
          }
        }
      });

      return !!conversation;

    } catch (error) {
      logger.error('Erreur vérification silence:', { 
        error: error.message, 
        conversationId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async updateLastActivity(conversationId, lastActivity = new Date()) {
    try {
      logger.debug('Mise à jour dernière activité:', { conversationId });

      const updatedConversation = await this.model.findByIdAndUpdate(
        conversationId,
        {
          $set: {
            lastActivity,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedConversation) {
        throw new NotFoundException('Conversation non trouvée');
      }

      return this.toEntity(updatedConversation);

    } catch (error) {
      logger.error('Erreur mise à jour dernière activité:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async getConversationStats(conversationId) {
    try {
      logger.debug('Récupération statistiques conversation:', { conversationId });

      const conversation = await this.model.findById(conversationId);
      
      if (!conversation) {
        throw new NotFoundException('Conversation non trouvée');
      }

      // Calculer les statistiques
      const stats = {
        participantCount: conversation.participants.length,
        createdAt: conversation.createdAt,
        lastActivity: conversation.lastActivity,
        messageCount: conversation.messageCount || 0,
        fileCount: conversation.fileCount || 0
      };

      return stats;

    } catch (error) {
      logger.error('Erreur récupération statistiques:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async findConversationsWithUnreadMessages(userId) {
    try {
      logger.debug('Recherche conversations non lues:', { userId });

      // Cette méthode nécessiterait une agrégation avec les messages
      // Pour simplifier, on retourne les conversations de l'utilisateur
      return await this.findByParticipant(userId, {
        sort: { lastActivity: -1 }
      });

    } catch (error) {
      logger.error('Erreur recherche conversations non lues:', { 
        error: error.message, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async markConversationAsRead(conversationId, userId) {
    try {
      logger.debug('Marquage conversation comme lue:', { conversationId, userId });

      const updatedConversation = await this.model.findOneAndUpdate(
        {
          _id: conversationId,
          'participants.userId': userId
        },
        {
          $set: {
            'participants.$.lastReadAt': new Date(),
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedConversation) {
        throw new NotFoundException('Conversation non trouvée ou utilisateur non participant');
      }

      logger.info('Conversation marquée comme lue:', { conversationId, userId });
      return this.toEntity(updatedConversation);

    } catch (error) {
      logger.error('Erreur marquage conversation comme lue:', { 
        error: error.message, 
        conversationId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async getConversationMetadata(conversationId) {
    try {
      logger.debug('Récupération métadonnées conversation:', { conversationId });

      const conversation = await this.model.findById(conversationId)
        .select('metadata settings');

      if (!conversation) {
        throw new NotFoundException('Conversation non trouvée');
      }

      return {
        metadata: conversation.metadata || {},
        settings: conversation.settings || {}
      };

    } catch (error) {
      logger.error('Erreur récupération métadonnées:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async updateConversationMetadata(conversationId, metadata) {
    try {
      logger.debug('Mise à jour métadonnées conversation:', { conversationId });

      const updatedConversation = await this.model.findByIdAndUpdate(
        conversationId,
        {
          $set: {
            metadata,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedConversation) {
        throw new NotFoundException('Conversation non trouvée');
      }

      logger.info('Métadonnées conversation mises à jour:', { conversationId });
      return this.toEntity(updatedConversation);

    } catch (error) {
      logger.error('Erreur mise à jour métadonnées:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async findExpiredConversations(retentionDays) {
    try {
      logger.debug('Recherche conversations expirées:', { retentionDays });

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const conversations = await this.model.find({
        lastActivity: { $lt: cutoffDate },
        status: { $ne: 'deleted' }
      });

      return conversations.map(conv => this.toEntity(conv));

    } catch (error) {
      logger.error('Erreur recherche conversations expirées:', { 
        error: error.message, 
        retentionDays 
      });
      throw this.handleError(error);
    }
  }

  async bulkUpdateStatus(conversationIds, status, updatedBy) {
    try {
      logger.debug('Mise à jour statut en lot:', { 
        conversationIds, 
        status, 
        count: conversationIds.length 
      });

      const result = await this.model.updateMany(
        { _id: { $in: conversationIds } },
        {
          $set: {
            status,
            updatedAt: new Date(),
            'metadata.statusUpdatedBy': updatedBy,
            'metadata.statusUpdatedAt': new Date()
          }
        }
      );

      logger.info('Statut mis à jour en lot:', { 
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount 
      });

      return result;

    } catch (error) {
      logger.error('Erreur mise à jour statut en lot:', { 
        error: error.message, 
        conversationIds, 
        status 
      });
      throw this.handleError(error);
    }
  }
}

// Hériter des méthodes de ConversationRepository
Object.setPrototypeOf(MongoConversationRepository.prototype, ConversationRepository.prototype);

module.exports = MongoConversationRepository;
