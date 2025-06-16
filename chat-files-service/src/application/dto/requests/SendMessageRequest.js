/**
 * DTO pour les requêtes d'envoi de message
 * CENADI Chat-Files-Service
 */

const Joi = require('joi');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');

class SendMessageRequest {
  constructor(data) {
    this.conversationId = data.conversationId;
    this.content = data.content;
    this.type = data.type || 'text';
    this.fileId = data.fileId;
    this.replyTo = data.replyTo;
    this.metadata = data.metadata || {};

    this.validate();
  }

  validate() {
    const schema = Joi.object({
      conversationId: Joi.string().required().messages({
        'string.empty': 'L\'ID de conversation est requis',
        'any.required': 'L\'ID de conversation est requis'
      }),
      content: Joi.string().when('type', {
        is: 'file',
        then: Joi.string().optional(),
        otherwise: Joi.string().required().min(1).max(5000)
      }).messages({
        'string.empty': 'Le contenu du message ne peut pas être vide',
        'string.min': 'Le message doit contenir au moins 1 caractère',
        'string.max': 'Le message ne peut pas dépasser 5000 caractères'
      }),
      type: Joi.string().valid('text', 'file', 'image', 'video', 'audio', 'document').default('text'),
      fileId: Joi.string().when('type', {
        is: 'file',
        then: Joi.string().required(),
        otherwise: Joi.string().optional()
      }).messages({
        'any.required': 'L\'ID du fichier est requis pour les messages de type fichier'
      }),
      replyTo: Joi.string().optional(),
      metadata: Joi.object().optional()
    });

    const { error } = schema.validate(this, { abortEarly: false });
    
    if (error) {
      const messages = error.details.map(detail => detail.message);
      throw new ValidationException('Données de message invalides', messages);
    }
  }

  toPlainObject() {
    return {
      conversationId: this.conversationId,
      content: this.content,
      type: this.type,
      fileId: this.fileId,
      replyTo: this.replyTo,
      metadata: this.metadata
    };
  }
}

module.exports = SendMessageRequest;
