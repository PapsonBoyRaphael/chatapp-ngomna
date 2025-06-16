/**
 * Repository MongoDB : Message
 * CENADI Chat-Files-Service
 */

const MongoBaseRepository = require('./MongoBaseRepository');
const { MessageRepository } = require('../../../domain/repositories');
const { createLogger } = require('../../../../shared/utils/logger');
const { NotFoundException } = require('../../../../shared/exceptions/NotFoundException');
const { ValidationException } = require('../../../../shared/exceptions/ValidationException');

const logger = createLogger('MongoMessageRepository');

class MongoMessageRepository extends MongoBaseRepository {
  constructor(messageModel, messageEntityClass) {
    super(messageModel, messageEntityClass);
  }

  // Méthodes spécifiques aux messages

  async findByConversation(conversationId, options = {}) {
    try {
      logger.debug('Recherche messages par conversation:', { conversationId });

      const filters = {
        conversationId,
        isDeleted: false
      };

      if (options.type) {
        filters.type = options.type;
      }

      if (options.senderId) {
        filters.senderId = options.senderId;
      }

      if (options.hasFile !== undefined) {
        if (options.hasFile) {
          filters.fileId = { $ne: null };
        } else {
          filters.fileId = null;
        }
      }

      // Options de pagination
      const pagination = options.pagination || {};
      const sort = options.sort || { createdAt: -1 };

      return await this.findPaginated(filters, pagination, sort);

    } catch (error) {
      logger.error('Erreur recherche messages par conversation:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async findBySender(senderId, options = {}) {
    try {
      logger.debug('Recherche messages par expéditeur:', { senderId });

      const filters = {
        senderId,
        isDeleted: false
      };

      if (options.conversationId) {
        filters.conversationId = options.conversationId;
      }

      if (options.type) {
        filters.type = options.type;
      }

      return await this.findAll({
        filters,
        sort: options.sort || { createdAt: -1 },
        limit: options.limit || 50,
        populate: options.populate
      });

    } catch (error) {
      logger.error('Erreur recherche messages par expéditeur:', { 
        error: error.message, 
        senderId 
      });
      throw this.handleError(error);
    }
  }

  async findReplies(messageId, options = {}) {
    try {
      logger.debug('Recherche réponses au message:', { messageId });

      const filters = {
        replyToId: messageId,
        isDeleted: false
      };

      return await this.findAll({
        filters,
        sort: options.sort || { createdAt: 1 },
        limit: options.limit || 50,
        populate: options.populate
      });

    } catch (error) {
      logger.error('Erreur recherche réponses:', { 
        error: error.message, 
        messageId 
      });
      throw this.handleError(error);
    }
  }

  async findByThread(threadId, options = {}) {
    try {
      logger.debug('Recherche messages par thread:', { threadId });

      const filters = {
        threadId,
        isDeleted: false
      };

      return await this.findAll({
        filters,
        sort: options.sort || { createdAt: 1 },
        limit: options.limit || 100,
        populate: options.populate
      });

    } catch (error) {
      logger.error('Erreur recherche messages par thread:', { 
        error: error.message, 
        threadId 
      });
      throw this.handleError(error);
    }
  }

  async findWithFiles(conversationId, options = {}) {
    try {
      logger.debug('Recherche messages avec fichiers:', { conversationId });

      const filters = {
        conversationId,
        fileId: { $ne: null },
        isDeleted: false
      };

      if (options.fileType) {
        filters.type = options.fileType;
      }

      return await this.findAll({
        filters,
        sort: options.sort || { createdAt: -1 },
        limit: options.limit || 50,
        populate: ['fileId']
      });

    } catch (error) {
      logger.error('Erreur recherche messages avec fichiers:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async searchInConversation(conversationId, query, options = {}) {
    try {
      logger.debug('Recherche dans conversation:', { conversationId, query });

      const searchQuery = {
        conversationId,
        isDeleted: false,
        $text: { $search: query }
      };

      const messages = await this.model.find(searchQuery, {
        score: { $meta: 'textScore' }
      })
      .sort({ score: { $meta: 'textScore' } })
      .limit(options.limit || 20)
      .populate(options.populate || []);

      return messages.map(msg => this.toEntity(msg));

    } catch (error) {
      logger.error('Erreur recherche dans conversation:', { 
        error: error.message, 
        conversationId, 
        query 
      });
      throw this.handleError(error);
    }
  }

  async findMentions(userId, options = {}) {
    try {
      logger.debug('Recherche mentions utilisateur:', { userId });

      const filters = {
        'mentions.userId': userId,
        isDeleted: false
      };

      if (options.conversationId) {
        filters.conversationId = options.conversationId;
      }

      return await this.findAll({
        filters,
        sort: options.sort || { createdAt: -1 },
        limit: options.limit || 50,
        populate: options.populate
      });

    } catch (error) {
      logger.error('Erreur recherche mentions:', { 
        error: error.message, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async findPinnedMessages(conversationId) {
    try {
      logger.debug('Recherche messages épinglés:', { conversationId });

      const filters = {
        conversationId,
        isPinned: true,
        isDeleted: false
      };

      return await this.findAll({
        filters,
        sort: { pinnedAt: -1 }
      });

    } catch (error) {
      logger.error('Erreur recherche messages épinglés:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async addReaction(messageId, userId, emoji) {
    try {
      logger.debug('Ajout réaction:', { messageId, userId, emoji });

      // Supprimer la réaction existante de l'utilisateur
      await this.model.updateOne(
        { _id: messageId },
        { $pull: { reactions: { userId } } }
      );

      // Ajouter la nouvelle réaction
      const updatedMessage = await this.model.findByIdAndUpdate(
        messageId,
        {
          $push: {
            reactions: {
              userId,
              emoji,
              addedAt: new Date()
            }
          },
          $set: { updatedAt: new Date() }
        },
        { new: true, runValidators: true }
      );

      if (!updatedMessage) {
        throw new NotFoundException('Message non trouvé');
      }

      // Mettre à jour le compteur
      updatedMessage.stats.reactionCount = updatedMessage.reactions.length;
      await updatedMessage.save();

      logger.info('Réaction ajoutée:', { messageId, userId, emoji });
      return this.toEntity(updatedMessage);

    } catch (error) {
      logger.error('Erreur ajout réaction:', { 
        error: error.message, 
        messageId, 
        userId, 
        emoji 
      });
      throw this.handleError(error);
    }
  }

  async removeReaction(messageId, userId) {
    try {
      logger.debug('Suppression réaction:', { messageId, userId });

      const updatedMessage = await this.model.findByIdAndUpdate(
        messageId,
        {
          $pull: { reactions: { userId } },
          $set: { updatedAt: new Date() }
        },
        { new: true }
      );

      if (!updatedMessage) {
        throw new NotFoundException('Message non trouvé');
      }

      // Mettre à jour le compteur
      updatedMessage.stats.reactionCount = updatedMessage.reactions.length;
      await updatedMessage.save();

      logger.info('Réaction supprimée:', { messageId, userId });
      return this.toEntity(updatedMessage);

    } catch (error) {
      logger.error('Erreur suppression réaction:', { 
        error: error.message, 
        messageId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async editMessage(messageId, newContent, editedBy) {
    try {
      logger.debug('Édition message:', { messageId, editedBy });

      const message = await this.model.findById(messageId);
      if (!message) {
        throw new NotFoundException('Message non trouvé');
      }

      if (message.isDeleted) {
        throw new ValidationException('Impossible d\'éditer un message supprimé');
      }

      // Sauvegarder l'ancien contenu dans l'historique
      const editHistory = {
        content: message.content,
        editedAt: new Date(),
        editedBy
      };

      const updatedMessage = await this.model.findByIdAndUpdate(
        messageId,
        {
          $set: {
            content: newContent,
            isEdited: true,
            updatedAt: new Date()
          },
          $push: { editHistory }
        },
        { new: true, runValidators: true }
      );

      logger.info('Message édité:', { messageId, editedBy });
      return this.toEntity(updatedMessage);

    } catch (error) {
      logger.error('Erreur édition message:', { 
        error: error.message, 
        messageId, 
        editedBy 
      });
      throw this.handleError(error);
    }
  }

  async deleteMessage(messageId, deletedBy, reason = 'user_request') {
    try {
      logger.debug('Suppression message:', { messageId, deletedBy, reason });

      const updatedMessage = await this.model.findByIdAndUpdate(
        messageId,
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy,
            deleteReason: reason,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedMessage) {
        throw new NotFoundException('Message non trouvé');
      }

      logger.info('Message supprimé:', { messageId, deletedBy, reason });
      return this.toEntity(updatedMessage);

    } catch (error) {
      logger.error('Erreur suppression message:', { 
        error: error.message, 
        messageId, 
        deletedBy 
      });
      throw this.handleError(error);
    }
  }

  async restoreMessage(messageId) {
    try {
      logger.debug('Restauration message:', { messageId });

      const updatedMessage = await this.model.findByIdAndUpdate(
        messageId,
        {
          $set: {
            isDeleted: false,
            updatedAt: new Date()
          },
          $unset: {
            deletedAt: 1,
            deletedBy: 1,
            deleteReason: 1
          }
        },
        { new: true }
      );

      if (!updatedMessage) {
        throw new NotFoundException('Message non trouvé');
      }

      logger.info('Message restauré:', { messageId });
      return this.toEntity(updatedMessage);

    } catch (error) {
      logger.error('Erreur restauration message:', { 
        error: error.message, 
        messageId 
      });
      throw this.handleError(error);
    }
  }

  async pinMessage(messageId, pinnedBy) {
    try {
      logger.debug('Épinglage message:', { messageId, pinnedBy });

      const updatedMessage = await this.model.findByIdAndUpdate(
        messageId,
        {
          $set: {
            isPinned: true,
            pinnedAt: new Date(),
            pinnedBy,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedMessage) {
        throw new NotFoundException('Message non trouvé');
      }

      logger.info('Message épinglé:', { messageId, pinnedBy });
      return this.toEntity(updatedMessage);

    } catch (error) {
      logger.error('Erreur épinglage message:', { 
        error: error.message, 
        messageId, 
        pinnedBy 
      });
      throw this.handleError(error);
    }
  }

  async unpinMessage(messageId) {
    try {
      logger.debug('Désépinglage message:', { messageId });

      const updatedMessage = await this.model.findByIdAndUpdate(
        messageId,
        {
          $set: {
            isPinned: false,
            updatedAt: new Date()
          },
          $unset: {
            pinnedAt: 1,
            pinnedBy: 1
          }
        },
        { new: true }
      );

      if (!updatedMessage) {
        throw new NotFoundException('Message non trouvé');
      }

      logger.info('Message désépinglé:', { messageId });
      return this.toEntity(updatedMessage);

    } catch (error) {
      logger.error('Erreur désépinglage message:', { 
        error: error.message, 
        messageId 
      });
      throw this.handleError(error);
    }
  }

  async markAsRead(messageId, userId) {
    try {
      logger.debug('Marquage message comme lu:', { messageId, userId });

      // Vérifier si déjà lu
      const message = await this.model.findById(messageId);
      if (!message) {
        throw new NotFoundException('Message non trouvé');
      }

      const alreadyRead = message.readBy.some(r => r.userId.toString() === userId.toString());
      if (alreadyRead) {
        return this.toEntity(message);
      }

      const updatedMessage = await this.model.findByIdAndUpdate(
        messageId,
        {
          $push: {
            readBy: {
              userId,
              readAt: new Date()
            }
          },
          $set: { updatedAt: new Date() }
        },
        { new: true }
      );

      // Mettre à jour le compteur
      updatedMessage.stats.readCount = updatedMessage.readBy.length;
      await updatedMessage.save();

      logger.info('Message marqué comme lu:', { messageId, userId });
      return this.toEntity(updatedMessage);

    } catch (error) {
      logger.error('Erreur marquage lecture:', { 
        error: error.message, 
        messageId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async getMessageStats(messageId) {
    try {
      logger.debug('Récupération statistiques message:', { messageId });

      const message = await this.model.findById(messageId);
      if (!message) {
        throw new NotFoundException('Message non trouvé');
      }

      const stats = {
        reactionCount: message.reactions.length,
        readCount: message.readBy.length,
        replyCount: await this.model.countDocuments({ replyToId: messageId, isDeleted: false }),
        editCount: message.editHistory.length,
        isPinned: message.isPinned,
        isEdited: message.isEdited
      };

      return stats;

    } catch (error) {
      logger.error('Erreur récupération statistiques message:', { 
        error: error.message, 
        messageId 
      });
      throw this.handleError(error);
    }
  }

  async findRecentMessages(conversationId, limit = 50) {
    try {
      logger.debug('Recherche messages récents:', { conversationId, limit });

      const messages = await this.model.find({
        conversationId,
        isDeleted: false
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('fileId');

      return messages.map(msg => this.toEntity(msg));

    } catch (error) {
      logger.error('Erreur recherche messages récents:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async findUnreadMessages(conversationId, userId, lastReadAt) {
    try {
      logger.debug('Recherche messages non lus:', { conversationId, userId, lastReadAt });

      const messages = await this.model.find({
        conversationId,
        isDeleted: false,
        createdAt: { $gt: lastReadAt },
        senderId: { $ne: userId } // Exclure ses propres messages
      })
      .sort({ createdAt: 1 });

      return messages.map(msg => this.toEntity(msg));

    } catch (error) {
      logger.error('Erreur recherche messages non lus:', { 
        error: error.message, 
        conversationId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async getConversationMessageStats(conversationId) {
    try {
      logger.debug('Statistiques messages conversation:', { conversationId });

      const stats = await this.model.aggregate([
        { $match: { conversationId: mongoose.Types.ObjectId(conversationId), isDeleted: false } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalSize: { $sum: { $ifNull: ['$fileSize', 0] } }
          }
        }
      ]);

      const totalMessages = await this.model.countDocuments({
        conversationId,
        isDeleted: false
      });

      return {
        totalMessages,
        byType: stats,
        lastMessage: await this.findRecentMessages(conversationId, 1)
      };

    } catch (error) {
      logger.error('Erreur statistiques messages conversation:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async bulkMarkAsRead(messageIds, userId) {
    try {
      logger.debug('Marquage multiple comme lu:', { 
        messageIds, 
        userId, 
        count: messageIds.length 
      });

      const result = await this.model.updateMany(
        {
          _id: { $in: messageIds },
          'readBy.userId': { $ne: userId }
        },
        {
          $push: {
            readBy: {
              userId,
              readAt: new Date()
            }
          },
          $set: { updatedAt: new Date() }
        }
      );

      logger.info('Messages marqués comme lus:', { 
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount 
      });

      return result;

    } catch (error) {
      logger.error('Erreur marquage multiple lecture:', { 
        error: error.message, 
        messageIds, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async findExpiredMessages(retentionDays) {
    try {
      logger.debug('Recherche messages expirés:', { retentionDays });

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const messages = await this.model.find({
        createdAt: { $lt: cutoffDate },
        isDeleted: false
      });

      return messages.map(msg => this.toEntity(msg));

    } catch (error) {
      logger.error('Erreur recherche messages expirés:', { 
        error: error.message, 
        retentionDays 
      });
      throw this.handleError(error);
    }
  }
}

// Hériter des méthodes de MessageRepository
Object.setPrototypeOf(MongoMessageRepository.prototype, MessageRepository.prototype);

module.exports = MongoMessageRepository;
