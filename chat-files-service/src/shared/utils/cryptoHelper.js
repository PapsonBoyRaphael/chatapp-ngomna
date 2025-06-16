/**
 * Crypto Helper Utility - Chat Files Service
 * CENADI Chat-Files-Service
 * Utilitaires cryptographiques pour sécurité et tokens
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getConfigSection } = require('../config');
const { createLogger } = require('./logger');

const logger = createLogger('CryptoHelper');

class CryptoHelper {
  constructor() {
    this.config = getConfigSection('security') || {};
    this.jwtSecret = this.config.jwtSecret || process.env.JWT_SECRET || 'dev-secret';
    this.bcryptRounds = this.config.bcryptRounds || 12;
  }

  // === HASHING ET VÉRIFICATION ===

  // Hasher un mot de passe avec bcrypt
  async hashPassword(password) {
    try {
      const hash = await bcrypt.hash(password, this.bcryptRounds);
      logger.debug('🔐 Mot de passe hashé avec succès');
      return hash;
    } catch (error) {
      logger.error('❌ Erreur hashage mot de passe:', error);
      throw error;
    }
  }

  // Vérifier un mot de passe
  async verifyPassword(password, hash) {
    try {
      const isValid = await bcrypt.compare(password, hash);
      logger.debug('🔐 Vérification mot de passe:', { isValid });
      return isValid;
    } catch (error) {
      logger.error('❌ Erreur vérification mot de passe:', error);
      throw error;
    }
  }

  // === GÉNÉRATION DE TOKENS ===

  // Générer un token aléatoire sécurisé
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Générer un token de partage (64 caractères hex)
  generateShareToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Générer un ID de fichier unique
  generateFileId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `${timestamp}_${random}`;
  }

  // Générer un ID de requête unique
  generateRequestId() {
    return crypto.randomUUID();
  }

  // === JWT TOKENS ===

  // Créer un JWT token
  createJWT(payload, options = {}) {
    try {
      const defaultOptions = {
        expiresIn: this.config.jwtExpiration || '24h',
        issuer: 'chat-files-service',
        audience: 'cenadi-agents'
      };

      const token = jwt.sign(payload, this.jwtSecret, {
        ...defaultOptions,
        ...options
      });

      logger.debug('🎟️ JWT créé:', {
        userId: payload.userId || payload.id,
        expiresIn: options.expiresIn || defaultOptions.expiresIn
      });

      return token;
    } catch (error) {
      logger.error('❌ Erreur création JWT:', error);
      throw error;
    }
  }

  // Vérifier et décoder un JWT token
  verifyJWT(token, options = {}) {
    try {
      const defaultOptions = {
        issuer: 'chat-files-service',
        audience: 'cenadi-agents'
      };

      const decoded = jwt.verify(token, this.jwtSecret, {
        ...defaultOptions,
        ...options
      });

      logger.debug('🎟️ JWT vérifié:', {
        userId: decoded.userId || decoded.id,
        exp: new Date(decoded.exp * 1000)
      });

      return decoded;
    } catch (error) {
      logger.warn('⚠️ JWT invalide:', {
        error: error.message,
        name: error.name
      });
      throw error;
    }
  }

  // Décoder un JWT sans vérification (pour debug)
  decodeJWT(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      logger.error('❌ Erreur décodage JWT:', error);
      return null;
    }
  }

  // === CHIFFREMENT SYMÉTRIQUE ===

  // Chiffrer une chaîne
  encrypt(text, key = null) {
    try {
      const algorithm = 'aes-256-gcm';
      const secretKey = key || crypto.scryptSync(this.jwtSecret, 'salt', 32);
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipher(algorithm, secretKey, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      logger.error('❌ Erreur chiffrement:', error);
      throw error;
    }
  }

  // Déchiffrer une chaîne
  decrypt(encryptedData, key = null) {
    try {
      const algorithm = 'aes-256-gcm';
      const secretKey = key || crypto.scryptSync(this.jwtSecret, 'salt', 32);
      
      const decipher = crypto.createDecipher(algorithm, secretKey, Buffer.from(encryptedData.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('❌ Erreur déchiffrement:', error);
      throw error;
    }
  }

  // === SIGNATURES ET VÉRIFICATION ===

  // Créer une signature HMAC
  createSignature(data, secret = null) {
    const key = secret || this.jwtSecret;
    const signature = crypto
      .createHmac('sha256', key)
      .update(JSON.stringify(data))
      .digest('hex');
    
    logger.debug('✍️ Signature créée');
    return signature;
  }

  // Vérifier une signature HMAC
  verifySignature(data, signature, secret = null) {
    try {
      const expectedSignature = this.createSignature(data, secret);
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
      
      logger.debug('✅ Signature vérifiée:', { isValid });
      return isValid;
    } catch (error) {
      logger.error('❌ Erreur vérification signature:', error);
      return false;
    }
  }

  // === HASH DE FICHIERS ===

  // Calculer le hash d'un buffer
  hashBuffer(buffer, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(buffer).digest('hex');
  }

  // Calculer le hash d'une chaîne
  hashString(string, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(string, 'utf8').digest('hex');
  }

  // Vérifier l'intégrité d'un fichier
  verifyFileIntegrity(buffer, expectedHash, algorithm = 'sha256') {
    const actualHash = this.hashBuffer(buffer, algorithm);
    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(actualHash, 'hex')
    );
  }

  // === TOKENS DE PARTAGE SÉCURISÉS ===

  // Créer un token de partage avec métadonnées
  createShareToken(fileId, userId, options = {}) {
    const tokenData = {
      fileId,
      userId,
      createdAt: Date.now(),
      ...options
    };

    const token = this.generateShareToken();
    const signature = this.createSignature(tokenData);

    return {
      token,
      signature,
      data: tokenData
    };
  }

  // Vérifier un token de partage
  verifyShareToken(token, signature, data) {
    return this.verifySignature(data, signature);
  }

  // === UTILITAIRES DE SÉCURITÉ ===

  // Générer un salt aléatoire
  generateSalt(length = 16) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Dériver une clé depuis un mot de passe (PBKDF2)
  deriveKey(password, salt, iterations = 100000, keyLength = 32) {
    return crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha256');
  }

  // Générer une paire de clés RSA
  generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
  }

  // === VALIDATION DE SÉCURITÉ ===

  // Vérifier la force d'un mot de passe
  validatePasswordStrength(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const score = [
      password.length >= minLength,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecialChar
    ].filter(Boolean).length;

    return {
      isValid: score >= 3,
      score,
      requirements: {
        minLength: password.length >= minLength,
        hasUpperCase,
        hasLowerCase,
        hasNumbers,
        hasSpecialChar
      }
    };
  }

  // Masquer les données sensibles pour les logs
  maskSensitiveData(data, fields = ['password', 'token', 'secret']) {
    const masked = { ...data };
    
    fields.forEach(field => {
      if (masked[field]) {
        masked[field] = '***MASKED***';
      }
    });

    return masked;
  }

  // === CONSTANTES DE TEMPS POUR PRÉVENIR TIMING ATTACKS ===

  // Comparaison à temps constant
  constantTimeCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  // Délai aléatoire pour masquer les opérations
  async randomDelay(minMs = 100, maxMs = 500) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Export singleton
const cryptoHelper = new CryptoHelper();

module.exports = cryptoHelper;
