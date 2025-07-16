class GetFile {
  constructor(fileRepository, cacheService = null) {
    this.fileRepository = fileRepository;
    this.cacheService = cacheService;
  }

  /**
   * Retourne uniquement le document mongoose File (pas de stream, pas de download)
   */
  async execute(fileId, userId) {
    try {
      // Vérifier le cache Redis via CacheService
      let cachedFile = null;
      if (this.cacheService) {
        try {
          cachedFile = await this.cacheService.get(`file:${fileId}`);
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache Redis:", cacheError.message);
        }
      }

      if (cachedFile) {
        if (cachedFile.status === "DELETED") {
          throw new Error("Ce fichier a été supprimé");
        }
        return cachedFile;
      }

      // Récupérer depuis la base
      const file = await this.fileRepository.findById(fileId);

      if (!file) {
        throw new Error("Fichier non trouvé");
      }

      // Interdire l'accès si le fichier est supprimé
      if (file.status === "DELETED") {
        throw new Error("Ce fichier a été supprimé");
      }

      // Mettre en cache via CacheService
      if (this.cacheService) {
        try {
          await this.cacheService.set(`file:${fileId}`, file, 300); // 5 minutes
        } catch (cacheError) {
          console.warn("⚠️ Erreur mise en cache:", cacheError.message);
        }
      }

      return file;
    } catch (error) {
      console.error("❌ Erreur GetFile use case:", error);
      throw error;
    }
  }
}

module.exports = GetFile;
