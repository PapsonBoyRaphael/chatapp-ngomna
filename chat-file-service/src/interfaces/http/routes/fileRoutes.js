const express = require("express");
const multer = require("multer");
const path = require("path");
const { authMiddleware, validationMiddleware } = require("../middleware");

// Configuration multer pour l'upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../../../../uploads/"));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// Supprimer toute restriction sur le type de fichier
const fileFilter = (req, file, cb) => {
  cb(null, true); // Accepte tous les fichiers
};

const upload = multer({
  storage: storage,
  // limits: { fileSize: ... }, // tu peux garder la limite de taille si tu veux
  fileFilter: fileFilter,
});

function createFileRoutes(fileController) {
  const router = express.Router();

  // **VALIDATION CRITIQUE : S'ASSURER QUE LE CONTRÔLEUR EXISTE**
  if (!fileController) {
    console.error("❌ FileController manquant dans createFileRoutes");
    // Retourner un router avec des routes d'erreur
    router.all("*", (req, res) => {
      res.status(503).json({
        success: false,
        message: "Service de fichiers temporairement indisponible",
        error: "FileController non initialisé",
      });
    });
    return router;
  }

  // **VALIDATION DES MÉTHODES DU CONTRÔLEUR**
  const requiredMethods = ["uploadFile", "getFile", "deleteFile", "getFiles"];
  const missingMethods = requiredMethods.filter(
    (method) => typeof fileController[method] !== "function"
  );

  if (missingMethods.length > 0) {
    console.error(
      `❌ Méthodes manquantes dans FileController: ${missingMethods.join(", ")}`
    );
    router.all("*", (req, res) => {
      res.status(503).json({
        success: false,
        message: "Service de fichiers incomplet",
        error: `Méthodes manquantes: ${missingMethods.join(", ")}`,
      });
    });
    return router;
  }

  // Middleware d'authentification pour toutes les routes
  router.use(authMiddleware.validateToken);

  // Routes des fichiers avec gestion d'erreurs
  try {
    // GET /files - Lister les fichiers
    router.get("/", async (req, res) => {
      try {
        await fileController.getFiles(req, res);
      } catch (error) {
        console.error("❌ Erreur route GET /files:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de la récupération des fichiers",
          error: error.message,
        });
      }
    });

    // POST /files/upload - Upload d'un fichier
    router.post("/upload", upload.single("file"), async (req, res) => {
      try {
        await fileController.uploadFile(req, res);
      } catch (error) {
        console.error("❌ Erreur route POST /files/upload:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de l'upload du fichier",
          error: error.message,
        });
      }
    });

    // GET /files/:fileId - Télécharger un fichier
    router.get(
      "/:fileId",
      validationMiddleware.validateMongoId("fileId"),
      async (req, res) => {
        try {
          await fileController.getFile(req, res);
        } catch (error) {
          console.error("❌ Erreur route GET /files/:fileId:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération du fichier",
            error: error.message,
          });
        }
      }
    );

    // DELETE /files/:fileId - Supprimer un fichier
    router.delete(
      "/:fileId",
      validationMiddleware.validateMongoId("fileId"),
      async (req, res) => {
        try {
          await fileController.deleteFile(req, res);
        } catch (error) {
          console.error("❌ Erreur route DELETE /files/:fileId:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors de la suppression du fichier",
            error: error.message,
          });
        }
      }
    );

    // GET /files/conversation/:conversationId - Fichiers d'une conversation
    router.get(
      "/conversation/:conversationId",
      validationMiddleware.validateMongoId("conversationId"),
      async (req, res) => {
        try {
          await fileController.getConversationFiles(req, res);
        } catch (error) {
          console.error(
            "❌ Erreur route GET /files/conversation/:conversationId:",
            error
          );
          res.status(500).json({
            success: false,
            message:
              "Erreur lors de la récupération des fichiers de conversation",
            error: error.message,
          });
        }
      }
    );

    // ✅ AJOUTER CETTE ROUTE
    // GET /files/:fileId/thumbnail/:size - Récupérer un thumbnail
    router.get(
      "/:fileId/thumbnail/:size?",
      validationMiddleware.validateMongoId("fileId"),
      async (req, res) => {
        try {
          const { fileId, size = "medium" } = req.params;

          // Récupérer les métadonnées du fichier
          const file = await fileController.getFileMetadata(req, res);

          if (!file.metadata.processing.thumbnailGenerated) {
            return res.status(404).json({
              success: false,
              message: "Thumbnail non disponible",
            });
          }

          // Trouver le thumbnail de la taille demandée
          const thumbnail = file.metadata.processing.thumbnails?.find(
            (t) => t.size === size
          );

          if (!thumbnail) {
            return res.status(404).json({
              success: false,
              message: `Thumbnail taille ${size} non trouvé`,
            });
          }

          // Rediriger vers l'URL du thumbnail
          res.redirect(thumbnail.url);
        } catch (error) {
          console.error("❌ Erreur récupération thumbnail:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération du thumbnail",
          });
        }
      }
    );

    console.log("✅ Routes de fichiers configurées");
  } catch (error) {
    console.error("❌ Erreur configuration routes fichiers:", error);

    // Route de fallback en cas d'erreur
    router.all("*", (req, res) => {
      res.status(500).json({
        success: false,
        message: "Erreur de configuration du service de fichiers",
        error: error.message,
      });
    });
  }

  return router;
}

module.exports = createFileRoutes;
