const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

// Configuration multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(process.env.UPLOAD_PATH || './uploads', 'temp');
    await fs.ensureDir(tempDir);
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp3|mp4|avi|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  }
});

class FileController {
  constructor(uploadFileUseCase, getFileUseCase) {
    this.uploadFileUseCase = uploadFileUseCase;
    this.getFileUseCase = getFileUseCase;
    this.upload = upload;
  }

  async uploadFile(req, res) {
    try {
      const { conversationId, receiverId } = req.body;
      const uploadedBy = req.user?.id || req.body.uploadedBy;

      if (!req.file) {
        return res.status(400).json({ message: 'Aucun fichier fourni' });
      }

      if (!conversationId || !receiverId || !uploadedBy) {
        return res.status(400).json({ 
          message: 'conversationId, receiverId et uploadedBy sont requis' 
        });
      }

      const result = await this.uploadFileUseCase.execute({
        file: req.file,
        uploadedBy,
        conversationId,
        receiverId
      });

      res.json({
        success: true,
        file: result.file,
        message: result.message
      });

    } catch (error) {
      console.error('Erreur upload:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async downloadFile(req, res) {
    try {
      const { fileId } = req.params;
      
      const file = await this.getFileUseCase.execute(fileId);
      
      if (!file) {
        return res.status(404).json({ message: 'Fichier non trouvé' });
      }

      if (!fs.existsSync(file.path)) {
        return res.status(404).json({ message: 'Fichier physique non trouvé' });
      }

      res.download(file.path, file.originalName);

    } catch (error) {
      console.error('Erreur download:', error);
      res.status(500).json({ message: error.message });
    }
  }

  async getFileInfo(req, res) {
    try {
      const { fileId } = req.params;
      
      const file = await this.getFileUseCase.execute(fileId);
      
      if (!file) {
        return res.status(404).json({ message: 'Fichier non trouvé' });
      }

      res.json(file);

    } catch (error) {
      console.error('Erreur get file info:', error);
      res.status(500).json({ message: error.message });
    }
  }
}

module.exports = FileController;
