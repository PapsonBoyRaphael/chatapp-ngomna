/**
 * Mapper: Utilisateurs
 * CENADI Chat-Files-Service
 */

const BaseMapper = require('./BaseMapper');

class UserMapper extends BaseMapper {
  constructor() {
    super();
  }

  // Mapper entité vers DTO
  mapToDto(user, options = {}) {
    const context = this.mapWithContext(user, options);
    
    const dto = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      isActive: user.isActive !== undefined ? user.isActive : true,
      
      // Dates
      createdAt: user.createdAt ? user.createdAt.toISOString() : null,
      lastActivity: user.lastActivity ? user.lastActivity.toISOString() : null
    };

    // Informations de profil étendues
    if (context.includeMetadata || context.isOwner || context.isAdmin) {
      dto.profile = this.mapUserProfile(user.profile, context);
    }

    // Statistiques utilisateur
    if (context.includeStats) {
      dto.stats = this.mapUserStats(user.stats, context);
    }

    // Quotas et utilisation
    if (context.includeMetadata || context.isOwner || context.isAdmin) {
      dto.quota = this.mapUserQuota(user.quota, context);
    }

    // Permissions globales
    if (context.includePermissions && user.permissions) {
      dto.permissions = user.permissions;
    }

    // Informations admin
    if (context.isAdmin) {
      dto.admin = this.mapAdminInfo(user, context);
    }

    return dto;
  }

  // Mapper DTO vers entité
  mapToEntity(dto, options = {}) {
    return {
      id: dto.id,
      name: dto.name,
      email: dto.email,
      avatar: dto.avatar,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      profile: dto.profile || {},
      permissions: dto.permissions || [],
      createdAt: dto.createdAt ? new Date(dto.createdAt) : new Date(),
      updatedAt: new Date()
    };
  }

  // Mappers spécialisés

  mapUserProfile(profile, context) {
    if (!profile) return {};

    const mapped = {
      displayName: profile.displayName,
      bio: profile.bio,
      timezone: profile.timezone,
      language: profile.language || 'fr',
      preferences: profile.preferences || {}
    };

    // Informations privées (propriétaire/admin seulement)
    if (context.isOwner || context.isAdmin) {
      mapped.private = {
        phone: profile.phone,
        address: profile.address,
        company: profile.company,
        position: profile.position
      };
    }

    return mapped;
  }

  mapUserStats(stats, context) {
    if (!stats) {
      return {
        filesUploaded: 0,
        totalUploadSize: 0,
        conversationsJoined: 0,
        messagesCount: 0
      };
    }

    return {
      filesUploaded: stats.filesUploaded || 0,
      totalUploadSize: stats.totalUploadSize || 0,
      formattedUploadSize: this.formatFileSize(stats.totalUploadSize || 0),
      conversationsJoined: stats.conversationsJoined || 0,
      messagesCount: stats.messagesCount || 0,
      lastUpload: stats.lastUpload ? stats.lastUpload.toISOString() : null,
      
      // Statistiques par période (propriétaire/admin)
      ...(context.isOwner || context.isAdmin) && {
        byPeriod: stats.byPeriod || {}
      }
    };
  }

  mapUserQuota(quota, context) {
    if (!quota) {
      return {
        maxStorage: 0,
        usedStorage: 0,
        availableStorage: 0,
        percentUsed: 0
      };
    }

    const maxStorage = quota.maxStorage || 0;
    const usedStorage = quota.usedStorage || 0;
    const availableStorage = Math.max(0, maxStorage - usedStorage);
    const percentUsed = maxStorage > 0 ? (usedStorage / maxStorage) * 100 : 0;

    return {
      maxStorage,
      usedStorage,
      availableStorage,
      formattedMaxStorage: this.formatFileSize(maxStorage),
      formattedUsedStorage: this.formatFileSize(usedStorage),
      formattedAvailableStorage: this.formatFileSize(availableStorage),
      percentUsed: Math.round(percentUsed * 100) / 100,
      
      // Limites détaillées (propriétaire/admin)
      ...(context.isOwner || context.isAdmin) && {
        limits: {
          maxFileSize: quota.maxFileSize || 0,
          maxFilesPerConversation: quota.maxFilesPerConversation || 0,
          allowedMimeTypes: quota.allowedMimeTypes || [],
          dailyUploadLimit: quota.dailyUploadLimit || 0
        }
      }
    };
  }

  mapAdminInfo(user, context) {
    return {
      role: user.role || 'user',
      isAdmin: user.isAdmin || false,
      isSuspended: user.isSuspended || false,
      suspendedAt: user.suspendedAt ? user.suspendedAt.toISOString() : null,
      suspendedBy: user.suspendedBy,
      suspensionReason: user.suspensionReason,
      loginCount: user.loginCount || 0,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      lastLoginIP: user.lastLoginIP,
      emailVerified: user.emailVerified || false,
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null
    };
  }

  // Versions spécialisées

  toPublicDto(user) {
    // Version publique minimale
    return {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      isActive: user.isActive !== undefined ? user.isActive : true
    };
  }

  toContactDto(user, relationship = null) {
    // Version pour les listes de contacts
    const dto = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      isActive: user.isActive !== undefined ? user.isActive : true,
      lastActivity: user.lastActivity ? user.lastActivity.toISOString() : null
    };

    if (relationship) {
      dto.relationship = relationship;
    }

    return dto;
  }

  toSearchDto(user, searchScore = 0) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      searchScore,
      highlights: {
        name: user.name,
        email: user.email
      }
    };
  }

  toStatsDto(user) {
    return {
      id: user.id,
      name: user.name,
      stats: this.mapUserStats(user.stats, { includeStats: true }),
      quota: this.mapUserQuota(user.quota, { includeMetadata: true }),
      activity: {
        createdAt: user.createdAt ? user.createdAt.toISOString() : null,
        lastActivity: user.lastActivity ? user.lastActivity.toISOString() : null
      }
    };
  }

  // Sanitizer pour les données sensibles
  sanitizeForLog(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email ? `${user.email.split('@')[0]}@***` : null,
      isActive: user.isActive
    };
  }
}

module.exports = UserMapper;
