/**
 * Logger - Chat Files Service
 * CENADI Chat-Files-Service
 * Système de logging unifié (sans dépendance circulaire)
 */

const winston = require('winston');
const path = require('path');

// Configuration par défaut du logger (sans require de config)
const DEFAULT_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || './logs',
  maxFiles: process.env.LOG_MAX_FILES || 5,
  maxSize: process.env.LOG_MAX_SIZE || '10m',
  colorize: process.env.NODE_ENV !== 'production'
};

// Cache des loggers créés
const loggerCache = new Map();

// Format des logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${service || 'APP'}] ${message}${metaStr}`;
  })
);

// Format console avec couleurs
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const serviceTag = service ? `[${service}]` : '[APP]';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${serviceTag} ${message}${metaStr}`;
  })
);

/**
 * Créer un logger Winston
 */
function createLogger(serviceName = 'APP', options = {}) {
  // Vérifier le cache
  const cacheKey = `${serviceName}_${JSON.stringify(options)}`;
  if (loggerCache.has(cacheKey)) {
    return loggerCache.get(cacheKey);
  }

  // Fusionner avec la config par défaut
  const config = { ...DEFAULT_CONFIG, ...options };

  // Créer les transports
  const transports = [
    // Console
    new winston.transports.Console({
      level: config.level,
      format: DEFAULT_CONFIG.colorize ? consoleFormat : logFormat,
      silent: process.env.NODE_ENV === 'test'
    })
  ];

  // Fichier de logs (seulement si pas en test)
  if (process.env.NODE_ENV !== 'test') {
    try {
      // Créer le dossier de logs s'il n'existe pas
      const fs = require('fs');
      if (!fs.existsSync(config.logDir)) {
        fs.mkdirSync(config.logDir, { recursive: true });
      }

      // Transport fichier pour tous les logs
      transports.push(
        new winston.transports.File({
          filename: path.join(config.logDir, 'app.log'),
          level: config.level,
          format: logFormat,
          maxFiles: config.maxFiles,
          maxsize: config.maxSize,
          tailable: true
        })
      );

      // Transport fichier pour les erreurs uniquement
      transports.push(
        new winston.transports.File({
          filename: path.join(config.logDir, 'error.log'),
          level: 'error',
          format: logFormat,
          maxFiles: config.maxFiles,
          maxsize: config.maxSize,
          tailable: true
        })
      );
    } catch (error) {
      console.warn('⚠️ Impossible de créer les logs fichiers:', error.message);
    }
  }

  // Créer le logger
  const logger = winston.createLogger({
    level: config.level,
    format: logFormat,
    defaultMeta: { service: serviceName },
    transports,
    exitOnError: false
  });

  // Méthodes de convenance
  logger.setLevel = (level) => {
    logger.transports.forEach(transport => {
      transport.level = level;
    });
  };

  logger.addContext = (context) => {
    return logger.child(context);
  };

  // Mettre en cache
  loggerCache.set(cacheKey, logger);

  return logger;
}

/**
 * Obtenir ou créer un logger
 */
function getLogger(serviceName = 'APP') {
  return createLogger(serviceName);
}

/**
 * Configurer les loggers après chargement de la config
 */
function configureLoggers(config) {
  // Mettre à jour la configuration par défaut
  Object.assign(DEFAULT_CONFIG, {
    level: config.logging?.level || DEFAULT_CONFIG.level,
    logDir: config.logging?.logDir || DEFAULT_CONFIG.logDir,
    maxFiles: config.logging?.maxFiles || DEFAULT_CONFIG.maxFiles,
    maxSize: config.logging?.maxSize || DEFAULT_CONFIG.maxSize,
    colorize: config.logging?.colorize !== undefined ? config.logging.colorize : DEFAULT_CONFIG.colorize
  });

  // Vider le cache pour forcer la recréation avec la nouvelle config
  loggerCache.clear();

  console.log('✅ Loggers reconfigurés avec la nouvelle configuration');
}

/**
 * Logger par défaut pour l'application
 */
const defaultLogger = createLogger('APP');

// Export du logger par défaut comme fonction pour compatibilité
module.exports = createLogger;
module.exports.getLogger = getLogger;
module.exports.configureLoggers = configureLoggers;
module.exports.default = defaultLogger;

// Méthodes de convenance sur l'export principal
module.exports.info = (...args) => defaultLogger.info(...args);
module.exports.warn = (...args) => defaultLogger.warn(...args);
module.exports.error = (...args) => defaultLogger.error(...args);
module.exports.debug = (...args) => defaultLogger.debug(...args);
