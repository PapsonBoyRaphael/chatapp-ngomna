/**
 * Value Object : FileName
 * CENADI Chat-Files-Service
 */

const ValueObject = require('./ValueObject');
const { ValidationException } = require('../../shared/exceptions/ValidationException');
const path = require('path');

class FileName extends ValueObject {
  static MAX_LENGTH = 255;
  static FORBIDDEN_CHARS = ['<', '>', ':', '"', '|', '?', '*', '\\', '/'];
  static FORBIDDEN_NAMES = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  constructor(filename) {
    super(filename);
  }

  validate() {
    if (!this.value || typeof this.value !== 'string') {
      throw new ValidationException('Nom de fichier requis');
    }

    const trimmedName = this.value.trim();
    
    if (trimmedName.length === 0) {
      throw new ValidationException('Nom de fichier ne peut pas être vide');
    }

    if (trimmedName.length > FileName.MAX_LENGTH) {
      throw new ValidationException(`Nom de fichier trop long (${FileName.MAX_LENGTH} caractères maximum)`);
    }

    // Vérifier les caractères interdits
    for (const forbiddenChar of FileName.FORBIDDEN_CHARS) {
      if (trimmedName.includes(forbiddenChar)) {
        throw new ValidationException(`Caractère interdit dans le nom de fichier: ${forbiddenChar}`);
      }
    }

    // Vérifier les noms réservés Windows
    const nameWithoutExtension = this.getNameWithoutExtension(trimmedName);
    if (FileName.FORBIDDEN_NAMES.includes(nameWithoutExtension.toUpperCase())) {
      throw new ValidationException(`Nom de fichier réservé: ${nameWithoutExtension}`);
    }

    // Ne peut pas commencer ou finir par un point ou un espace
    if (trimmedName.startsWith('.') || trimmedName.endsWith('.') ||
        trimmedName.startsWith(' ') || trimmedName.endsWith(' ')) {
      throw new ValidationException('Nom de fichier ne peut pas commencer ou finir par un point ou un espace');
    }

    // Doit avoir une extension
    if (!this.hasExtension(trimmedName)) {
      throw new ValidationException('Nom de fichier doit avoir une extension');
    }

    this.value = trimmedName;
  }

  hasExtension(filename = this.value) {
    return path.extname(filename).length > 0;
  }

  getExtension() {
    return path.extname(this.value).toLowerCase();
  }

  getNameWithoutExtension(filename = this.value) {
    return path.parse(filename).name;
  }

  getBaseName() {
    return this.getNameWithoutExtension();
  }

  sanitize() {
    let sanitized = this.value;
    
    // Remplacer les caractères interdits par des underscores
    for (const forbiddenChar of FileName.FORBIDDEN_CHARS) {
      sanitized = sanitized.replace(new RegExp(`\\${forbiddenChar}`, 'g'), '_');
    }

    // Limiter la longueur
    if (sanitized.length > FileName.MAX_LENGTH) {
      const extension = path.extname(sanitized);
      const nameWithoutExt = sanitized.substring(0, sanitized.length - extension.length);
      const maxNameLength = FileName.MAX_LENGTH - extension.length;
      sanitized = nameWithoutExt.substring(0, maxNameLength) + extension;
    }

    // Supprimer les espaces en début et fin
    sanitized = sanitized.trim();

    // Remplacer les espaces multiples par un seul
    sanitized = sanitized.replace(/\s+/g, ' ');

    return sanitized;
  }

  generateUniqueFilename(suffix = null) {
    const extension = this.getExtension();
    const baseName = this.getBaseName();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    
    let uniqueName;
    if (suffix) {
      uniqueName = `${baseName}_${suffix}_${timestamp}_${random}${extension}`;
    } else {
      uniqueName = `${baseName}_${timestamp}_${random}${extension}`;
    }

    return uniqueName;
  }

  isValidImageExtension() {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    return imageExtensions.includes(this.getExtension());
  }

  isValidDocumentExtension() {
    const documentExtensions = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'];
    return documentExtensions.includes(this.getExtension());
  }

  isValidVideoExtension() {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.webm'];
    return videoExtensions.includes(this.getExtension());
  }

  isValidAudioExtension() {
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
    return audioExtensions.includes(this.getExtension());
  }

  getFileType() {
    if (this.isValidImageExtension()) return 'image';
    if (this.isValidDocumentExtension()) return 'document';
    if (this.isValidVideoExtension()) return 'video';
    if (this.isValidAudioExtension()) return 'audio';
    return 'other';
  }

  toString() {
    return this.value;
  }

  toJSON() {
    return {
      filename: this.value,
      baseName: this.getBaseName(),
      extension: this.getExtension(),
      type: this.getFileType(),
      length: this.value.length
    };
  }
}

module.exports = FileName;
