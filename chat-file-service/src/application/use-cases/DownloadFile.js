const archiver = require("archiver");
const stream = require("stream");

class DownloadFile {
  constructor(fileRepository, fileStorageService) {
    this.fileRepository = fileRepository;
    this.downloadQueueKey = "download:queue";
  }

  /**
   * Téléchargement d'un fichier unique
   * @param {string} fileId
   * @param {string} userId
   * @returns {Promise<{file, fileStream}>}
   */
  async executeSingle(fileId, userId) {
    // Optionnel : lecture du cache si pertinent (ex: file metadata)
    const file = await this.fileRepository.findById(fileId);
    if (!file) throw new Error("Fichier non trouvé");

    // Vérifier les droits de téléchargement
    if (
      typeof file.canBeDownloadedBy === "function" &&
      !file.canBeDownloadedBy(userId)
    ) {
      throw new Error("Accès refusé à ce fichier");
    }

    // Récupérer le stream du fichier distant
    const fileStream = await this.fileStorageService.download(
      file.fileName,
      file.fileName
    );

    // Incrémenter le compteur de téléchargements
    await this.fileRepository.incrementDownloadCount(fileId, userId);

    return { file, fileStream };
  }

  /**
   * Téléchargement multiple (avec file queue)
   * @param {string[]} fileIds
   * @param {string} userId
   * @returns {Promise<{zipStream, files}>}
   */
  async executeMultiple(fileIds, userId) {
    // Mettre en attente la demande (file queue Redis via CacheService)

    // Récupérer les fichiers
    const files = [];
    for (const fileId of fileIds) {
      const file = await this.fileRepository.findById(fileId);
      if (file && (!file.canBeDownloadedBy || file.canBeDownloadedBy(userId))) {
        files.push(file);
      }
    }
    if (files.length === 0) throw new Error("Aucun fichier téléchargeable");

    // Générer un ZIP à la volée
    const zipStream = archiver("zip", { zlib: { level: 9 } });
    const passThrough = new stream.PassThrough();

    zipStream.pipe(passThrough);

    for (const file of files) {
      const fileStream = await this.fileStorageService.download(
        file.fileName,
        file.fileName
      );
      zipStream.append(fileStream, {
        name: file.originalName || file.fileName,
      });
      await this.fileRepository.incrementDownloadCount(file._id, userId);
    }
    zipStream.finalize();

    return { zipStream: passThrough, files };
  }
}

module.exports = DownloadFile;
