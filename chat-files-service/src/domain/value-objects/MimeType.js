/**
 * Value Object : MimeType
 * CENADI Chat-Files-Service
 */

const ValueObject = require('./ValueObject');
const { ValidationException } = require('../../shared/exceptions/ValidationException');

class MimeType extends ValueObject {
  static TYPES = {
    IMAGE: {
      'image/jpeg': { extension: '.jpg', category: 'image' },
      'image/png': { extension: '.png', category: 'image' },
      'image/gif': { extension: '.gif', category: 'image' },
      'image/webp': { extension: '.webp', category: 'image' },
      'image/bmp': { extension: '.bmp', category: 'image' },
      'image/svg+xml': { extension: '.svg', category: 'image' }
    },
    DOCUMENT: {
      'application/pdf': { extension: '.pdf', category: 'document' },
      'application/msword': { extension: '.doc', category: 'document' },
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: '.docx', category: 'document' },
      'text/plain': { extension: '.txt', category: 'document' },
      'text/rtf': { extension: '.rtf', category: 'document' },
      'application/vnd.oasis.opendocument.text': { extension: '.odt', category: 'document' }
    },
    VIDEO: {
      'video/mp4': { extension: '.mp4', category: 'video' },
      'video/quicktime': { extension: '.mov', category: 'video' },
      'video/x-msvideo': { extension: '.avi', category: 'video' },
      'video/webm': { extension: '.webm', category: 'video' },
      'video/x-ms-wmv': { extension: '.wmv', category: 'video' }
    },
    AUDIO: {
      'audio/mpeg': { extension: '.mp3', category: 'audio' },
      'audio/wav': { extension: '.wav', category: 'audio' },
      'audio/ogg': { extension: '.ogg', category: 'audio' },
      'audio/mp4': { extension: '.m4a', category: 'audio' },
      'audio/flac': { extension: '.flac', category: 'audio' }
    }
  };

  static FORBIDDEN_TYPES = [
    'application/x-executable',
    'application/x-msdownload',
    'application/x-msdos-program',
    'application/x-sh',
    'application/javascript',
    'text/javascript'
  ];

  constructor(mimeType) {
    super(mimeType);
  }

  validate() {
    if (!this.value || typeof this.value !== 'string') {
      throw new ValidationException('Type MIME requis');
    }

    const normalizedType = this.value.toLowerCase().trim();
    
    if (normalizedType.length === 0) {
      throw new ValidationException('Type MIME ne peut pas être vide');
    }

    // Vérifier le format basique du MIME type
    const mimeRegex = /^[a-z]+\/[a-z0-9][a-z0-9\-\.\+]*$/;
    if (!mimeRegex.test(normalizedType)) {
      throw new ValidationException('Format de type MIME invalide');
    }

    // Vérifier les types interdits
    if (MimeType.FORBIDDEN_TYPES.includes(normalizedType)) {
      throw new ValidationException('Type de fichier non autorisé');
    }

    this.value = normalizedType;
  }

  getCategory() {
    for (const [categoryName, types] of Object.entries(MimeType.TYPES)) {
      if (types[this.value]) {
        return types[this.value].category;
      }
    }
    return 'other';
  }

  getExpectedExtension() {
    for (const types of Object.values(MimeType.TYPES)) {
      if (types[this.value]) {
        return types[this.value].extension;
      }
    }
    return null;
  }

  isImage() {
    return this.getCategory() === 'image';
  }

  isDocument() {
    return this.getCategory() === 'document';
  }

  isVideo() {
    return this.getCategory() === 'video';
  }

  isAudio() {
    return this.getCategory() === 'audio';
  }

  isMedia() {
    return this.isImage() || this.isVideo() || this.isAudio();
  }

  isText() {
    return this.value.startsWith('text/');
  }

  isApplication() {
    return this.value.startsWith('application/');
  }

  getAllowedExtensions() {
    const extensions = [];
    for (const types of Object.values(MimeType.TYPES)) {
      if (types[this.value]) {
        extensions.push(types[this.value].extension);
      }
    }
    return extensions;
  }

  isCompatibleWithExtension(extension) {
    const expectedExtension = this.getExpectedExtension();
    return expectedExtension === extension.toLowerCase();
  }

  getMainType() {
    return this.value.split('/')[0];
  }

  getSubType() {
    return this.value.split('/')[1];
  }

  canHaveThumbnail() {
    return this.isImage() || this.isVideo();
  }

  canBeCompressed() {
    return this.isImage() && !this.value.includes('gif');
  }

  requiresVirusScanning() {
    // Documents et applications nécessitent un scan antivirus
    return this.isDocument() || this.isApplication();
  }

  toString() {
    return this.value;
  }

  toJSON() {
    return {
      type: this.value,
      category: this.getCategory(),
      mainType: this.getMainType(),
      subType: this.getSubType(),
      expectedExtension: this.getExpectedExtension(),
      isMedia: this.isMedia(),
      canHaveThumbnail: this.canHaveThumbnail(),
      canBeCompressed: this.canBeCompressed()
    };
  }
}

module.exports = MimeType;
