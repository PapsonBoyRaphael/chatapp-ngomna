const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

class UploadFile {
  constructor(fileRepository, messageRepository, conversationRepository) {
    this.fileRepository = fileRepository;
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
  }

  async execute({ file, uploadedBy, conversationId, receiverId }) {
    try {
      const fileId = uuidv4();
      const fileExtension = path.extname(file.originalname);
      const fileName = `${fileId}${fileExtension}`;
      
      // Déterminer le type de fichier
      const fileType = this.getFileType(file.mimetype);
      
      // Créer le chemin de destination
      const uploadDir = path.join(process.env.UPLOAD_PATH || './uploads', fileType.toLowerCase());
      await fs.ensureDir(uploadDir);
      
      const filePath = path.join(uploadDir, fileName);
      const fileUrl = `/uploads/${fileType.toLowerCase()}/${fileName}`;

      // Déplacer le fichier
      await fs.move(file.path, filePath);

      // Traitement spécial pour les images
      let metadata = {
        duration: null,
        dimensions: null,
        thumbnail: null,
        compressed: false
      };

      if (fileType === 'IMAGE') {
        try {
          const imageInfo = await sharp(filePath).metadata();
          metadata.dimensions = {
            width: imageInfo.width,
            height: imageInfo.height
          };

          // Créer une miniature
          const thumbnailPath = path.join(uploadDir, `thumb_${fileName}`);
          await sharp(filePath)
            .resize(200, 200, { 
              fit: 'inside',
              withoutEnlargement: true 
            })
            .jpeg({ quality: 80 })
            .toFile(thumbnailPath);
          
          metadata.thumbnail = `/uploads/${fileType.toLowerCase()}/thumb_${fileName}`;
        } catch (error) {
          console.error('Erreur traitement image:', error);
        }
      }

      // Sauvegarder les informations du fichier
      const savedFile = await this.fileRepository.saveFile({
        originalName: file.originalname,
        fileName,
        mimeType: file.mimetype,
        size: file.size,
        path: filePath,
        url: fileUrl,
        uploadedBy,
        conversationId,
        metadata,
        status: 'COMPLETED'
      });

      // Créer un message avec le fichier
      const messageContent = fileType === 'IMAGE' ? '📷 Image' : 
                           fileType === 'VIDEO' ? '🎥 Vidéo' :
                           fileType === 'AUDIO' ? '🎵 Audio' :
                           `📎 ${file.originalname}`;

      const message = await this.messageRepository.saveMessage({
        conversationId,
        senderId: uploadedBy,
        receiverId,
        content: messageContent,
        type: fileType,
        metadata: {
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          fileUrl: fileUrl,
          thumbnail: metadata.thumbnail,
          ...metadata
        }
      });

      // Mettre à jour le fichier avec l'ID du message
      savedFile.messageId = message._id;
      await savedFile.save();

      return {
        file: savedFile,
        message: message
      };

    } catch (error) {
      console.error('Erreur lors de l\'upload:', error);
      throw error;
    }
  }

  getFileType(mimeType) {
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.startsWith('audio/')) return 'AUDIO';
    return 'DOCUMENT';
  }
}

module.exports = UploadFile;
