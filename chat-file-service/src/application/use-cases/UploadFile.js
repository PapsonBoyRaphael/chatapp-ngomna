const path = require("path");
const fs = require("fs-extra");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

class UploadFile {
  constructor(
    fileRepository,
    messageRepository,
    conversationRepository,
    kafkaProducer = null
  ) {
    this.fileRepository = fileRepository;
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer; // Ajout du producer Kafka
  }

  async execute({ file, uploadedBy, conversationId, receiverId }) {
    try {
      // Validation renforcée
      if (!file || !uploadedBy) {
        throw new Error("file et uploadedBy sont requis");
      }

      const fileId = uuidv4();
      const fileExtension = path.extname(file.originalname);
      const fileName = `${fileId}${fileExtension}`;

      // Déterminer le type de fichier
      const fileType = this.getFileType(file.mimetype);

      // 🚀 PUBLIER DÉBUT D'UPLOAD DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishFileUpload({
            eventType: "FILE_UPLOAD_STARTED",
            fileId,
            originalName: file.originalname,
            size: file.size,
            mimeType: file.mimetype,
            fileType,
            uploadedBy,
            conversationId,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication début upload Kafka:",
            kafkaError.message
          );
        }
      }

      // Créer le chemin de destination
      const uploadDir = path.join(
        process.env.UPLOAD_PATH || "./uploads",
        fileType.toLowerCase()
      );
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
        compressed: false,
        processedAt: new Date().toISOString(),
      };

      if (fileType === "IMAGE") {
        try {
          const imageInfo = await sharp(filePath).metadata();
          metadata.dimensions = {
            width: imageInfo.width,
            height: imageInfo.height,
          };

          // Créer une miniature optimisée
          const thumbnailPath = path.join(uploadDir, `thumb_${fileName}`);
          await sharp(filePath)
            .resize(200, 200, {
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: 80 })
            .toFile(thumbnailPath);

          metadata.thumbnail = `/uploads/${fileType.toLowerCase()}/thumb_${fileName}`;
          metadata.compressed = true;

          // 🚀 PUBLIER TRAITEMENT IMAGE DANS KAFKA
          if (this.kafkaProducer) {
            try {
              await this.kafkaProducer.publishFileUpload({
                eventType: "IMAGE_PROCESSED",
                fileId,
                originalDimensions: metadata.dimensions,
                thumbnailCreated: true,
                timestamp: new Date().toISOString(),
              });
            } catch (kafkaError) {
              console.warn(
                "⚠️ Erreur publication traitement image:",
                kafkaError.message
              );
            }
          }
        } catch (error) {
          console.error("Erreur traitement image:", error);
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
        status: "COMPLETED",
        fileId, // Ajouter l'ID unique
        fileType,
      });

      // Créer un message avec le fichier (métadonnées enrichies)
      const messageContent =
        fileType === "IMAGE"
          ? "📷 Image"
          : fileType === "VIDEO"
          ? "🎥 Vidéo"
          : fileType === "AUDIO"
          ? "🎵 Audio"
          : `📎 ${file.originalname}`;

      const enrichedMetadata = {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileUrl: fileUrl,
        thumbnail: metadata.thumbnail,
        fileId,
        fileType,
        uploadedAt: new Date().toISOString(),
        serverId: process.env.SERVER_ID || "default",
        ...metadata,
      };

      const message = await this.messageRepository.saveMessage({
        conversationId,
        senderId: uploadedBy,
        receiverId,
        content: messageContent,
        type: fileType,
        metadata: enrichedMetadata,
        status: "SENT",
      });

      // Mettre à jour la conversation
      await this.conversationRepository.updateLastMessage(
        conversationId,
        message._id
      );

      // Mettre à jour le fichier avec l'ID du message
      savedFile.messageId = message._id;
      await savedFile.save();

      // 🚀 PUBLIER UPLOAD TERMINÉ DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishFileUpload({
            eventType: "FILE_UPLOAD_COMPLETED",
            fileId,
            fileName: savedFile.fileName,
            originalName: savedFile.originalName,
            fileUrl,
            fileType,
            size: file.size,
            uploadedBy,
            conversationId,
            messageId: message._id,
            metadata: enrichedMetadata,
            timestamp: new Date().toISOString(),
            // Données pour notifications
            notificationData: {
              title: `Nouveau fichier partagé`,
              body: `${messageContent} (${(file.size / 1024).toFixed(1)} KB)`,
              data: {
                conversationId,
                senderId: uploadedBy,
                messageId: message._id,
                fileType,
                fileUrl,
              },
            },
          });

          console.log(`📤 Upload publié dans Kafka: ${fileId}`);
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication fin upload Kafka:",
            kafkaError.message
          );
        }
      }

      return {
        file: savedFile,
        message: message,
      };
    } catch (error) {
      console.error("❌ Erreur lors de l'upload:", error);

      // 🚀 PUBLIER ERREUR DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishFileUpload({
            eventType: "FILE_UPLOAD_FAILED",
            originalName: file?.originalname,
            uploadedBy,
            conversationId,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication échec upload:",
            kafkaError.message
          );
        }
      }

      throw error;
    }
  }

  getFileType(mimeType) {
    if (mimeType.startsWith("image/")) return "IMAGE";
    if (mimeType.startsWith("video/")) return "VIDEO";
    if (mimeType.startsWith("audio/")) return "AUDIO";
    if (mimeType.includes("pdf")) return "DOCUMENT";
    if (mimeType.includes("text/") || mimeType.includes("application/"))
      return "DOCUMENT";
    return "OTHER";
  }
}

module.exports = UploadFile;
