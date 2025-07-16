const Joi = require('joi');

/**
 * Visibility Validator
 */
const VisibilityValidator = {
  searchUnits: Joi.object({
    ministry: Joi.string().required().min(3).messages({
      'string.empty': 'Ministry name is required',
      'string.min': 'Ministry name must be at least 3 characters'
    }),
    query: Joi.string().optional().allow('').max(100)
  }),

  attachAgent: Joi.object({
    matricule: Joi.string().pattern(/^[0-9]{6}[A-Za-z]$/).required().messages({
      'string.pattern.base': 'Matricule must be 6 digits followed by 1 letter'
    }),
    unitId: Joi.string().required().min(3).messages({
      'string.empty': 'Unit ID is required'
    }),
    rank: Joi.string().required().min(3).messages({
      'string.empty': 'Rank is required'
    })
  }),

  searchAgents: Joi.object({
    query: Joi.string().required().min(2).max(100).messages({
      'string.min': 'Search query must be at least 2 characters',
      'string.empty': 'Search query is required'
    }),
    rank: Joi.string().required().messages({
      'string.empty': 'Current agent rank is required'
    })
  })
};

module.exports = VisibilityValidator;