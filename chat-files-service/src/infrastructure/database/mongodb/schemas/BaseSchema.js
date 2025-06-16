/**
 * Schéma de base MongoDB
 * CENADI Chat-Files-Service
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const baseOptions = {
  timestamps: true, // Ajoute automatiquement createdAt et updatedAt
  versionKey: '__v',
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
};

const baseFields = {
  // Champs de base pour tous les documents
  status: {
    type: String,
    enum: ['active', 'inactive', 'deleted', 'archived'],
    default: 'active',
    index: true
  },
  
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },

  version: {
    type: Number,
    default: 1
  },

  // Champs d'audit
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },

  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
};

// Plugin pour ajouter des méthodes communes
function basePlugin(schema) {
  // Ajouter les champs de base
  schema.add(baseFields);

  // Index sur les timestamps
  schema.index({ createdAt: -1 });
  schema.index({ updatedAt: -1 });
  schema.index({ status: 1, createdAt: -1 });

  // Middleware pre-save
  schema.pre('save', function(next) {
    // Incrémenter la version lors de la mise à jour
    if (this.isModified() && !this.isNew) {
      this.version = (this.version || 1) + 1;
    }
    
    // Mettre à jour updatedAt manuellement si nécessaire
    if (this.isModified() && !this.isModified('updatedAt')) {
      this.updatedAt = new Date();
    }

    next();
  });

  // Middleware pre-update
  schema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function() {
    this.set({ updatedAt: new Date() });
  });

  // Méthodes d'instance
  schema.methods.softDelete = function(deletedBy = null) {
    this.status = 'deleted';
    this.deletedAt = new Date();
    if (deletedBy) {
      this.deletedBy = deletedBy;
    }
    return this.save();
  };

  schema.methods.restore = function() {
    this.status = 'active';
    this.deletedAt = undefined;
    this.deletedBy = undefined;
    return this.save();
  };

  schema.methods.archive = function(archivedBy = null) {
    this.status = 'archived';
    this.archivedAt = new Date();
    if (archivedBy) {
      this.archivedBy = archivedBy;
    }
    return this.save();
  };

  schema.methods.isActive = function() {
    return this.status === 'active';
  };

  schema.methods.isDeleted = function() {
    return this.status === 'deleted';
  };

  schema.methods.isArchived = function() {
    return this.status === 'archived';
  };

  // Méthodes statiques
  schema.statics.findActive = function(conditions = {}) {
    return this.find({ ...conditions, status: { $ne: 'deleted' } });
  };

  schema.statics.findDeleted = function(conditions = {}) {
    return this.find({ ...conditions, status: 'deleted' });
  };

  schema.statics.findArchived = function(conditions = {}) {
    return this.find({ ...conditions, status: 'archived' });
  };

  // Query helpers
  schema.query.active = function() {
    return this.where({ status: { $ne: 'deleted' } });
  };

  schema.query.deleted = function() {
    return this.where({ status: 'deleted' });
  };

  schema.query.recent = function(days = 7) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return this.where({ createdAt: { $gte: date } });
  };
}

module.exports = {
  baseOptions,
  baseFields,
  basePlugin
};
