const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const File = require('../../../domain/entities/File');
const { fileUploadSchema } = require('../../../shared/utils/validator');
const config = require('../../../shared/config');

async function fileRoutes(fastify, options) {
  // Upload de fichier
  fastify.post('/upload', async (request, reply) => {
    try {
      const data = await request.file();
      
      if (!data) {
        reply.code(400);
        return {
          error: 'Bad Request',
          message: 'No file uploaded',
          statusCode: 400
        };
      }

      const { filename, mimetype, file } = data;
      const fields = data.fields;

      // Validation des champs requis
      const conversationId = fields.conversationId?.value;
      const uploadedBy = fields.uploadedBy?.value;

      if (!conversationId || !uploadedBy) {
        reply.code(400);
        return {
          error: 'Bad Request',
          message: 'conversationId and uploadedBy are required',
          statusCode: 400
        };
      }

      // Vérifier le type de fichier
      if (!config.fileStorage.allowedMimeTypes.includes(mimetype)) {
        reply.code(400);
        return {
          error: 'Invalid File Type',
          message: `File type ${mimetype} is not allowed`,
          statusCode: 400,
          allowedTypes: config.fileStorage.allowedMimeTypes
        };
      }

      // Générer un nom de fichier unique
      const fileExtension = path.extname(filename);
      const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
      const uploadPath = path.join(config.fileStorage.uploadPath, uniqueFilename);

      // Créer le dossier d'upload s'il n'existe pas
      await fs.promises.mkdir(config.fileStorage.uploadPath, { recursive: true });

      // Calculer la taille du fichier
      let fileSize = 0;
      const chunks = [];
      
      for await (const chunk of file) {
        fileSize += chunk.length;
        
        // Vérifier la taille maximale
        if (fileSize > config.fileStorage.maxFileSize) {
          reply.code(413);
          return {
            error: 'File Too Large',
            message: `File size exceeds maximum allowed size of ${config.fileStorage.maxFileSize} bytes`,
            statusCode: 413
          };
        }
        
        chunks.push(chunk);
      }

      // Écrire le fichier
      const fileBuffer = Buffer.concat(chunks);
      await fs.promises.writeFile(uploadPath, fileBuffer);

      // Créer l'entité File
      const fileEntity = File.create({
        originalName: filename,
        filename: uniqueFilename,
        mimetype,
        size: fileSize,
        uploadedBy,
        conversationId,
        path: uploadPath,
        metadata: {
          description: fields.description?.value || null,
          uploadedFrom: request.headers['user-agent'] || null
        }
      });

      // TODO: Sauvegarder en base de données
      // TODO: Générer une miniature si c'est une image
      // TODO: Notifier via WebSocket

      reply.code(201);
      return {
        success: true,
        data: {
          file: fileEntity.toJSON(),
          uploadUrl: `/api/v1/files/${fileEntity.id}`
        },
        message: 'File uploaded successfully'
      };

    } catch (error) {
      fastify.log.error('Upload error:', error);
      reply.code(500);
      return {
        error: 'Internal Server Error',
        message: 'Failed to upload file',
        statusCode: 500
      };
    }
  });

  // Télécharger un fichier
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;
    
    // TODO: Récupérer les informations du fichier depuis la base de données
    // Pour l'instant, retourner 404
    
    reply.code(404);
    return {
      error: 'Not Found',
      message: `File with id ${id} not found`,
      statusCode: 404
    };
  });

  // Obtenir les métadonnées d'un fichier
  fastify.get('/:id/info', async (request, reply) => {
    const { id } = request.params;
    
    // TODO: Récupérer depuis la base de données
    
    reply.code(404);
    return {
      error: 'Not Found',
      message: `File with id ${id} not found`,
      statusCode: 404
    };
  });

  // Supprimer un fichier
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    
    // TODO: Soft delete en base de données
    // TODO: Optionnellement supprimer le fichier physique
    
    reply.code(404);
    return {
      error: 'Not Found',
      message: `File with id ${id} not found`,
      statusCode: 404
    };
  });

  // Lister les fichiers d'une conversation
  fastify.get('/conversation/:conversationId', async (request, reply) => {
    const { conversationId } = request.params;
    const { page = 1, limit = 20, type } = request.query;

    // TODO: Récupérer depuis la base de données
    
    return {
      success: true,
      data: {
        files: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          totalPages: 0
        },
        conversationId
      }
    };
  });
}

module.exports = fileRoutes;
