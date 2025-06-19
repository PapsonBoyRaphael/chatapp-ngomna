const crypto = require('crypto');
const path = require('path');

// Générer un nom de fichier unique
function generateUniqueFilename(originalName) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  
  return `${timestamp}-${random}-${baseName}${ext}`;
}

// Formater la taille des fichiers
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Vérifier si un fichier est une image
function isImageFile(mimetype) {
  return mimetype.startsWith('image/');
}

// Vérifier si un fichier est une vidéo
function isVideoFile(mimetype) {
  return mimetype.startsWith('video/');
}

// Générer un ID unique
function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

// Sanitizer pour les noms de fichiers
function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
}

module.exports = {
  generateUniqueFilename,
  formatFileSize,
  isImageFile,
  isVideoFile,
  generateId,
  sanitizeFilename
};
