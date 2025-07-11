class GetFile {
  constructor(fileRepository, redisClient = null) {
    this.fileRepository = fileRepository;
    this.redisClient = redisClient;
  }

  /**
   * Retourne uniquement le document mongoose File (pas de stream, pas de download)
   */
  async execute(fileId, userId) {
    try {
      // Vérifier le cache Redis
      let cachedFile = null;
      if (this.redisClient) {
        try {
          const cacheKey = `file:${fileId}`;
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            cachedFile = JSON.parse(cached);
          }
        } catch (redisError) {
          console.warn("⚠️ Erreur cache Redis:", redisError.message);
        }
      }

      if (cachedFile) {
        return cachedFile;
      }

      // Récupérer depuis la base
      const file = await this.fileRepository.findById(fileId);

      if (!file) {
        throw new Error("Fichier non trouvé");
      }

      // Mettre en cache
      if (this.redisClient) {
        try {
          const cacheKey = `file:${fileId}`;
          await this.redisClient.setex(cacheKey, 300, JSON.stringify(file)); // 5 minutes
        } catch (redisError) {
          console.warn("⚠️ Erreur mise en cache:", redisError.message);
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
