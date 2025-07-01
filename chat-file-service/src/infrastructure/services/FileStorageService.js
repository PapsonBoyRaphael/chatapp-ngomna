const Minio = require("minio");
const Client = require("ssh2-sftp-client");
const fs = require("fs");
const path = require("path");

class FileStorageService {
  constructor(config) {
    this.env = config.env || "development";
    if (this.env === "development") {
      this.minioClient = new Minio.Client({
        endPoint: config.s3Endpoint.replace(/^https?:\/\//, "").split(":")[0],
        port: parseInt(config.s3Endpoint.split(":").pop(), 10) || 9000,
        useSSL: config.s3Endpoint.startsWith("https"),
        accessKey: config.s3AccessKeyId,
        secretKey: config.s3SecretAccessKey,
      });
      this.bucket = config.s3Bucket;
    } else if (this.env === "production") {
      this.sftpConfig = config.sftpConfig;
    }
  }

  // Upload vers MinIO
  async uploadToMinio(localFilePath, remoteFileName) {
    // S'assurer que le bucket existe
    const exists = await this.minioClient.bucketExists(this.bucket);
    if (!exists) {
      await this.minioClient.makeBucket(this.bucket);
    }
    await this.minioClient.fPutObject(
      this.bucket,
      remoteFileName,
      localFilePath
    );
    return `${this.bucket}/${remoteFileName}`;
  }

  // Upload via SFTP (inchangé)
  async uploadToSFTP(localFilePath, remoteFileName) {
    const sftp = new Client();
    try {
      await sftp.connect(this.sftpConfig);
      await sftp.put(
        localFilePath,
        path.posix.join(this.sftpConfig.remotePath, remoteFileName)
      );
      await sftp.end();
      return `${this.sftpConfig.remotePath}/${remoteFileName}`;
    } catch (err) {
      await sftp.end();
      throw err;
    }
  }

  // Méthode générique
  async upload(localFilePath, remoteFileName) {
    if (this.env === "development") {
      return this.uploadToMinio(localFilePath, remoteFileName);
    } else if (this.env === "production") {
      return this.uploadToSFTP(localFilePath, remoteFileName);
    }
    throw new Error("Environnement inconnu");
  }

  // Télécharger un fichier (retourne un stream)
  async download(localFileName, remoteFileName) {
    if (this.env === "development") {
      // MinIO
      return await this.minioClient.getObject(this.bucket, remoteFileName);
    } else if (this.env === "production") {
      // SFTP
      const sftp = new Client();
      try {
        await sftp.connect(this.sftpConfig);
        const tmpPath = path.join("/tmp", remoteFileName);
        await sftp.fastGet(
          path.posix.join(this.sftpConfig.remotePath, remoteFileName),
          tmpPath
        );
        await sftp.end();
        return fs.createReadStream(tmpPath);
      } catch (err) {
        await sftp.end();
        throw err;
      }
    }
    throw new Error("Environnement inconnu");
  }

  // Supprimer un fichier distant
  async delete(remoteFileName) {
    if (this.env === "development") {
      // MinIO
      await this.minioClient.removeObject(this.bucket, remoteFileName);
      return true;
    } else if (this.env === "production") {
      // SFTP
      const sftp = new Client();
      try {
        await sftp.connect(this.sftpConfig);
        await sftp.delete(
          path.posix.join(this.sftpConfig.remotePath, remoteFileName)
        );
        await sftp.end();
        return true;
      } catch (err) {
        await sftp.end();
        throw err;
      }
    }
    throw new Error("Environnement inconnu");
  }
}

module.exports = FileStorageService;
