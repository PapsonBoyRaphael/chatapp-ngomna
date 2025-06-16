/**
 * Schéma MongoDB : Message
 * CENADI Chat-Files-Service
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { baseOptions, basePlugin } = require('./BaseSchema');

// Sous-schéma pour les réactions
const reactionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  emoji: {
    type: String,
    required: true,
    maxlength: 10
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Sous-schéma pour les mentions
const mentionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  startIndex: {
    type: Number,
    required: true
  },
  length: {
    type: Number,
    required: true
  }
}, { _id: false });

// Sous-schéma pour l'historique d'édition
const editHistorySchema = new Schema({
  content: {
    type: String,
    required: true
  },
  editedAt: {
    type: Date,
    default: Date.now
  },
  editedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { _id: false });

// Sous-schéma pour les statuts de lecture
const readStatusSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  readAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const messageSchema = new Schema({
  // Informations de base
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: [true, 'ID de conversation requis'],
    index: true
  },

  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'ID d\'expéditeur requis'],
    index: true
  },

  // Contenu
  content: {
    type: String,
    required: function() {
      return !this.fileId && this.type === 'text';
    },
    trim: true,
    maxlength: [10000, 'Message trop long']
  },

  type: {
    type: String,
    enum: ['text', 'file', 'image', 'video', 'audio', 'system'],
    default: 'text',
    index: true
  },

  // Fichier attaché
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'File',
    default: null,
    index: true
  },

  // Réponse à un message
  replyToId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
    index: true
  },

  replyTo: {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message'
    },
    content: {
      type: String
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    senderName: {
      type: String
    }
  },

  // Thread/Fil de discussion
  threadId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
    index: true
  },

  // Statuts
  isEdited: {
    type: Boolean,
    default: false,
    index: true
  },

  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: {
    type: Date,
    default: null
  },

  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  deleteReason: {
    type: String,
    default: null
  },

  isPinned: {
    type: Boolean,
    default: false,
    index: true
  },

  pinnedAt: {
    type: Date,
    default: null
  },

  pinnedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Statuts de livraison
  isDelivered: {
    type: Boolean,
    default: false
  },

  deliveredAt: {
    type: Date,
    default: null
  },

  // Réactions
  reactions: [reactionSchema],

  // Mentions
  mentions: [mentionSchema],

  // Historique d'édition
  editHistory: [editHistorySchema],

  // Statuts de lecture
  readBy: [readStatusSchema],

  // Métadonnées du message
  messageMetadata: {
    // Informations système
    systemMessageType: {
      type: String,
      enum: [
        'user_joined', 'user_left', 'user_added', 'user_removed',
        'conversation_created', 'conversation_renamed', 'conversation_archived',
        'file_uploaded', 'message_pinned', 'message_unpinned'
      ],
      default: null
    },

    // Données pour messages système
    systemData: {
      type: Schema.Types.Mixed,
      default: null
    },

    // URL détectées
    urls: [{
      url: String,
      title: String,
      description: String,
      image: String,
      domain: String
    }],

    // Hashtags
    hashtags: [String],

    // Informations de localisation
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    }
  },

  // Statistiques
  stats: {
    reactionCount: {
      type: Number,
      default: 0,
      min: 0
    },
    replyCount: {
      type: Number,
      default: 0,
      min: 0
    },
    readCount: {
      type: Number,
      default: 0,
      min: 0
    }
  }
}, {
  ...baseOptions,
  collection: 'messages'
});

// Appliquer le plugin de base
messageSchema.plugin(basePlugin);

// Index composites
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, type: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ replyToId: 1, createdAt: -1 });
messageSchema.index({ threadId: 1, createdAt: -1 });
messageSchema.index({ fileId: 1 });
messageSchema.index({ isPinned: 1, conversationId: 1 });
messageSchema.index({ isDeleted: 1, conversationId: 1 });

// Index pour la recherche
messageSchema.index({
  content: 'text',
  'messageMetadata.hashtags': 'text'
});

// Index pour mentions
messageSchema.index({ 'mentions.userId': 1, createdAt: -1 });

// Méthodes virtuelles
messageSchema.virtual('isReply').get(function() {
  return !!this.replyToId;
});

messageSchema.virtual('isThread').get(function() {
  return !!this.threadId;
});

messageSchema.virtual('isSystemMessage').get(function() {
  return this.type === 'system';
});

messageSchema.virtual('hasFile').get(function() {
  return !!this.fileId;
});

messageSchema.virtual('isMediaMessage').get(function() {
  return ['image', 'video', 'audio'].includes(this.type);
});

// Méthodes d'instance
messageSchema.methods.addReaction = function(userId, emoji) {
  // Supprimer la réaction existante de l'utilisateur
  this.reactions = this.reactions.filter(r => r.userId.toString() !== userId.toString());
  
  // Ajouter la nouvelle réaction
  this.reactions.push({
    userId,
    emoji,
    addedAt: new Date()
  });

  this.stats.reactionCount = this.reactions.length;
  return this.save();
};

messageSchema.methods.removeReaction = function(userId) {
  const initialLength = this.reactions.length;
  this.reactions = this.reactions.filter(r => r.userId.toString() !== userId.toString());
  
  if (this.reactions.length !== initialLength) {
    this.stats.reactionCount = this.reactions.length;
    return this.save();
  }
  
  return Promise.resolve(this);
};

messageSchema.methods.markAsRead = function(userId) {
  // Vérifier si déjà lu
  const existingRead = this.readBy.find(r => r.userId.toString() === userId.toString());
  if (existingRead) {
    return Promise.resolve(this);
  }

  this.readBy.push({
    userId,
    readAt: new Date()
  });

  this.stats.readCount = this.readBy.length;
  return this.save();
};

messageSchema.methods.editContent = function(newContent, editedBy) {
  if (this.isDeleted) {
    throw new Error('Impossible d\'éditer un message supprimé');
  }

  // Sauvegarder l'ancien contenu dans l'historique
  this.editHistory.push({
    content: this.content,
    editedAt: new Date(),
    editedBy: editedBy
  });

  this.content = newContent;
  this.isEdited = true;
  this.updatedAt = new Date();

  return this.save();
};

messageSchema.methods.softDelete = function(deletedBy, reason = 'user_request') {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.deleteReason = reason;
  return this.save();
};

messageSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  this.deleteReason = null;
  return this.save();
};

messageSchema.methods.pin = function(pinnedBy) {
  this.isPinned = true;
  this.pinnedAt = new Date();
  this.pinnedBy = pinnedBy;
  return this.save();
};

messageSchema.methods.unpin = function() {
  this.isPinned = false;
  this.pinnedAt = null;
  this.pinnedBy = null;
  return this.save();
};

messageSchema.methods.addMention = function(userId, username, startIndex, length) {
  this.mentions.push({
    userId,
    username,
    startIndex,
    length
  });
  return this.save();
};

messageSchema.methods.extractMentions = function() {
  if (!this.content) return [];

  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;

  while ((match = mentionRegex.exec(this.content)) !== null) {
    mentions.push({
      username: match[1],
      startIndex: match.index,
      length: match[0].length
    });
  }

  return mentions;
};

messageSchema.methods.extractHashtags = function() {
  if (!this.content) return [];

  const hashtagRegex = /#(\w+)/g;
  const hashtags = [];
  let match;

  while ((match = hashtagRegex.exec(this.content)) !== null) {
    hashtags.push(match[1]);
  }

  return hashtags;
};

messageSchema.methods.extractUrls = function() {
  if (!this.content) return [];

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = [];
  let match;

  while ((match = urlRegex.exec(this.content)) !== null) {
    urls.push(match[1]);
  }

  return urls;
};

// Méthodes statiques
messageSchema.statics.findByConversation = function(conversationId, options = {}) {
  const query = {
    conversationId,
    isDeleted: false
  };

  if (options.type) {
    query.type = options.type;
  }

  let findQuery = this.find(query);

  if (options.populate) {
    findQuery = findQuery.populate(options.populate);
  }

  const sort = options.sort || { createdAt: -1 };
  findQuery = findQuery.sort(sort);

  if (options.limit) {
    findQuery = findQuery.limit(options.limit);
  }

  if (options.skip) {
    findQuery = findQuery.skip(options.skip);
  }

  return findQuery;
};

messageSchema.statics.findBySender = function(senderId, options = {}) {
  return this.find({
    senderId,
    isDeleted: false,
    ...options.filters
  })
  .sort({ createdAt: -1 })
  .limit(options.limit || 50);
};

messageSchema.statics.findReplies = function(messageId, options = {}) {
  return this.find({
    replyToId: messageId,
    isDeleted: false
  })
  .sort({ createdAt: 1 })
  .limit(options.limit || 50);
};

messageSchema.statics.findByThread = function(threadId, options = {}) {
  return this.find({
    threadId,
    isDeleted: false
  })
  .sort({ createdAt: 1 })
  .limit(options.limit || 100);
};

messageSchema.statics.searchInConversation = function(conversationId, query, options = {}) {
  return this.find({
    conversationId,
    isDeleted: false,
    $text: { $search: query }
  }, {
    score: { $meta: 'textScore' }
  })
  .sort({ score: { $meta: 'textScore' } })
  .limit(options.limit || 20);
};

messageSchema.statics.findMentions = function(userId, options = {}) {
  return this.find({
    'mentions.userId': userId,
    isDeleted: false
  })
  .sort({ createdAt: -1 })
  .limit(options.limit || 50);
};

messageSchema.statics.findPinnedMessages = function(conversationId) {
  return this.find({
    conversationId,
    isPinned: true,
    isDeleted: false
  })
  .sort({ pinnedAt: -1 });
};

// Hooks
messageSchema.pre('save', function(next) {
  // Extraire automatiquement mentions et hashtags
  if (this.isModified('content') && this.content) {
    this.messageMetadata.hashtags = this.extractHashtags();
  }

  // Marquer comme livré si c'est un nouveau message
  if (this.isNew) {
    this.isDelivered = true;
    this.deliveredAt = new Date();
  }

  next();
});

messageSchema.pre('remove', function(next) {
  // TODO: Nettoyer les références et fichiers associés
  next();
});

module.exports = mongoose.model('Message', messageSchema);
