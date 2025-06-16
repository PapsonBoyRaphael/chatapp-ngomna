/**
 * Utils Index - Chat Files Service
 * CENADI Chat-Files-Service
 * Export centralisé des utilitaires
 */

const { createLogger, Logger, defaultLogger } = require('./logger');
const Validator = require('./validator');
const FileHelper = require('./fileHelper');
const cryptoHelper = require('./cryptoHelper');
const DateHelper = require('./dateHelper');
const { HTTPClient, httpClient } = require('./httpClient');

module.exports = {
  // Logger
  createLogger,
  Logger,
  defaultLogger,
  
  // Validation
  Validator,
  
  // Gestion fichiers
  FileHelper,
  
  // Cryptographie
  cryptoHelper,
  
  // Dates
  DateHelper,
  
  // HTTP Client
  HTTPClient,
  httpClient
};
