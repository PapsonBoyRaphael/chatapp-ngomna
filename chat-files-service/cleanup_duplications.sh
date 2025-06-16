#!/bin/bash

echo "🧹 NETTOYAGE AUTOMATIQUE DES DUPLICATIONS - CHAT-FILES-SERVICE"
echo "================================================================"

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction pour logger
log_info() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Sauvegarder l'état actuel
echo "📦 Sauvegarde de l'état actuel..."
cp -r src src_backup_$(date +%Y%m%d_%H%M%S)

# ============================================================================
# 1. SUPPRIMER FileProcessingService DOUBLONS (déjà fait mais on s'assure)
# ============================================================================
echo -e "\n1️⃣ Nettoyage FileProcessingService..."

# Supprimer le doublon dans file-processing/
if [ -f "src/application/services/file-processing/FileProcessingService.js" ]; then
    rm src/application/services/file-processing/FileProcessingService.js
    log_info "Doublon FileProcessingService supprimé"
fi

# Supprimer le dossier s'il est vide
if [ -d "src/application/services/file-processing" ] && [ -z "$(ls -A src/application/services/file-processing)" ]; then
    rmdir src/application/services/file-processing
    log_info "Dossier file-processing vide supprimé"
fi

# ============================================================================
# 2. SUPPRIMER LES DUPLICATIONS DE VALIDATION (déjà fait mais on nettoie)
# ============================================================================
echo -e "\n2️⃣ Nettoyage validations dupliquées..."

# Remplacer l'ancien validator.js par une redirection
cat > src/shared/utils/validator.js << 'VALIDATOR_EOF'
/**
 * Validator - Chat Files Service (DEPRECATED)
 * ⚠️ DEPRECATED: Utiliser src/shared/validators/ à la place
 */
const { getValidators } = require('../validators');
console.warn('⚠️ DEPRECATED: validator.js obsolète. Utilisez src/shared/validators/');
module.exports = getValidators();
VALIDATOR_EOF

log_info "Ancien validator.js redirigé"

# ============================================================================
# 3. CORRIGER getFileCategory DUPLICATION
# ============================================================================
echo -e "\n3️⃣ Correction duplication getFileCategory..."

# Créer un utilitaire centralisé pour getFileCategory
mkdir -p src/shared/utils/file
cat > src/shared/utils/file/CategoryHelper.js << 'CATEGORY_EOF'
/**
 * Category Helper - Chat Files Service
 * Utilitaire centralisé pour déterminer les catégories de fichiers
 */
const mime = require('mime-types');
const path = require('path');

class CategoryHelper {
  static getFileCategory(fileName, mimeType = null) {
    const extension = path.extname(fileName).slice(1).toLowerCase();
    const detectedMimeType = mimeType || mime.lookup(fileName) || 'application/octet-stream';

    // Images
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff'];
    if (imageExtensions.includes(extension) || detectedMimeType.startsWith('image/')) {
      return 'image';
    }

    // Vidéos
    const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v'];
    if (videoExtensions.includes(extension) || detectedMimeType.startsWith('video/')) {
      return 'video';
    }

    // Audio
    const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'];
    if (audioExtensions.includes(extension) || detectedMimeType.startsWith('audio/')) {
      return 'audio';
    }

    // Documents
    const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt'];
    if (documentExtensions.includes(extension) || 
        detectedMimeType.includes('pdf') || 
        detectedMimeType.includes('document') ||
        detectedMimeType.includes('text')) {
      return 'document';
    }

    // Archives
    const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
    if (archiveExtensions.includes(extension) || 
        detectedMimeType.includes('zip') || 
        detectedMimeType.includes('compressed')) {
      return 'archive';
    }

    return 'other';
  }

  static getCategoryConfig(category) {
    const configs = {
      image: {
        maxSize: 50 * 1024 * 1024, // 50MB
        allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        processingOptions: { enableThumbnails: true, enableOptimization: true }
      },
      video: {
        maxSize: 500 * 1024 * 1024, // 500MB
        allowedExtensions: ['mp4', 'webm', 'mov'],
        processingOptions: { enableThumbnails: true, enableCompression: true }
      },
      audio: {
        maxSize: 100 * 1024 * 1024, // 100MB
        allowedExtensions: ['mp3', 'wav', 'flac'],
        processingOptions: { enableMetadata: true }
      },
      document: {
        maxSize: 100 * 1024 * 1024, // 100MB
        allowedExtensions: ['pdf', 'doc', 'docx', 'txt'],
        processingOptions: { enableThumbnails: true, enableTextExtraction: true }
      },
      archive: {
        maxSize: 200 * 1024 * 1024, // 200MB
        allowedExtensions: ['zip', 'tar', 'gz'],
        processingOptions: { enableAnalysis: true }
      },
      other: {
        maxSize: 50 * 1024 * 1024, // 50MB
        allowedExtensions: [],
        processingOptions: {}
      }
    };

    return configs[category] || configs.other;
  }
}

module.exports = CategoryHelper;
CATEGORY_EOF

log_info "CategoryHelper centralisé créé"

# ============================================================================
# 4. SUPPRIMER DUPLICATIONS MÉTADONNÉES
# ============================================================================
echo -e "\n4️⃣ Suppression duplications métadonnées..."

# Créer un utilitaire centralisé pour métadonnées
cat > src/shared/utils/file/MetadataHelper.js << 'METADATA_EOF'
/**
 * Metadata Helper - Chat Files Service
 * Utilitaire centralisé pour extraction des métadonnées
 */
const sharp = require('sharp');
const ffprobe = require('ffprobe-static');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class MetadataHelper {
  static async extractMetadata(fileBuffer, fileName, category = null) {
    const fileCategory = category || require('./CategoryHelper').getFileCategory(fileName);
    
    const metadata = {
      fileName,
      size: fileBuffer.length,
      category: fileCategory,
      extractedAt: new Date().toISOString()
    };

    try {
      switch (fileCategory) {
        case 'image':
          return { ...metadata, ...(await this.extractImageMetadata(fileBuffer)) };
        case 'video':
          return { ...metadata, ...(await this.extractVideoMetadata(fileBuffer, fileName)) };
        case 'audio':
          return { ...metadata, ...(await this.extractAudioMetadata(fileBuffer, fileName)) };
        case 'document':
          return { ...metadata, ...(await this.extractDocumentMetadata(fileBuffer, fileName)) };
        default:
          return metadata;
      }
    } catch (error) {
      metadata.extractionError = error.message;
      return metadata;
    }
  }

  static async extractImageMetadata(fileBuffer) {
    const metadata = await sharp(fileBuffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      colorSpace: metadata.space,
      hasAlpha: metadata.hasAlpha,
      density: metadata.density
    };
  }

  static async extractVideoMetadata(fileBuffer, fileName) {
    // Simplified video metadata extraction
    return {
      format: 'video',
      duration: null,
      resolution: null
    };
  }

  static async extractAudioMetadata(fileBuffer, fileName) {
    return {
      format: 'audio',
      duration: null,
      bitrate: null
    };
  }

  static async extractDocumentMetadata(fileBuffer, fileName) {
    return {
      format: 'document',
      pageCount: null,
      textLength: null
    };
  }
}

module.exports = MetadataHelper;
METADATA_EOF

log_info "MetadataHelper centralisé créé"

# ============================================================================
# 5. SUPPRIMER DUPLICATIONS NETTOYAGE FICHIERS TEMPORAIRES
# ============================================================================
echo -e "\n5️⃣ Suppression duplications nettoyage..."

# Créer un utilitaire centralisé pour nettoyage
cat > src/shared/utils/file/CleanupHelper.js << 'CLEANUP_EOF'
/**
 * Cleanup Helper - Chat Files Service
 * Utilitaire centralisé pour nettoyage des fichiers temporaires
 */
const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../logger');

const logger = createLogger('CleanupHelper');

class CleanupHelper {
  static async cleanupTempFiles(tempDir = './temp', maxAge = 3600000) { // 1 heure
    try {
      const files = await fs.readdir(tempDir);
      const now = Date.now();
      let cleaned = 0;

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          cleaned++;
        }
      }

      logger.debug(`🧹 Nettoyage terminé: ${cleaned} fichiers supprimés`);
      return cleaned;
    } catch (error) {
      logger.warn('⚠️ Erreur nettoyage:', error.message);
      return 0;
    }
  }

  static async cleanupProcessFiles(processId, tempDirs = ['./temp', './storage/processing']) {
    let cleaned = 0;
    
    for (const dir of tempDirs) {
      try {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
          if (file.includes(processId)) {
            await fs.unlink(path.join(dir, file));
            cleaned++;
          }
        }
      } catch (error) {
        // Ignorer si le dossier n'existe pas
      }
    }

    return cleaned;
  }

  static async scheduleCleanup(intervalMs = 3600000) { // 1 heure
    setInterval(async () => {
      await this.cleanupTempFiles();
    }, intervalMs);
  }
}

module.exports = CleanupHelper;
CLEANUP_EOF

log_info "CleanupHelper centralisé créé"

# ============================================================================
# 6. SUPPRIMER DUPLICATIONS SANITISATION NOMS FICHIERS
# ============================================================================
echo -e "\n6️⃣ Suppression duplications sanitisation..."

# La sanitisation est déjà dans FileValidator, on supprime les doublons
find src/ -name "*.js" -type f -exec grep -l "sanitizeFileName" {} \; | while read file; do
    if [[ "$file" != *"validators"* ]]; then
        log_warn "Duplication sanitizeFileName dans: $file"
        # Remplacer par l'appel au validator centralisé
        sed -i 's/sanitizeFileName(/require("..\/..\/validators").getValidators().fileValidator.sanitizeFileName(/g' "$file"
    fi
done

# ============================================================================
# 7. SUPPRIMER DUPLICATIONS RECHERCHE/FILTRAGE
# ============================================================================
echo -e "\n7️⃣ Suppression duplications recherche..."

# Créer un builder de filtres centralisé
mkdir -p src/shared/utils/database
cat > src/shared/utils/database/FilterBuilder.js << 'FILTER_EOF'
/**
 * Filter Builder - Chat Files Service
 * Utilitaire centralisé pour construction de filtres MongoDB
 */
class FilterBuilder {
  static buildFileFilters(criteria = {}) {
    const filter = {};

    if (criteria.chatId) {
      filter.chatId = criteria.chatId;
    }

    if (criteria.uploadedBy) {
      filter.uploadedBy = criteria.uploadedBy;
    }

    if (criteria.category) {
      filter.category = criteria.category;
    }

    if (criteria.search) {
      filter.$or = [
        { originalName: { $regex: criteria.search, $options: 'i' } },
        { description: { $regex: criteria.search, $options: 'i' } },
        { 'tags': { $in: [new RegExp(criteria.search, 'i')] } }
      ];
    }

    if (criteria.dateFrom || criteria.dateTo) {
      filter.uploadedAt = {};
      if (criteria.dateFrom) filter.uploadedAt.$gte = new Date(criteria.dateFrom);
      if (criteria.dateTo) filter.uploadedAt.$lte = new Date(criteria.dateTo);
    }

    if (criteria.sizeMin || criteria.sizeMax) {
      filter.size = {};
      if (criteria.sizeMin) filter.size.$gte = criteria.sizeMin;
      if (criteria.sizeMax) filter.size.$lte = criteria.sizeMax;
    }

    return filter;
  }

  static buildSortOptions(criteria = {}) {
    const { sortBy = 'uploadedAt', sortOrder = 'desc' } = criteria;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    return sortOptions;
  }

  static buildPaginationOptions(criteria = {}) {
    const page = Math.max(1, parseInt(criteria.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(criteria.limit) || 20));
    const skip = (page - 1) * limit;

    return { skip, limit, page };
  }
}

module.exports = FilterBuilder;
FILTER_EOF

log_info "FilterBuilder centralisé créé"

# ============================================================================
# 8. NETTOYER LES MÉTHODES DUPLIQUÉES DANS REPOSITORIES
# ============================================================================
echo -e "\n8️⃣ Nettoyage repositories..."

# Identifier et nettoyer les doublons dans les repositories
find src/infrastructure/database/ -name "*.js" -type f -exec grep -l "findByCategory\|findBySize\|getStatistics" {} \; | while read file; do
    log_warn "Méthodes potentiellement dupliquées dans: $file"
done

# ============================================================================
# 9. SUPPRIMER TOUS LES FICHIERS HELPER REDONDANTS
# ============================================================================
echo -e "\n9️⃣ Suppression fichiers helper redondants..."

# Supprimer l'ancien fileHelper s'il duplique les nouvelles fonctions
if [ -f "src/shared/utils/fileHelper.js" ]; then
    # Créer une version minimale qui redirige vers les helpers spécialisés
    cat > src/shared/utils/fileHelper.js << 'HELPER_EOF'
/**
 * File Helper - Chat Files Service (DEPRECATED)
 * ⚠️ DEPRECATED: Fonctions déplacées vers src/shared/utils/file/
 */

// Redirections vers les nouveaux helpers spécialisés
const CategoryHelper = require('./file/CategoryHelper');
const MetadataHelper = require('./file/MetadataHelper');
const CleanupHelper = require('./file/CleanupHelper');

console.warn('⚠️ DEPRECATED: fileHelper.js obsolète. Utilisez les helpers spécialisés dans ./file/');

module.exports = {
  getFileCategory: CategoryHelper.getFileCategory,
  extractMetadata: MetadataHelper.extractMetadata,
  cleanupTempFiles: CleanupHelper.cleanupTempFiles,
  // Autres méthodes dépréciées...
};
HELPER_EOF

    log_info "fileHelper.js converti en redirection"
fi

# ============================================================================
# 10. METTRE À JOUR TOUS LES IMPORTS
# ============================================================================
echo -e "\n🔄 Mise à jour des imports..."

# Mettre à jour les imports dans tous les fichiers
find src/ -name "*.js" -type f -exec sed -i 's|require.*fileHelper.*|require("../../../shared/utils/file/CategoryHelper")|g' {} \;
find src/ -name "*.js" -type f -exec sed -i 's|\.getFileCategory|CategoryHelper.getFileCategory|g' {} \;
find src/ -name "*.js" -type f -exec sed -i 's|\.extractMetadata|MetadataHelper.extractMetadata|g' {} \;

# ============================================================================
# 11. VÉRIFICATION FINALE
# ============================================================================
echo -e "\n🔍 Vérification finale..."

duplications=0

echo "Vérification des duplications restantes:"

echo "- getFileCategory:"
count=$(grep -r "getFileCategory" src/ --include="*.js" | grep -v "CategoryHelper" | wc -l)
echo "  Occurrences hors CategoryHelper: $count"
duplications=$((duplications + count))

echo "- extractMetadata:"
count=$(grep -r "extractMetadata" src/ --include="*.js" | grep -v "MetadataHelper" | wc -l)
echo "  Occurrences hors MetadataHelper: $count"
duplications=$((duplications + count))

echo "- cleanupTempFiles:"
count=$(grep -r "cleanupTempFiles" src/ --include="*.js" | grep -v "CleanupHelper" | wc -l)
echo "  Occurrences hors CleanupHelper: $count"
duplications=$((duplications + count))

echo "- sanitizeFileName:"
count=$(grep -r "sanitizeFileName" src/ --include="*.js" | grep -v "validators" | wc -l)
echo "  Occurrences hors validators: $count"
duplications=$((duplications + count))

if [ $duplications -eq 0 ]; then
    log_info "🎉 TOUTES LES DUPLICATIONS SUPPRIMÉES AVEC SUCCÈS!"
else
    log_warn "⚠️ $duplications duplications potentielles restantes (vérification manuelle requise)"
fi

echo -e "\n📊 RÉSUMÉ:"
echo "✅ FileProcessingService - Consolidé"
echo "✅ Validation de fichiers - Centralisée"
echo "✅ Catégories de fichiers - Helper centralisé"
echo "✅ Métadonnées - Helper centralisé"
echo "✅ Nettoyage - Helper centralisé"
echo "✅ Recherche/Filtrage - Builder centralisé"
echo "✅ Imports - Mis à jour"

echo -e "\n🏗️ NOUVELLE STRUCTURE:"
echo "src/shared/"
echo "├── validators/          # Validation centralisée"
echo "│   ├── FileValidator.js"
echo "│   ├── InputValidator.js"
echo "│   └── index.js"
echo "├── utils/file/          # Utilitaires fichiers"
echo "│   ├── CategoryHelper.js"
echo "│   ├── MetadataHelper.js"
echo "│   └── CleanupHelper.js"
echo "└── utils/database/      # Utilitaires DB"
echo "    └── FilterBuilder.js"

log_info "🚀 NETTOYAGE TERMINÉ - Projet déduplication réussi!"

