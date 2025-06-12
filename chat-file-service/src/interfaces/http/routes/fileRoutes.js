const express = require('express');
const router = express.Router();

function createFileRoutes(fileController) {
  // Upload de fichier
  router.post('/upload', 
    fileController.upload.single('file'),
    (req, res) => fileController.uploadFile(req, res)
  );

  // Téléchargement de fichier
  router.get('/download/:fileId', (req, res) => 
    fileController.downloadFile(req, res)
  );

  // Informations du fichier
  router.get('/:fileId', (req, res) => 
    fileController.getFileInfo(req, res)
  );

  return router;
}

module.exports = createFileRoutes;
