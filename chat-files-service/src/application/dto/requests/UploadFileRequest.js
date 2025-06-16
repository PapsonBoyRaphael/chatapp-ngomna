/**
 * DTO pour les requêtes d'upload de fichier
 * CENADI Chat-Files-Service
 */

const Joi = require('joi');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { FILE_TYPES, MAX_FILE_SIZE } = require('../../../shared/constants/fileTypes');

class UploadFileRequest {
  constructor(data) {
    this.file = data.file;
    this.conversationId = data.conversationId;
    this.description = data.description;
    this.isPublic = data.isPublic || false;
    this.expiresAt = data.expiresAt;
    this.metadata = data.metadata || {};

    this.validate();
  }

  validate() {
    const schema = Joi.object({
      file: Joi.object().required().messages({
        'any.required': 'Le fichier est requis'
      }),
      conversationId: Joi.string().optional(),
      description: Joi.string().max(200).optional().messages({
        'string.max': 'La description ne peut pas dépasser 200 caractères'
      }),
      isPublic: Joi.boolean().default(false),
      expiresAt: Joi.date().greater('now').optional().messages({
        'date.greater': 'La date d\'expiration doit être dans le futur'
      }),
      metadata: Joi.object().optional()
    });

    const { error } = schema.validate(this, { abortEarly: false });
    
    if (error) {
      const messages = error.details.map(detail => detail.message);
      throw new ValidationException('Données de fichier invalides', messages);
    }

    // Validation spécifique du fichier
    this.validateFile();
  }

  validateFile() {
    if (!this.file) return;

    const { filename, mimetype, file } = this.file;

    // Vérifier le type de fichier
    const allowedTypes = Object.values(FILE_TYPES).flat();
    if (!allowedTypes.includes(mimetype)) {
      throw new ValidationException('Type de fichier non autorisé', [
        `Type ${mimetype} non supporté. Types autorisés: ${allowedTypes.join(', ')}`
      ]);
    }

    // Vérifier la taille (si disponible)
    if (file && file.bytesRead && file.bytesRead > MAX_FILE_SIZE) {
      throw new ValidationException('Fichier trop volumineux', [
        `Taille maximale autorisée: ${MAX_FILE_SIZE / 1024 / 1024}MB`
      ]);
    }

    // Vérifier le nom de fichier
    if (!filename || filename.length > 255) {
      throw new ValidationException('Nom de fichier invalide', [
        'Le nom de fichier ne peut pas dépasser 255 caractères'
      ]);
    }

    // Vérifier les caractères interdits dans le nom
    const forbiddenChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (forbiddenChars.test(filename)) {
      throw new ValidationException('Nom de fichier invalide', [
        'Le nom de fichier contient des caractères interdits'
      ]);
    }
  }

  getFileCategory() {
    if (!this.file || !this.file.mimetype) return 'unknown';

    const mimetype = this.file.mimetype;

    if (FILE_TYPES.images.includes(mimetype)) return 'image';
    if (FILE_TYPES.videos.includes(mimetype)) return 'video';
    if (FILE_TYPES.audio.includes(mimetype)) return 'audio';
    if (FILE_TYPES.documents.includes(mimetype)) return 'document';

    return 'other';
  }

  toPlainObject() {
    return {
      conversationId: this.conversationId,
      description: this.description,
      isPublic: this.isPublic,
      expiresAt: this.expiresAt,
      metadata: {
        ...this.metadata,
        category: this.getFileCategory()
      }
    };
  }
}

module.exports = UploadFileRequest;
