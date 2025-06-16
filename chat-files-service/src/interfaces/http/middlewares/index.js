/**
 * Middlewares Index - Chat Files Service
 * CENADI Chat-Files-Service
 * Export centralisé de tous les middlewares
 */

const AuthMiddleware = require('./auth.middleware');
const UploadMiddleware = require('./upload.middleware');
const RateLimitMiddleware = require('./rateLimit.middleware');
const ValidationMiddleware = require('./validation.middleware');
const CorsMiddleware = require('./cors.middleware');
const ErrorHandlerMiddleware = require('./errorHandler.middleware');

module.exports = {
  AuthMiddleware,
  UploadMiddleware,
  RateLimitMiddleware,
  ValidationMiddleware,
  CorsMiddleware,
  ErrorHandlerMiddleware
};
