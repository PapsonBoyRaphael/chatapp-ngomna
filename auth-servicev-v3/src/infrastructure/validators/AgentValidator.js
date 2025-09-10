const Joi = require('joi');

/**
 * Agent Validator
 * 
 * Why use Joi?
 * - Declarative validation schema
 * - Comprehensive error messages
 * - Easy to maintain and extend
 * - Consistent validation across the application
 */
const AgentValidator = {
  matricule: Joi.object({
    matricule: Joi.string()
      .pattern(/^[0-9]{6}[A-Za-z]$/)
      .required()
      .messages({
        'string.pattern.base': 'Matricule must be 6 digits followed by 1 letter (e.g., 010204B)',
        'any.required': 'Matricule is required'
      })
  })
};

module.exports = AgentValidator;