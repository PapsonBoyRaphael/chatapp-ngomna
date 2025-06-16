/**
 * Storage Adapters Index - Chat Files Service
 * CENADI Chat-Files-Service
 * Export des adaptateurs de stockage
 */

const BaseStorageAdapter = require('./BaseStorageAdapter');
const LocalStorageAdapter = require('./LocalStorageAdapter');

module.exports = {
  BaseStorageAdapter,
  LocalStorageAdapter,
  
  // Factory pour créer l'adaptateur approprié
  createAdapter: (type = 'local', options = {}) => {
    switch (type.toLowerCase()) {
      case 'local':
      case 'filesystem':
        return new LocalStorageAdapter(options);
        
      default:
        throw new Error(`Type d'adaptateur non supporté: ${type}. Utilisez 'local' pour le développement.`);
    }
  }
};
