/**
 * DTO pour les requêtes de création de conversation
 * CENADI Chat-Files-Service
 */

const Joi = require('joi');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');

class CreateConversationRequest {
  constructor(data) {
    this.participants = data.participants || [];
    this.name = data.name;
    this.type = data.type || 'private';
    this.description = data.description;
    this.settings = data.settings || {};

    this.validate();
  }

  validate() {
    const schema = Joi.object({
      participants: Joi.array().items(Joi.string()).min(1).required().messages({
        'array.min': 'Au moins un participant est requis',
        'any.required': 'La liste des participants est requise'
      }),
      name: Joi.string().when('type', {
        is: 'group',
        then: Joi.string().required().min(1).max(100),
        otherwise: Joi.string().optional().max(100)
      }).messages({
        'string.empty': 'Le nom de la conversation est requis pour les groupes',
        'string.min': 'Le nom doit contenir au moins 1 caractère',
        'string.max': 'Le nom ne peut pas dépasser 100 caractères'
      }),
      type: Joi.string().valid('private', 'group', 'channel').default('private'),
      description: Joi.string().max(500).optional().messages({
        'string.max': 'La description ne peut pas dépasser 500 caractères'
      }),
      settings: Joi.object({
        isPublic: Joi.boolean().default(false),
        allowInvites: Joi.boolean().default(true),
        muteNotifications: Joi.boolean().default(false),
        archiveAfterDays: Joi.number().integer().min(0).optional()
      }).optional()
    });

    const { error } = schema.validate(this, { abortEarly: false });
    
    if (error) {
      const messages = error.details.map(detail => detail.message);
      throw new ValidationException('Données de conversation invalides', messages);
    }
  }

  toPlainObject() {
    return {
      participants: this.participants,
      name: this.name,
      type: this.type,
      description: this.description,
      settings: this.settings
    };
  }
}

module.exports = CreateConversationRequest;
