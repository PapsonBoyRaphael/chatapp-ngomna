/**
 * Validator - Chat Files Service (DEPRECATED)
 * CENADI Chat-Files-Service
 * ⚠️ DEPRECATED: Utiliser src/shared/validators/ à la place
 */

// Redirection vers les nouveaux validateurs
const { getValidators } = require('../validators');

console.warn('⚠️ DEPRECATED: src/shared/utils/validator.js est obsolète. Utilisez src/shared/validators/ à la place.');

// Export de compatibilité pour éviter les erreurs
module.exports = {
  ...getValidators(),
  // Méthodes dépréciées redirigées
  isValidFilename: (filename) => getValidators().fileValidator.isValidFilename(filename),
  isValidEmail: (email) => getValidators().inputValidator.isValidEmail(email),
  validateUploadData: (data) => getValidators().inputValidator.validateObject(data, 'uploadData', ['chatId']),
  sanitizeFileName: (filename) => getValidators().fileValidator.sanitizeFileName(filename)
};
