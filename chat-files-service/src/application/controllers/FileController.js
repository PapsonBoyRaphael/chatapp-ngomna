/**
 * Contrôleur pour la gestion des fichiers
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../shared/utils/logger');
const FileResponse = require('../dto/responses/FileResponse');
const PaginatedResponse = require('../dto/responses/PaginatedResponse');

const logger = createLogger('FileController');

class FileController {
  constructor(dependencies) {
    this.uploadFileUseCase = dependencies.uploadFileUseCase;
    this.downloadFileUseCase = dependencies.downloadFileUseCase;
    this.deleteFileUseCase = dependencies.deleteFileUseCase;
    this.getFileMetadataUseCase = dependencies.getFileMetadataUseCase;
    this.compressImageUseCase = dependencies.compressImageUseCase;
    this.generateThumbnailUseCase = dependencies.generateThumbnailUseCase;
  }

  /**
   * Upload d'un fichier
   */
  async uploadFile(request, reply) {
    try {
      const userId = request.user.id;
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          success: false,
          error: 'Aucun fichier fourni',
          timestamp: new Date().toISOString()
        });
      }

      logger.info('Upload d\'un fichier:', { 
        userId, 
        filename: data.filename, 
        mimetype: data.mimetype 
      });

      const file = await this.uploadFileUseCase.execute({
        userId,
        fileData: data,
        metadata: {
          originalName: data.filename,
          mimeType: data.mimetype,
          size: data.file.bytesRead || 0
        }
      });

      const response = new FileResponse(file);

      reply.status(201).send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de l\'upload du fichier:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Téléchargement d'un fichier
   */
  async downloadFile(request, reply) {
    try {
      const { fileId } = request.params;
      const { thumbnail = false } = request.query;
      const userId = request.user.id;

      logger.info('Téléchargement d\'un fichier:', { userId, fileId, thumbnail });

      const fileStream = await this.downloadFileUseCase.execute({
        fileId,
        userId,
        options: { thumbnail: thumbnail === 'true' }
      });

      // Définir les headers appropriés
      reply.type(fileStream.mimeType);
      reply.header('Content-Disposition', `attachment; filename="${fileStream.filename}"`);
      reply.header('Content-Length', fileStream.size);

      return reply.send(fileStream.stream);

    } catch (error) {
      logger.error('Erreur lors du téléchargement du fichier:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Récupérer les métadonnées d'un fichier
   */
  async getFileMetadata(request, reply) {
    try {
      const { fileId } = request.params;
      const userId = request.user.id;

      logger.info('Récupération des métadonnées:', { userId, fileId });

      const file = await this.getFileMetadataUseCase.execute({
        fileId,
        userId
      });

      const response = new FileResponse(file);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la récupération des métadonnées:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Supprimer un fichier
   */
  async deleteFile(request, reply) {
    try {
      const { fileId } = request.params;
      const userId = request.user.id;

      logger.info('Suppression d\'un fichier:', { userId, fileId });

      await this.deleteFileUseCase.execute({
        fileId,
        userId
      });

      reply.status(204).send();

    } catch (error) {
      logger.error('Erreur lors de la suppression du fichier:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Compresser une image
   */
  async compressImage(request, reply) {
    try {
      const { fileId } = request.params;
      const { quality = 80, width, height } = request.body;
      const userId = request.user.id;

      logger.info('Compression d\'une image:', { userId, fileId, quality });

      const compressedFile = await this.compressImageUseCase.execute({
        fileId,
        userId,
        options: { quality, width, height }
      });

      const response = new FileResponse(compressedFile);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la compression de l\'image:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Générer une miniature
   */
  async generateThumbnail(request, reply) {
    try {
      const { fileId } = request.params;
      const { size = 150 } = request.query;
      const userId = request.user.id;

      logger.info('Génération d\'une miniature:', { userId, fileId, size });

      const thumbnail = await this.generateThumbnailUseCase.execute({
        fileId,
        userId,
        size: parseInt(size)
      });

      const response = new FileResponse(thumbnail);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la génération de la miniature:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = FileController;
