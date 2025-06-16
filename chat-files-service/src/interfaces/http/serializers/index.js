/**
 * Serializers Index - Chat Files Service
 * CENADI Chat-Files-Service
 * Export centralisé des serializers pour messagerie
 */

const FileSerializer = require('./files/FileSerializer');
const ResponseSerializer = require('./shared/ResponseSerializer');
const ErrorSerializer = require('./shared/ErrorSerializer');

module.exports = {
  FileSerializer,
  ResponseSerializer,
  ErrorSerializer
};
