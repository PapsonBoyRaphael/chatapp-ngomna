const FileModel = require("../mongodb/models/FileModel");

class MongoFileRepository {
  async saveFile(fileData) {
    try {
      const file = new FileModel(fileData);
      await file.save();
      return file;
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du fichier:", error);
      throw error;
    }
  }

  async getFileById(fileId) {
    try {
      return await FileModel.findById(fileId);
    } catch (error) {
      console.error("Erreur lors de la récupération du fichier:", error);
      throw error;
    }
  }

  async getFilesByConversation(conversationId) {
    try {
      return await FileModel.find({ conversationId })
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      console.error("Erreur lors de la récupération des fichiers:", error);
      throw error;
    }
  }

  async getFilesByUser(userId) {
    try {
      return await FileModel.find({ uploadedBy: userId })
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      console.error("Erreur lors de la récupération des fichiers utilisateur:", error);
      throw error;
    }
  }

  async updateFileStatus(fileId, status) {
    try {
      return await FileModel.findByIdAndUpdate(
        fileId,
        { status },
        { new: true }
      );
    } catch (error) {
      console.error("Erreur lors de la mise à jour du statut:", error);
      throw error;
    }
  }

  async deleteFile(fileId) {
    try {
      return await FileModel.findByIdAndDelete(fileId);
    } catch (error) {
      console.error("Erreur lors de la suppression du fichier:", error);
      throw error;
    }
  }
}

module.exports = MongoFileRepository;
