/**
 * CachedFileRepository - Repository pattern avec cache Redis pour les fichiers
 * Wrapper autour du primaryStore (MongoFileRepository) pour ajouter la logique de cache
 * Toutes les méthodes du primaryStore sont wrappées ici pour ajouter cache/invalidation
 */
class CachedFileRepository {
  constructor(fileRepository, cacheService) {
    this.primaryStore = fileRepository; // Le pur Mongo repo
    this.cache = cacheService;
    this.cachePrefix = "file:";
    this.defaultTTL = 7200; // 2 heures (adapté pour fichiers)
    this.shortTTL = 300; // 5 minutes pour ops temporaires
  }

  // Sauvegarder un fichier avec cache et invalidation
  async save(file) {
    try {
      // 1. Sauvegarde dans MongoDB via primaryStore
      const savedFile = await this.primaryStore.save(file);

      // 2. Mise en cache des métadonnées du fichier (pas le binaire !)
      const fileCacheKey = `${this.cachePrefix}${savedFile._id}`;
      await this.cache.set(fileCacheKey, savedFile, this.defaultTTL); // Cache metadata seulement

      // 3. Invalider les caches liés (ex. : listes de fichiers par conv/user)
      await this.invalidateFileCaches(savedFile._id);

      return savedFile;
    } catch (error) {
      console.error("❌ Erreur save (cached):", error);
      throw error;
    }
  }

  // Télécharger un fichier (pas de cache pour binaires lourds, mais cache metadata si needed)
  async download(localFileName, remoteFileName) {
    // Pas de cache pour streams binaires (trop lourds pour Redis)
    // Mais on peut cacher si le fichier existe (via metadata)
    const metadataKey = `${this.cachePrefix}exists:${remoteFileName}`;
    const cachedExists = await this.cache.get(metadataKey);

    if (cachedExists === false) {
      throw new Error("Fichier non trouvé (cache)");
    }

    try {
      const stream = await this.primaryStore.download(
        localFileName,
        remoteFileName,
      );
      // Cache existence après succès
      await this.cache.set(metadataKey, true, this.shortTTL);
      return stream;
    } catch (error) {
      await this.cache.set(metadataKey, false, this.shortTTL); // Cache miss pour éviter retries inutiles
      throw error;
    }
  }

  // Supprimer un fichier avec invalidation
  async delete(remoteFileName) {
    try {
      const result = await this.primaryStore.delete(remoteFileName);

      // Invalider les caches liés
      await this.invalidateFileCaches(remoteFileName); // Ou par ID si available

      return result;
    } catch (error) {
      console.error("❌ Erreur delete (cached):", error);
      throw error;
    }
  }

  // ✅ AJOUTER findById (manquant)
  async findById(fileId, useCache = true) {
    if (!useCache) {
      // Bypass cache si pas demandé
      return await this.primaryStore.findById(fileId, false);
    }

    try {
      // 1. Chercher dans le cache
      const cacheKey = `${this.cachePrefix}${fileId}`;
      const cachedFile = await this.cache.get(cacheKey);

      if (cachedFile) {
        console.log(`✅ Cache HIT: fichier ${fileId}`);
        return cachedFile;
      }

      // 2. Chercher dans MongoDB
      const file = await this.primaryStore.findById(fileId, false);

      if (file) {
        // 3. Mettre en cache
        await this.cache.set(cacheKey, file, this.defaultTTL);
        console.log(`💾 Cache SET: fichier ${fileId}`);
      }

      return file;
    } catch (error) {
      console.error("❌ Erreur findById (cached):", error);
      throw error;
    }
  }

  // ✅ AJOUTER deleteFile (manquant)
  async deleteFile(fileId, softDelete = true) {
    try {
      const result = await this.primaryStore.deleteFile(fileId, softDelete);

      // Invalider les caches liés
      await this.invalidateFileCaches(fileId);

      return result;
    } catch (error) {
      console.error("❌ Erreur deleteFile (cached):", error);
      throw error;
    }
  }

  // ✅ AJOUTER incrementDownloadCount (manquant)
  async incrementDownloadCount(fileId, userId = null, metadata = {}) {
    try {
      const result = await this.primaryStore.incrementDownloadCount(
        fileId,
        userId,
        metadata,
      );

      // Invalider le cache du fichier car son downloadCount a changé
      await this.invalidateFileCaches(fileId);

      return result;
    } catch (error) {
      console.error("❌ Erreur incrementDownloadCount (cached):", error);
      throw error;
    }
  }

  // Mettre à jour les thumbnails avec invalidation
  async updateThumbnails(fileId, thumbnails) {
    try {
      const result = await this.primaryStore.updateThumbnails(
        fileId,
        thumbnails,
      );

      // Invalider les caches liés au fichier
      await this.invalidateFileCaches(fileId);

      return result;
    } catch (error) {
      console.error("❌ Erreur updateThumbnails (cached):", error);
      throw error;
    }
  }

  // Marquer l'échec de processing avec invalidation
  async markThumbnailProcessingFailed(fileId, error) {
    try {
      const result = await this.primaryStore.markThumbnailProcessingFailed(
        fileId,
        error,
      );

      // Invalider les caches liés
      await this.invalidateFileCaches(fileId);

      return result;
    } catch (error) {
      console.error("❌ Erreur markThumbnailProcessingFailed (cached):", error);
      throw error;
    }
  }

  // Invalidation des caches liés à un fichier
  async invalidateFileCaches(fileId) {
    if (!this.cache) return;

    const patterns = [
      `${this.cachePrefix}${fileId}`,
      `${this.cachePrefix}exists:*`, // Invalide les checks d'existence si needed
      `file:metadata:*`, // Si tu as d'autres caches metadata
    ];

    for (const pattern of patterns) {
      try {
        await this.cache.delete(pattern);
      } catch (error) {
        console.warn(`⚠️ Erreur invalidation ${pattern}:`, error.message);
      }
    }
  }

  // Nettoyage du cache pour les fichiers
  async clearCache() {
    if (!this.cache) return;

    try {
      await this.cache.delete(`${this.cachePrefix}*`);
      await this.cache.delete("file:*");
    } catch (error) {
      console.error("❌ Erreur clearCache:", error);
    }
  }
}

module.exports = CachedFileRepository;
