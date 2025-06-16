/**
 * Mapper: Conversations
 * CENADI Chat-Files-Service
 */

const BaseMapper = require('./BaseMapper');

class ConversationMapper extends BaseMapper {
  constructor() {
    super();
  }

  // Mapper entité vers DTO
  mapToDto(conversation, options = {}) {
    const context = this.mapWithContext(conversation, options);
    
    const dto = {
      id: conversation.id,
      name: conversation.name,
      type: conversation.type,
      isActive: conversation.isActive,
      
      // Dates
      createdAt: conversation.createdAt ? conversation.createdAt.toISOString() : null,
      updatedAt: conversation.updatedAt ? conversation.updatedAt.toISOString() : null,
      lastActivity: conversation.lastActivity ? conversation.lastActivity.toISOString() : null,
      
      // Compteurs de base
      participantCount: conversation.participantCount || 0,
      messageCount: conversation.messageCount || 0
    };

    // Informations étendues
    if (context.includeMetadata || context.isAdmin) {
      dto.metadata = this.mapConversationMetadata(conversation.metadata, context);
    }

    // Statistiques des fichiers
    if (context.includeStats) {
      dto.fileStats = this.mapFileStats(conversation.fileStats, context);
    }

    // Participants (si demandé)
    if (context.includeRelated && conversation.participants) {
      dto.participants = conversation.participants.map(p => this.mapParticipant(p, context));
    }

    // Permissions utilisateur
    if (context.includePermissions && options.permissions) {
      dto.permissions = options.permissions;
    }

    return dto;
  }

  // Mapper DTO vers entité
  mapToEntity(dto, options = {}) {
    return {
      id: dto.id,
      name: dto.name,
      type: dto.type || 'group',
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      metadata: dto.metadata || {},
      createdAt: dto.createdAt ? new Date(dto.createdAt) : new Date(),
      updatedAt: new Date()
    };
  }

  // Mappers spécialisés

  mapConversationMetadata(metadata, context) {
    if (!metadata) return {};

    const mapped = {
      description: metadata.description,
      settings: metadata.settings || {}
    };

    // Métadonnées admin
    if (context.isAdmin) {
      mapped.admin = {
        createdBy: metadata.createdBy,
        archivedAt: metadata.archivedAt,
        archivedBy: metadata.archivedBy
      };
    }

    return mapped;
  }

  mapFileStats(fileStats, context) {
    if (!fileStats) {
      return {
        totalFiles: 0,
        totalSize: 0,
        formattedTotalSize: '0 B',
        byCategory: {}
      };
    }

    return {
      totalFiles: fileStats.totalFiles || 0,
      totalSize: fileStats.totalSize || 0,
      formattedTotalSize: this.formatFileSize(fileStats.totalSize || 0),
      byCategory: fileStats.byCategory || {},
      lastFileUpload: fileStats.lastFileUpload ? fileStats.lastFileUpload.toISOString() : null
    };
  }

  mapParticipant(participant, context) {
    const mapped = {
      userId: participant.userId,
      role: participant.role,
      joinedAt: participant.joinedAt ? participant.joinedAt.toISOString() : null,
      isActive: participant.isActive !== undefined ? participant.isActive : true
    };

    // Informations utilisateur si disponibles
    if (participant.user) {
      mapped.user = {
        name: participant.user.name,
        email: participant.user.email,
        avatar: participant.user.avatar
      };
    }

    // Permissions dans la conversation
    if (participant.permissions) {
      mapped.permissions = participant.permissions;
    }

    return mapped;
  }

  // Versions allégées

  toListDto(conversation, options = {}) {
    return {
      id: conversation.id,
      name: conversation.name,
      type: conversation.type,
      participantCount: conversation.participantCount || 0,
      lastActivity: conversation.lastActivity ? conversation.lastActivity.toISOString() : null,
      fileCount: conversation.fileStats?.totalFiles || 0,
      permissions: options.permissions || null
    };
  }

  toStatsDto(conversation) {
    return {
      id: conversation.id,
      name: conversation.name,
      stats: {
        participants: conversation.participantCount || 0,
        messages: conversation.messageCount || 0,
        files: conversation.fileStats?.totalFiles || 0,
        totalFileSize: conversation.fileStats?.totalSize || 0,
        formattedTotalFileSize: this.formatFileSize(conversation.fileStats?.totalSize || 0)
      },
      activity: {
        createdAt: conversation.createdAt ? conversation.createdAt.toISOString() : null,
        lastActivity: conversation.lastActivity ? conversation.lastActivity.toISOString() : null
      }
    };
  }
}

module.exports = ConversationMapper;
