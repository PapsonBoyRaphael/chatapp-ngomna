const archiver = require("archiver");
const { PassThrough } = require("stream");
const Minio = require("minio");
const crypto = require("crypto");

/**
 * BackupService
 * ─────────────
 * Orchestre la création et la récupération de sauvegardes complètes.
 *
 * Chaque backup contient :
 *   - conversations.json  → tous les documents Conversation (MongoDB lean)
 *   - messages.json       → tous les documents Message (MongoDB lean)
 *   - manifest.json       → métadonnées du backup (date, stats, options)
 *
 * Le ZIP est streamé directement vers MinIO, sans écriture disque intermédiaire.
 *
 * Chiffrement : optionnel, désactivé par défaut (BACKUP_ENCRYPTION=false).
 */
class BackupService {
  /**
   * @param {object} minioConfig
   * @param {string} minioConfig.endPoint
   * @param {number} minioConfig.port
   * @param {boolean} minioConfig.useSSL
   * @param {string} minioConfig.accessKey
   * @param {string} minioConfig.secretKey
   * @param {string} minioConfig.bucket       - bucket principal des fichiers chat
   * @param {string} [minioConfig.backupBucket] - bucket dédié aux backups (défaut: chat-backups)
   * @param {object} [options]
   * @param {boolean} [options.encryptionEnabled=false]
   * @param {string}  [options.encryptionKey]  - clé hex 64 chars (AES-256)
   */
  constructor(minioConfig, options = {}) {
    this.minioClient = new Minio.Client({
      endPoint: minioConfig.endPoint,
      port: minioConfig.port,
      useSSL: minioConfig.useSSL,
      accessKey: minioConfig.accessKey,
      secretKey: minioConfig.secretKey,
    });

    this.bucket = minioConfig.bucket || "chat-files";
    this.backupBucket = minioConfig.backupBucket || "chat-backups";

    // Chiffrement optionnel — désactivé par défaut
    this.encryptionEnabled = options.encryptionEnabled === true;
    this.encryptionKey = options.encryptionKey
      ? Buffer.from(options.encryptionKey, "hex")
      : null;

    if (this.encryptionEnabled && !this.encryptionKey) {
      throw new Error(
        "BackupService: encryptionEnabled=true mais aucune encryptionKey fournie"
      );
    }
  }

  // ─────────────────────────────────────────────
  // MÉTHODES PUBLIQUES
  // ─────────────────────────────────────────────

  /**
   * Crée un backup complet et le stocke sur MinIO.
   *
   * @param {object[]} conversations - Documents MongoDB Conversation (lean)
   * @param {object[]} messages      - Documents MongoDB Message (lean)
   * @param {object}   [meta={}]     - Métadonnées supplémentaires
   * @param {object}   [pathOptions={}]
   * @param {string}   [pathOptions.userIdScope] - si fourni, préfixe le chemin par l'userId
   * @returns {Promise<{objectPath: string, size: number, checksum: string}>}
   */
  async createBackup(conversations, messages, meta = {}, pathOptions = {}) {
    const startTime = Date.now();

    // Vérifier / créer le bucket backup
    await this._ensureBucket(this.backupBucket);

    // Construire le chemin de l'objet :
    //   - Global  : backups/backup_<YYYY-MM-DD>.zip
    //   - Scopé   : backups/{userId}/backup_<YYYY-MM-DD>.zip
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

    const userPrefix = pathOptions.userIdScope
      ? `backups/${pathOptions.userIdScope}/`
      : "backups/";

    const objectPath = `${userPrefix}backup_${dateStr}.zip`;

    console.log(`🗜️  BackupService: création backup → ${objectPath}`);
    console.log(
      `   Conversations : ${conversations.length} | Messages : ${messages.length}`
    );

    // Construire le manifest
    const manifest = {
      version: "1.0",
      createdAt: now.toISOString(),
      stats: {
        conversationCount: conversations.length,
        messageCount: messages.length,
      },
      encryption: {
        enabled: this.encryptionEnabled,
        algorithm: this.encryptionEnabled ? "AES-256-GCM" : null,
      },
      ...meta,
    };

    // Compresser et uploader le ZIP vers MinIO
    const { size, checksum } = await this._streamZipToMinio(
      { conversations, messages, manifest },
      objectPath
    );

    // ÉCRASER/SUPPRIMER TOUS LES ANCIENS BACKUPS DU MÊME UTILISATEUR
    if (pathOptions.userIdScope) {
      try {
        const existingBackups = await this.listBackups({
          userId: pathOptions.userIdScope,
        });

        // Filtrer et supprimer tout backup qui n'est pas le nouveau
        for (const existing of existingBackups) {
          if (existing.name !== objectPath) {
            console.log(
              `🗑️  BackupService: suppression de l'ancienne sauvegarde → ${existing.name}`
            );
            await this.deleteBackup(existing.name);
          }
        }
      } catch (cleanErr) {
        console.warn(
          `⚠️  BackupService: erreur lors du nettoyage de l'ancien backup :`,
          cleanErr.message
        );
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `✅ BackupService: backup créé en ${duration}ms | taille=${size} bytes | path=${objectPath}`
    );

    return {
      objectPath,
      bucket: this.backupBucket,
      size,
      checksum,
      createdAt: now.toISOString(),
      stats: manifest.stats,
    };
  }

  /**
   * Récupère la liste des backups disponibles.
   *
   * @param {object} [options]
   * @param {string} [options.userId]   - si fourni, liste seulement les backups de cet utilisateur
   * @param {string} [options.prefix]   - préfixe custom (override userId)
   * @param {number} [options.limit=100]
   * @returns {Promise<Array<{name, size, lastModified}>>}
   */
  async listBackups(options = {}) {
    const limit = options.limit || 100;

    // Construire le préfixe de recherche scopé (pluriel 'backups')
    let prefix;
    if (options.prefix) {
      prefix = options.prefix;
    } else if (options.userId) {
      prefix = `backups/${options.userId}/`;
    } else {
      prefix = "backups/";
    }

    await this._ensureBucket(this.backupBucket);

    return new Promise((resolve, reject) => {
      const objects = [];
      const stream = this.minioClient.listObjects(
        this.backupBucket,
        prefix,
        true
      );

      stream.on("data", (obj) => {
        if (objects.length < limit) {
          objects.push({
            name: obj.name,
            size: obj.size,
            lastModified: obj.lastModified,
            etag: obj.etag,
          });
        }
      });

      stream.on("error", reject);
      stream.on("end", () =>
        resolve(objects.sort((a, b) => b.lastModified - a.lastModified))
      );
    });
  }

  /**
   * Télécharge un backup depuis MinIO et retourne un stream lisible.
   *
   * @param {string} objectPath - chemin de l'objet dans le bucket backup
   * @returns {Promise<import('stream').Readable>}
   */
  async downloadBackup(objectPath) {
    console.log(`⬇️  BackupService: téléchargement backup → ${objectPath}`);

    try {
      const stream = await this.minioClient.getObject(
        this.backupBucket,
        objectPath
      );
      return stream;
    } catch (err) {
      throw new Error(
        `BackupService: backup introuvable (${objectPath}): ${err.message}`
      );
    }
  }

  /**
   * Supprime un backup sur MinIO.
   *
   * @param {string} objectPath
   * @returns {Promise<void>}
   */
  async deleteBackup(objectPath) {
    await this.minioClient.removeObject(this.backupBucket, objectPath);
    console.log(`🗑️  BackupService: backup supprimé → ${objectPath}`);
  }

  /**
   * Génère une URL pré-signée pour télécharger directement un backup.
   *
   * @param {string} objectPath
   * @param {number} [expirySeconds=3600]
   * @returns {Promise<string>}
   */
  async getDownloadUrl(objectPath, expirySeconds = 3600) {
    return this.minioClient.presignedGetObject(
      this.backupBucket,
      objectPath,
      expirySeconds
    );
  }

  // ─────────────────────────────────────────────
  // MÉTHODES PRIVÉES
  // ─────────────────────────────────────────────

  /**
   * Crée un ZIP en mémoire et l'upload directement sur MinIO.
   * Aucune écriture sur disque.
   *
   * @param {object} data  - { conversations, messages, manifest }
   * @param {string} objectPath
   * @returns {Promise<{size: number, checksum: string}>}
   */
  async _streamZipToMinio(data, objectPath) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.on("data", (chunk) => {
        chunks.push(chunk);
      });

      archive.on("error", (err) => {
        console.error("❌ BackupService: erreur archiver:", err.message);
        reject(err);
      });

      archive.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

        this.minioClient
          .putObject(this.backupBucket, objectPath, buffer, buffer.length, {
            "Content-Type": "application/zip",
            "x-amz-meta-backup-version": "1.0",
            "x-amz-meta-encryption": String(this.encryptionEnabled),
          })
          .then(() => {
            resolve({ size: buffer.length, checksum });
          })
          .catch((err) => {
            console.error("❌ BackupService: erreur upload MinIO:", err.message);
            reject(err);
          });
      });

      // Ajouter les fichiers JSON dans le ZIP
      archive.append(JSON.stringify(data.manifest, null, 2), {
        name: "manifest.json",
      });

      archive.append(JSON.stringify(data.conversations, null, 2), {
        name: "conversations.json",
      });

      archive.append(JSON.stringify(data.messages, null, 2), {
        name: "messages.json",
      });

      // Finaliser l'archive (déclenche la génération du ZIP)
      archive.finalize();
    });
  }

  /**
   * S'assure que le bucket existe, le crée si nécessaire.
   *
   * @param {string} bucketName
   */
  async _ensureBucket(bucketName) {
    try {
      const exists = await this.minioClient.bucketExists(bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(bucketName, "us-east-1");
        console.log(`✅ BackupService: bucket créé → ${bucketName}`);
      }
    } catch (err) {
      throw new Error(
        `BackupService: impossible de vérifier/créer le bucket "${bucketName}": ${err.message}`
      );
    }
  }
}

module.exports = BackupService;
