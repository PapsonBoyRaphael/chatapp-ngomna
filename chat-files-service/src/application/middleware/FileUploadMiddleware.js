/**
 * Middleware pour l'upload de fichiers
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../shared/utils/logger');
const { ValidationException } = require('../../shared/exceptions/ValidationException');
const { FILE_TYPES } = require('../../shared/constants/fileTypes');
const config = require('../../shared/config');

const logger = createLogger('FileUploadMiddleware');

class FileUploadMiddleware {
  /**
   * Plugin Fastify pour l'upload de fichiers
   */
  static async register(fastify, options) {
    fastify.decorate('validateFileUpload', FileUploadMiddleware.validateFileUpload);
    fastify.decorate('preprocessFile', FileUploadMiddleware.preprocessFile);
    fastify.decorate('virusScan', FileUploadMiddleware.virusScan);
  }

  /**
   * Valider l'upload de fichier
   */
  static validateFileUpload(options = {}) {
    return async (request, reply) => {
      try {
        const data = await request.file();
        
        if (!data) {
          throw new ValidationException('Aucun fichier fourni');
        }

        // Valider la taille
        await FileUploadMiddleware.validateFileSize(data, options.maxSize);

        // Valider le type
        await FileUploadMiddleware.validateFileType(data, options.allowedTypes);

        // Valider le nom de fichier
        await FileUploadMiddleware.validateFileName(data.filename);

        // Stocker les données validées dans la requête
        request.fileData = data;

        logger.info('Fichier validé avec succès:', {
          filename: data.filename,
          mimetype: data.mimetype,
          size: data.file.bytesRead || 'unknown',
          userId: request.user?.id
        });

      } catch (error) {
        logger.warn('Validation de fichier échouée:', {
          error: error.message,
          userId: request.user?.id
        });

        reply.status(400).send({
          success: false,
          error: 'Fichier invalide',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Valider la taille du fichier
   */
  static async validateFileSize(fileData, maxSize = null) {
    const maxSizeBytes = maxSize || config.files.maxFileSize;
    
    return new Promise((resolve, reject) => {
      let totalSize = 0;
      
      fileData.file.on('data', (chunk) => {
        totalSize += chunk.length;
        
        if (totalSize > maxSizeBytes) {
          reject(new ValidationException(
            `Fichier trop volumineux. Taille maximale: ${Math.round(maxSizeBytes / 1024 / 1024)}MB`
          ));
        }
      });

      fileData.file.on('end', () => {
        resolve(totalSize);
      });

      fileData.file.on('error', (error) => {
        reject(new ValidationException(`Erreur de lecture du fichier: ${error.message}`));
      });
    });
  }

  /**
   * Valider le type de fichier
   */
  static async validateFileType(fileData, allowedTypes = null) {
    const allowedMimeTypes = allowedTypes || config.files.allowedTypes;
    const fileMimeType = fileData.mimetype;

    // Vérifier si le type MIME est autorisé
    if (!allowedMimeTypes.includes(fileMimeType)) {
      throw new ValidationException(
        `Type de fichier non autorisé: ${fileMimeType}. Types autorisés: ${allowedMimeTypes.join(', ')}`
      );
    }

    // Validation additionnelle basée sur l'extension
    const filename = fileData.filename;
    const extension = filename.split('.').pop()?.toLowerCase();

    if (!extension) {
      throw new ValidationException('Le fichier doit avoir une extension');
    }

    // Vérifier la cohérence entre extension et MIME type
    const expectedMimeTypes = FileUploadMiddleware.getMimeTypesForExtension(extension);
    if (expectedMimeTypes.length > 0 && !expectedMimeTypes.includes(fileMimeType)) {
      logger.warn('Incohérence entre extension et MIME type:', {
        filename,
        extension,
        mimetype: fileMimeType,
        expectedMimeTypes
      });
    }
  }

  /**
   * Valider le nom de fichier
   */
  static async validateFileName(filename) {
    if (!filename || filename.length === 0) {
      throw new ValidationException('Le nom de fichier ne peut pas être vide');
    }

    if (filename.length > 255) {
      throw new ValidationException('Le nom de fichier ne peut pas dépasser 255 caractères');
    }

    // Caractères interdits
    const forbiddenChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (forbiddenChars.test(filename)) {
      throw new ValidationException('Le nom de fichier contient des caractères interdits');
    }

    // Noms réservés Windows
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    const nameWithoutExt = filename.split('.')[0].toUpperCase();
    if (reservedNames.includes(nameWithoutExt)) {
      throw new ValidationException('Nom de fichier réservé par le système');
    }
  }

  /**
   * Préprocesseur de fichier
   */
  static preprocessFile(options = {}) {
    return async (request, reply) => {
      try {
        if (!request.fileData) {
          throw new ValidationException('Aucune donnée de fichier trouvée');
        }

        const fileData = request.fileData;

        // Générer un nom de fichier sécurisé
        const secureFilename = FileUploadMiddleware.generateSecureFilename(fileData.filename);
        
        // Ajouter des métadonnées
        const metadata = {
          originalName: fileData.filename,
          secureFilename: secureFilename,
          mimetype: fileData.mimetype,
          uploadedAt: new Date(),
          uploadedBy: request.user?.id,
          userAgent: request.headers['user-agent'],
          ip: request.ip,
          size: 0 // Sera mis à jour lors du traitement
        };

        // Enrichir les données du fichier
        request.fileData.metadata = metadata;
        request.fileData.secureFilename = secureFilename;

        logger.debug('Fichier préprocessé:', {
          originalName: fileData.filename,
          secureFilename: secureFilename,
          userId: request.user?.id
        });

      } catch (error) {
        logger.error('Erreur lors du préprocessing du fichier:', error);
        
        reply.status(500).send({
          success: false,
          error: 'Erreur de traitement du fichier',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Scanner antivirus (placeholder)
   */
  static virusScan(options = {}) {
    return async (request, reply) => {
      try {
        if (!options.enabled) {
          logger.debug('Scan antivirus désactivé');
          return;
        }

        const fileData = request.fileData;
        
        // Ici on pourrait intégrer ClamAV ou un autre scanner
        // Pour l'instant, on fait des vérifications basiques
        
        await FileUploadMiddleware.basicSecurityScan(fileData);

        logger.debug('Scan de sécurité basique réussi:', {
          filename: fileData.filename,
          userId: request.user?.id
        });

      } catch (error) {
        logger.warn('Fichier suspect détecté:', {
          filename: request.fileData?.filename,
          error: error.message,
          userId: request.user?.id
        });

        reply.status(400).send({
          success: false,
          error: 'Fichier suspect',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Scan de sécurité basique
   */
  static async basicSecurityScan(fileData) {
    // Vérifier les signatures de fichiers malveillants connus
    const dangerousExtensions = [
      'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar',
      'sh', 'py', 'pl', 'php', 'asp', 'jsp'
    ];

    const filename = fileData.filename.toLowerCase();
    const extension = filename.split('.').pop();

    if (dangerousExtensions.includes(extension)) {
      throw new ValidationException('Type de fichier potentiellement dangereux');
    }

    // Vérifier les double extensions
    if (filename.includes('..')) {
      throw new ValidationException('Double extension détectée');
    }

    // Autres vérifications...
  }

  /**
   * Générer un nom de fichier sécurisé
   */
  static generateSecureFilename(originalFilename) {
    const { v4: uuidv4 } = require('uuid');
    const path = require('path');

    const extension = path.extname(originalFilename);
    const basename = path.basename(originalFilename, extension);
    
    // Nettoyer le nom de base
    const cleanBasename = basename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .substring(0, 50);

    // Générer un nom unique
    const timestamp = Date.now();
    const uuid = uuidv4().split('-')[0];
    
    return `${timestamp}_${uuid}_${cleanBasename}${extension}`;
  }

  /**
   * Obtenir les types MIME attendus pour une extension
   */
  static getMimeTypesForExtension(extension) {
    const mimeMap = {
      'jpg': ['image/jpeg'],
      'jpeg': ['image/jpeg'],
      'png': ['image/png'],
      'gif': ['image/gif'],
      'pdf': ['application/pdf'],
      'txt': ['text/plain'],
      'mp4': ['video/mp4'],
      'mp3': ['audio/mpeg'],
      'wav': ['audio/wav'],
      'doc': ['application/msword'],
      'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    };

    return mimeMap[extension] || [];
  }
}

// Métadonnées pour Fastify
FileUploadMiddleware[Symbol.for('skip-override')] = true;

module.exports = FileUploadMiddleware;
