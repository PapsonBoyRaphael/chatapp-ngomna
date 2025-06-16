/**
 * Value Object : ConversationType
 * CENADI Chat-Files-Service
 */

const ValueObject = require('./ValueObject');
const { ValidationException } = require('../../shared/exceptions/ValidationException');

class ConversationType extends ValueObject {
  static TYPES = {
    PRIVATE: 'private',
    GROUP: 'group',
    CHANNEL: 'channel',
    BROADCAST: 'broadcast'
  };

  static SETTINGS = {
    [this.TYPES.PRIVATE]: {
      maxParticipants: 2,
      requiresName: false,
      allowsJoin: false,
      allowsLeave: true,
      allowsInvite: false,
      defaultPermissions: ['read', 'write', 'file_upload']
    },
    [this.TYPES.GROUP]: {
      maxParticipants: 100,
      requiresName: true,
      allowsJoin: true,
      allowsLeave: true,
      allowsInvite: true,
      defaultPermissions: ['read', 'write', 'file_upload', 'invite']
    },
    [this.TYPES.CHANNEL]: {
      maxParticipants: 1000,
      requiresName: true,
      allowsJoin: true,
      allowsLeave: true,
      allowsInvite: true,
      defaultPermissions: ['read', 'write', 'file_upload']
    },
    [this.TYPES.BROADCAST]: {
      maxParticipants: 10000,
      requiresName: true,
      allowsJoin: false,
      allowsLeave: true,
      allowsInvite: false,
      defaultPermissions: ['read']
    }
  };

  constructor(type) {
    super(type);
  }

  validate() {
    if (!this.value || typeof this.value !== 'string') {
      throw new ValidationException('Type de conversation requis');
    }

    const validTypes = Object.values(ConversationType.TYPES);
    if (!validTypes.includes(this.value)) {
      throw new ValidationException(`Type de conversation invalide. Types valides: ${validTypes.join(', ')}`);
    }
  }

  isPrivate() {
    return this.value === ConversationType.TYPES.PRIVATE;
  }

  isGroup() {
    return this.value === ConversationType.TYPES.GROUP;
  }

  isChannel() {
    return this.value === ConversationType.TYPES.CHANNEL;
  }

  isBroadcast() {
    return this.value === ConversationType.TYPES.BROADCAST;
  }

  allowsMultipleParticipants() {
    return !this.isPrivate();
  }

  requiresName() {
    return ConversationType.SETTINGS[this.value].requiresName;
  }

  allowsJoin() {
    return ConversationType.SETTINGS[this.value].allowsJoin;
  }

  allowsLeave() {
    return ConversationType.SETTINGS[this.value].allowsLeave;
  }

  allowsInvite() {
    return ConversationType.SETTINGS[this.value].allowsInvite;
  }

  getMaxParticipants() {
    return ConversationType.SETTINGS[this.value].maxParticipants;
  }

  getDefaultPermissions() {
    return ConversationType.SETTINGS[this.value].defaultPermissions;
  }

  canHaveParticipants(count) {
    return count <= this.getMaxParticipants();
  }

  isReadOnly() {
    return this.isBroadcast();
  }

  allowsFileUpload() {
    const permissions = this.getDefaultPermissions();
    return permissions.includes('file_upload');
  }

  allowsMessaging() {
    const permissions = this.getDefaultPermissions();
    return permissions.includes('write');
  }

  getDisplayName() {
    const displayNames = {
      [ConversationType.TYPES.PRIVATE]: 'Conversation privée',
      [ConversationType.TYPES.GROUP]: 'Groupe',
      [ConversationType.TYPES.CHANNEL]: 'Canal',
      [ConversationType.TYPES.BROADCAST]: 'Diffusion'
    };
    
    return displayNames[this.value] || this.value;
  }

  toString() {
    return this.value;
  }

  toJSON() {
    return {
      type: this.value,
      displayName: this.getDisplayName(),
      settings: ConversationType.SETTINGS[this.value],
      isPrivate: this.isPrivate(),
      allowsMultipleParticipants: this.allowsMultipleParticipants(),
      isReadOnly: this.isReadOnly()
    };
  }
}

module.exports = ConversationType;
