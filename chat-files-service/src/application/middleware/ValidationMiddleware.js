/**
 * Middleware de validation
 * CENADI Chat-Files-Service
 */

const Joi = require('joi');
const { createLogger } = require('../../shared/utils/logger');
const { ValidationException } = require('../../shared/exceptions/ValidationException');

const logger = createLogger('ValidationMiddleware');

class ValidationMiddleware {
  /**
   * Plugin Fastify pour la validation
   */
  static async register(fastify, options) {
    fastify.decorate('validateBody', ValidationMiddleware.validateBody);
    fastify.decorate('validateParams', ValidationMiddleware.validateParams);
    fastify.decorate('validateQuery', ValidationMiddleware.validateQuery);
    fastify.decorate('validateHeaders', ValidationMiddleware.validateHeaders);
  }

  /**
   * Valider le corps de la requête
   */
  static validateBody(schema, options = {}) {
    return async (request, reply) => {
      try {
        const validationOptions = {
          abortEarly: false,
          allowUnknown: options.allowUnknown || false,
          stripUnknown: options.stripUnknown || true,
          ...options
        };

        const { error, value } = schema.validate(request.body, validationOptions);

        if (error) {
          const messages = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));

          throw new ValidationException('Données du corps invalides', messages);
        }

        // Remplacer le body par les données validées
        request.body = value;

        logger.debug('Validation du corps réussie:', { 
          endpoint: request.url,
          method: request.method 
        });

      } catch (error) {
        ValidationMiddleware.handleValidationError(error, reply, 'body');
      }
    };
  }

  /**
   * Valider les paramètres de l'URL
   */
  static validateParams(schema, options = {}) {
    return async (request, reply) => {
      try {
        const validationOptions = {
          abortEarly: false,
          allowUnknown: false,
          stripUnknown: true,
          ...options
        };

        const { error, value } = schema.validate(request.params, validationOptions);

        if (error) {
          const messages = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));

          throw new ValidationException('Paramètres d\'URL invalides', messages);
        }

        request.params = value;

        logger.debug('Validation des paramètres réussie:', { 
          params: value,
          endpoint: request.url 
        });

      } catch (error) {
        ValidationMiddleware.handleValidationError(error, reply, 'params');
      }
    };
  }

  /**
   * Valider les paramètres de requête
   */
  static validateQuery(schema, options = {}) {
    return async (request, reply) => {
      try {
        const validationOptions = {
          abortEarly: false,
          allowUnknown: options.allowUnknown || true,
          stripUnknown: options.stripUnknown || false,
          ...options
        };

        const { error, value } = schema.validate(request.query, validationOptions);

        if (error) {
          const messages = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));

          throw new ValidationException('Paramètres de requête invalides', messages);
        }

        request.query = value;

        logger.debug('Validation de la requête réussie:', { 
          query: value,
          endpoint: request.url 
        });

      } catch (error) {
        ValidationMiddleware.handleValidationError(error, reply, 'query');
      }
    };
  }

  /**
   * Valider les en-têtes
   */
  static validateHeaders(schema, options = {}) {
    return async (request, reply) => {
      try {
        const validationOptions = {
          abortEarly: false,
          allowUnknown: true,
          stripUnknown: false,
          ...options
        };

        const { error, value } = schema.validate(request.headers, validationOptions);

        if (error) {
          const messages = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));

          throw new ValidationException('En-têtes invalides', messages);
        }

        logger.debug('Validation des en-têtes réussie:', { 
          endpoint: request.url 
        });

      } catch (error) {
        ValidationMiddleware.handleValidationError(error, reply, 'headers');
      }
    };
  }

  /**
   * Gérer les erreurs de validation
   */
  static handleValidationError(error, reply, source) {
    logger.warn('Erreur de validation:', { 
      source,
      error: error.message,
      details: error.details 
    });

    const statusCode = error instanceof ValidationException ? 400 : 500;

    reply.status(statusCode).send({
      success: false,
      error: 'Erreur de validation',
      message: error.message,
      details: error.details || [],
      source,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Schémas de validation communs
   */
  static get commonSchemas() {
    return {
      id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
        'string.pattern.base': 'L\'ID doit être un ObjectId MongoDB valide'
      }),
      
      pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
      }),

      dateRange: Joi.object({
        from: Joi.date().iso(),
        to: Joi.date().iso().greater(Joi.ref('from'))
      }),

      search: Joi.object({
        q: Joi.string().min(1).max(100),
        filter: Joi.string().valid('all', 'messages', 'files', 'conversations').default('all')
      })
    };
  }

  /**
   * Créer un middleware de validation combiné
   */
  static validate(schemas = {}) {
    return async (request, reply) => {
      try {
        // Valider les paramètres
        if (schemas.params) {
          await ValidationMiddleware.validateParams(schemas.params)(request, reply);
        }

        // Valider la requête
        if (schemas.query) {
          await ValidationMiddleware.validateQuery(schemas.query)(request, reply);
        }

        // Valider le corps
        if (schemas.body) {
          await ValidationMiddleware.validateBody(schemas.body)(request, reply);
        }

        // Valider les en-têtes
        if (schemas.headers) {
          await ValidationMiddleware.validateHeaders(schemas.headers)(request, reply);
        }

      } catch (error) {
        // L'erreur a déjà été gérée par les middlewares individuels
        return;
      }
    };
  }
}

// Métadonnées pour Fastify
ValidationMiddleware[Symbol.for('skip-override')] = true;

module.exports = ValidationMiddleware;
