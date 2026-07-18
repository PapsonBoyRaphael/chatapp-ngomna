const express = require("express");

/**
 * Routes Backup
 * ─────────────
 * @param {import('../../application/controllers/BackupController')} backupController
 * @returns {import('express').Router}
 */
function createBackupRoutes(backupController) {
  const router = express.Router();

  /**
   * POST /backups/export
   * Lancer un export complet → ZIP → MinIO
   * Body (optionnel): { conversationId?, label? }
   */
  router.post("/export", (req, res) => backupController.exportBackup(req, res));

  /**
   * GET /backups
   * Lister les backups disponibles sur MinIO
   * Query: prefix?, limit?
   */
  router.get("/", (req, res) => backupController.listBackups(req, res));

  /**
   * POST /backups/restore
   * Restaurer un backup depuis MinIO
   * Body: { objectPath: string, dryRun?: boolean, invalidateCache?: boolean }
   */
  router.post("/restore", (req, res) => backupController.restoreBackup(req, res));

  /**
   * GET /backups/download
   * Obtenir une URL pré-signée pour télécharger un backup
   * Query: objectPath, expiry?
   */
  router.get("/download", (req, res) => backupController.getDownloadUrl(req, res));

  /**
   * DELETE /backups
   * Supprimer un backup de MinIO
   * Body: { objectPath: string }
   */
  router.delete("/", (req, res) => backupController.deleteBackup(req, res));

  return router;
}

module.exports = createBackupRoutes;
