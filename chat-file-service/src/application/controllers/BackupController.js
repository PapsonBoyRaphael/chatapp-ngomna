/**
 * BackupController
 * ─────────────────
 * Expose les endpoints REST pour la gestion des backups.
 * Toutes les opérations sont scopées au userId authentifié.
 *
 *   POST   /backups/export         → Lancer un export des données du user connecté
 *   GET    /backups                → Lister les backups du user connecté
 *   POST   /backups/restore        → Restaurer depuis un backup (admin ou même user)
 *   GET    /backups/download       → Obtenir une URL de téléchargement (scopée)
 *   DELETE /backups                → Supprimer un backup du user
 */
class BackupController {
  /**
   * @param {import('../../application/use-cases/ExportConversationBackup')} exportUseCase
   * @param {import('../../application/use-cases/RestoreConversationBackup')} restoreUseCase
   * @param {import('../../infrastructure/services/BackupService')} backupService
   */
  constructor(exportUseCase, restoreUseCase, backupService) {
    this.exportUseCase = exportUseCase;
    this.restoreUseCase = restoreUseCase;
    this.backupService = backupService;

    this.exportBackup = this.exportBackup.bind(this);
    this.listBackups = this.listBackups.bind(this);
    this.restoreBackup = this.restoreBackup.bind(this);
    this.getDownloadUrl = this.getDownloadUrl.bind(this);
    this.deleteBackup = this.deleteBackup.bind(this);
  }

  // ─────────────────────────────────────────────
  // Utilitaire : extraire l'userId depuis la requête
  // ─────────────────────────────────────────────
  _getUserId(req) {
    return (
      req.user?.id ||
      req.user?.userId ||
      req.headers["user-id"] ||
      null
    );
  }

  // ─────────────────────────────────────────────
  // POST /backups/export
  // ─────────────────────────────────────────────
  /**
   * Lance un export des conversations et messages de l'utilisateur connecté.
   *
   * Body (optionnel):
   *   { conversationId?: string, label?: string }
   */
  async exportBackup(req, res) {
    const startTime = Date.now();

    try {
      const userId = this._getUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentification requise pour créer un backup",
          code: "MISSING_USER_ID",
        });
      }

      const { conversationId = null, label = "manual-backup" } = req.body || {};

      console.log(
        `📦 BackupController.exportBackup: userId=${userId} | conversationId=${conversationId || "toutes"} | label=${label}`
      );

      const result = await this.exportUseCase.execute({
        userId,
        label,
        conversationId,
      });

      const processingTime = Date.now() - startTime;

      return res.status(202).json({
        success: true,
        message: "Backup créé avec succès",
        data: {
          objectPath: result.objectPath,
          bucket: result.bucket,
          size: result.size,
          checksum: result.checksum,
          createdAt: result.createdAt,
          stats: result.stats,
          durationMs: result.durationMs,
          userId,
        },
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ BackupController.exportBackup:", error);

      return res.status(500).json({
        success: false,
        message: "Erreur lors de la création du backup",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "BACKUP_EXPORT_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // ─────────────────────────────────────────────
  // GET /backups
  // ─────────────────────────────────────────────
  /**
   * Liste les backups de l'utilisateur connecté.
   * Les backups sont filtrés automatiquement par userId dans le préfixe MinIO.
   *
   * Query params:
   *   limit?: number  (défaut: 100)
   */
  async listBackups(req, res) {
    const startTime = Date.now();

    try {
      const userId = this._getUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentification requise",
          code: "MISSING_USER_ID",
        });
      }

      const { limit = "100" } = req.query;

      // Filtrer par userId — seuls les backups du user sont retournés
      const backups = await this.backupService.listBackups({
        userId,
        limit: Math.min(parseInt(limit) || 100, 500),
      });

      const processingTime = Date.now() - startTime;

      return res.json({
        success: true,
        data: {
          backups,
          count: backups.length,
          userId,
        },
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ BackupController.listBackups:", error);

      return res.status(500).json({
        success: false,
        message: "Erreur lors de la liste des backups",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "BACKUP_LIST_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // ─────────────────────────────────────────────
  // POST /backups/restore
  // ─────────────────────────────────────────────
  /**
   * Restaure un backup.
   * Vérifie que le backup appartient bien à l'utilisateur connecté
   * (le chemin MinIO doit contenir l'userId).
   *
   * Body:
   *   { objectPath: string, dryRun?: boolean, invalidateCache?: boolean }
   */
  async restoreBackup(req, res) {
    const startTime = Date.now();

    try {
      const userId = this._getUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentification requise",
          code: "MISSING_USER_ID",
        });
      }

      const { objectPath, dryRun = false, invalidateCache = true } = req.body || {};

      if (!objectPath) {
        return res.status(400).json({
          success: false,
          message: "Le champ 'objectPath' est requis",
          code: "MISSING_OBJECT_PATH",
        });
      }

      // Vérification de propriété : le chemin doit contenir l'userId du user connecté
      const expectedPrefix = `backups/${userId}/`;
      if (!objectPath.startsWith(expectedPrefix)) {
        return res.status(403).json({
          success: false,
          message: "Ce backup ne vous appartient pas",
          code: "BACKUP_ACCESS_DENIED",
        });
      }

      console.log(
        `🔄 BackupController.restoreBackup: userId=${userId} | objectPath=${objectPath} | dryRun=${dryRun}`
      );

      const result = await this.restoreUseCase.execute(objectPath, {
        dryRun: dryRun === true || dryRun === "true",
        invalidateCache:
          invalidateCache !== false && invalidateCache !== "false",
      });

      const processingTime = Date.now() - startTime;

      return res.json({
        success: true,
        message: result.dryRun
          ? "Dry run : backup valide, aucune donnée modifiée"
          : "Restauration effectuée avec succès",
        data: {
          manifest: result.manifest,
          restored: result.restored,
          dryRun: result.dryRun,
          durationMs: result.durationMs,
        },
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ BackupController.restoreBackup:", error);

      const statusCode = error.message?.includes("introuvable") ? 404 : 500;

      return res.status(statusCode).json({
        success: false,
        message: "Erreur lors de la restauration du backup",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "BACKUP_RESTORE_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // ─────────────────────────────────────────────
  // GET /backups/download
  // ─────────────────────────────────────────────
  /**
   * Génère une URL pré-signée pour télécharger un backup.
   * Vérifie que le backup appartient à l'utilisateur connecté.
   *
   * Query params:
   *   objectPath: string
   *   expiry?:    number  (secondes, défaut: 3600)
   */
  async getDownloadUrl(req, res) {
    const startTime = Date.now();

    try {
      const userId = this._getUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentification requise",
          code: "MISSING_USER_ID",
        });
      }

      const { objectPath, expiry = "3600" } = req.query;

      if (!objectPath) {
        return res.status(400).json({
          success: false,
          message: "Le paramètre 'objectPath' est requis",
          code: "MISSING_OBJECT_PATH",
        });
      }

      // Vérification de propriété
      const expectedPrefix = `backups/${userId}/`;
      if (!objectPath.startsWith(expectedPrefix)) {
        return res.status(403).json({
          success: false,
          message: "Ce backup ne vous appartient pas",
          code: "BACKUP_ACCESS_DENIED",
        });
      }

      const url = await this.backupService.getDownloadUrl(
        objectPath,
        parseInt(expiry) || 3600
      );

      const processingTime = Date.now() - startTime;

      return res.json({
        success: true,
        data: {
          downloadUrl: url,
          objectPath,
          expiresInSeconds: parseInt(expiry) || 3600,
          userId,
        },
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ BackupController.getDownloadUrl:", error);

      return res.status(500).json({
        success: false,
        message: "Erreur lors de la génération de l'URL de téléchargement",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "BACKUP_URL_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // ─────────────────────────────────────────────
  // DELETE /backups
  // ─────────────────────────────────────────────
  /**
   * Supprime un backup du user connecté.
   *
   * Body:
   *   { objectPath: string }
   */
  async deleteBackup(req, res) {
    const startTime = Date.now();

    try {
      const userId = this._getUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentification requise",
          code: "MISSING_USER_ID",
        });
      }

      const { objectPath } = req.body || {};

      if (!objectPath) {
        return res.status(400).json({
          success: false,
          message: "Le champ 'objectPath' est requis",
          code: "MISSING_OBJECT_PATH",
        });
      }

      // Vérification de propriété : un user ne peut supprimer que ses propres backups
      const expectedPrefix = `backups/${userId}/`;
      if (!objectPath.startsWith(expectedPrefix)) {
        return res.status(403).json({
          success: false,
          message: "Ce backup ne vous appartient pas",
          code: "BACKUP_ACCESS_DENIED",
        });
      }

      await this.backupService.deleteBackup(objectPath);

      const processingTime = Date.now() - startTime;

      return res.json({
        success: true,
        message: "Backup supprimé avec succès",
        data: { objectPath, userId },
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ BackupController.deleteBackup:", error);

      return res.status(500).json({
        success: false,
        message: "Erreur lors de la suppression du backup",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "BACKUP_DELETE_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}

module.exports = BackupController;
