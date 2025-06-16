/**
 * Schéma MongoDB : Conversation
 * CENADI Chat-Files-Service
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { baseOptions, basePlugin } = require('./BaseSchema');

// Sous-schéma pour les participants
const participantSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['owner', 'admin', 'moderator', 'member'],
    default: 'member'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  addedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  // Préférences du participant
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date,
    default: null
  },
  isMuted: {
    type: Boolean,
    default: false
  },
  mutedAt: {
    type: Date,
    default: null
  },
  mutedUntil: {
    type: Date,
    default: null
  },
  lastReadAt: {
    type: Date,
    default: Date.now
  },
  // Permissions spécifiques
  permissions: [{
    type: String,
    enum: [
      'read', 'write', 'invite', 'remove_participants',
      'edit_info', 'delete_messages', 'pin_messages'
    ]
  }]
}, { _id: false });

// Sous-schéma pour les paramètres de conversation
const settingsSchema = new Schema({
  // Paramètres généraux
  allowFileUpload: {
    type: Boolean,
    default: true
  },
  maxFileSize: {
    type: Number,
    default: 100 * 1024 * 1024 // 100MB
  },
  allowedFileTypes: [{
    type: String,
    enum: ['image', 'document', 'video', 'audio', 'other']
  }],
  
  // Modération
  moderationEnabled: {
    type: Boolean,
    default: false
  },
  autoModeration: {
    type: Boolean,
    default: false
  },
  
  // Notifications
  muteAll: {
    type: Boolean,
    default: false
  },
  
  // Rétention des messages
  messageRetentionDays: {
    type: Number,
    default: null // null = pas de limite
  },
  
  // Permissions par défaut pour nouveaux membres
  defaultPermissions: [{
    type: String,
    enum: [
      'read', 'write', 'invite', 'remove_participants',
      'edit_info', 'delete_messages', 'pin_messages'
    ],
    default: ['read', 'write']
  }]
}, { _id: false });

const conversationSchema = new Schema({
  // Informations de base
  name: {
    type: String,
    required: function() {
      return this.type !== 'private';
    },
    trim: true,
    maxlength: [100, 'Nom de conversation trop long']
  },

  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description trop longue'],
    default: ''
  },

  type: {
    type: String,
    enum: ['private', 'group', 'channel', 'broadcast'],
    required: [true, 'Type de conversation requis'],
    index: true
  },

  // Avatar de la conversation
  avatar: {
    url: {
      type: String,
      default: null
    },
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      default: null
    }
  },

  // Participants
  participants: {
    type: [participantSchema],
    validate: {
      validator: function(participants) {
        // Conversations privées : exactement 2 participants
        if (this.type === 'private') {
          return participants.length === 2;
        }
        // Autres types : au moins 1 participant
        return participants.length >= 1;
      },
      message: 'Nombre de participants invalide pour ce type de conversation'
    }
  },

  // Propriétaire/Créateur
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Paramètres
  settings: {
    type: settingsSchema,
    default: () => ({})
  },

  // Activité
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },

  lastMessage: {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    content: {
      type: String,
      default: null
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    sentAt: {
      type: Date,
      default: null
    },
    type: {
      type: String,
      default: 'text'
    }
  },

  // Statistiques
  stats: {
    messageCount: {
      type: Number,
      default: 0,
      min: 0
    },
    fileCount: {
      type: Number,
      default: 0,
      min: 0
    },
    participantCount: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  // État
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },

  archivedAt: {
    type: Date,
    default: null
  },

  archivedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  ...baseOptions,
  collection: 'conversations'
});

// Appliquer le plugin de base
conversationSchema.plugin(basePlugin);

// Index composites
conversationSchema.index({ type: 1, status: 1 });
conversationSchema.index({ owner: 1, type: 1 });
conversationSchema.index({ 'participants.userId': 1, type: 1 });
conversationSchema.index({ lastActivity: -1, type: 1 });
conversationSchema.index({ createdAt: -1 });

// Index unique pour conversations privées
conversationSchema.index(
  { 'participants.userId': 1, type: 1 },
  { 
    unique: true,
    partialFilterExpression: { type: 'private' }
  }
);

// Index de recherche textuelle
conversationSchema.index({
  name: 'text',
  description: 'text'
});

// Méthodes virtuelles
conversationSchema.virtual('participantCount').get(function() {
  return this.participants.length;
});

conversationSchema.virtual('isPrivate').get(function() {
  return this.type === 'private';
});

conversationSchema.virtual('isGroup').get(function() {
  return this.type === 'group';
});

conversationSchema.virtual('isChannel').get(function() {
  return this.type === 'channel';
});

conversationSchema.virtual('isBroadcast').get(function() {
  return this.type === 'broadcast';
});

// Méthodes d'instance
conversationSchema.methods.isParticipant = function(userId) {
  return this.participants.some(p => p.userId.toString() === userId.toString());
};

conversationSchema.methods.getParticipant = function(userId) {
  return this.participants.find(p => p.userId.toString() === userId.toString());
};

conversationSchema.methods.isAdmin = function(userId) {
  const participant = this.getParticipant(userId);
  return participant && ['owner', 'admin'].includes(participant.role);
};

conversationSchema.methods.isModerator = function(userId) {
  const participant = this.getParticipant(userId);
  return participant && ['owner', 'admin', 'moderator'].includes(participant.role);
};

conversationSchema.methods.canUserWrite = function(userId) {
  const participant = this.getParticipant(userId);
  if (!participant) return false;
  
  // Pour les broadcasts, seuls les admins peuvent écrire
  if (this.type === 'broadcast') {
    return ['owner', 'admin'].includes(participant.role);
  }
  
  return participant.permissions.includes('write');
};

conversationSchema.methods.addParticipant = function(userId, addedBy, role = 'member') {
  if (this.isParticipant(userId)) {
    throw new Error('Utilisateur déjà participant');
  }

  this.participants.push({
    userId,
    role,
    addedBy,
    joinedAt: new Date(),
    permissions: this.settings.defaultPermissions || ['read', 'write']
  });

  this.stats.participantCount = this.participants.length;
  return this.save();
};

conversationSchema.methods.removeParticipant = function(userId) {
  const index = this.participants.findIndex(p => p.userId.toString() === userId.toString());
  if (index === -1) {
    throw new Error('Utilisateur non participant');
  }

  this.participants.splice(index, 1);
  this.stats.participantCount = this.participants.length;
  return this.save();
};

conversationSchema.methods.updateLastActivity = function(messageData = null) {
  this.lastActivity = new Date();
  
  if (messageData) {
    this.lastMessage = {
      messageId: messageData.id,
      content: messageData.content,
      senderId: messageData.senderId,
      sentAt: messageData.createdAt,
      type: messageData.type
    };
  }
  
  return this.save();
};

conversationSchema.methods.incrementMessageCount = function() {
  this.stats.messageCount += 1;
  return this.save();
};

conversationSchema.methods.incrementFileCount = function() {
  this.stats.fileCount += 1;
  return this.save();
};

conversationSchema.methods.markAsReadByUser = function(userId) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.lastReadAt = new Date();
    return this.save();
  }
  throw new Error('Utilisateur non participant');
};

conversationSchema.methods.muteForUser = function(userId, mutedUntil = null) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.isMuted = true;
    participant.mutedAt = new Date();
    participant.mutedUntil = mutedUntil;
    return this.save();
  }
  throw new Error('Utilisateur non participant');
};

conversationSchema.methods.unmuteForUser = function(userId) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.isMuted = false;
    participant.mutedAt = null;
    participant.mutedUntil = null;
    return this.save();
  }
  throw new Error('Utilisateur non participant');
};

conversationSchema.methods.archiveForUser = function(userId) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.isArchived = true;
    participant.archivedAt = new Date();
    return this.save();
  }
  throw new Error('Utilisateur non participant');
};

conversationSchema.methods.unarchiveForUser = function(userId) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.isArchived = false;
    participant.archivedAt = null;
    return this.save();
  }
  throw new Error('Utilisateur non participant');
};

// Méthodes statiques
conversationSchema.statics.findByParticipant = function(userId, options = {}) {
  const query = {
    'participants.userId': userId,
    status: { $ne: 'deleted' }
  };

  if (options.type) {
    query.type = options.type;
  }

  let findQuery = this.find(query);

  if (options.populate) {
    findQuery = findQuery.populate(options.populate);
  }

  return findQuery.sort({ lastActivity: -1 });
};

conversationSchema.statics.findPrivateConversation = function(userId1, userId2) {
  return this.findOne({
    type: 'private',
    'participants.userId': { $all: [userId1, userId2] },
    status: { $ne: 'deleted' }
  });
};

conversationSchema.statics.searchConversations = function(query, userId, limit = 20) {
  return this.find({
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
  })
  .sort({ lastActivity: -1 })
  .limit(limit);
};

// Hooks
conversationSchema.pre('save', function(next) {
  // Mettre à jour le nombre de participants
  if (this.isModified('participants')) {
    this.stats.participantCount = this.participants.length;
  }

  // Valider le type de conversation
  if (this.type === 'private' && this.participants.length !== 2) {
    return next(new Error('Une conversation privée doit avoir exactement 2 participants'));
  }

  next();
});

conversationSchema.pre('remove', function(next) {
  // TODO: Nettoyer les messages associés
  next();
});

module.exports = mongoose.model('Conversation', conversationSchema);
