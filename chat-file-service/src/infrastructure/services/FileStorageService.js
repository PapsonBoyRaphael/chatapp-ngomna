const Minio = require("minio");
const Client = require("ssh2-sftp-client");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");

class FileStorageService {
  constructor(config) {
    this.env = config.env || "development";
    this.encrypt = config.encrypt || false; // Active chiffrement (assume client-side primary)
    this.encryptionKey = config.encryptionKey || crypto.randomBytes(32); // Clé si server-side fallback
    this.compression = config.compression || true; // Active compression
    this.maxFileSize = config.maxFileSize || 100 * 1024 * 1024; // 100MB limit
    this.allowedMimes = config.allowedMimes || []; // ✅ ACCEPTE TOUS LES FICHIERS
    this.maxRetries = 3;

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
      this.sftpConfig = config.sftpConfig; // Gardé comme demandé
    }

    this.metrics = { uploads: 0, downloads: 0, deletes: 0, errors: 0 };
  }

  // Validation générique
  async validateFile(buffer, mimeType) {
    if (buffer.length > this.maxFileSize) throw new Error("Fichier trop grand");
    // ✅ ACCEPTER TOUS LES TYPES DE FICHIERS
    // Aucune restriction sur le MIME type
  }

  // Chiffrement buffer (server-side fallback ; prefer client-side)
  encryptBuffer(buffer) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  }

  // Déchiffrement stream (server-side fallback)
  decryptStream(stream) {
    // Logique pour extraire IV/tag du stream (assume prefixed)
    // Implémente avec ReadableStream pour full async
    // Ex. simplifié :
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      iv
    ); // iv from metadata or prefix
    return stream.pipe(decipher);
  }

  // Compression si needed
  async compressBuffer(buffer, mimeType) {
    if (!this.compression) return buffer;
    if (mimeType.startsWith("image/"))
      return await sharp(buffer).webp({ quality: 80 }).toBuffer();
    if (mimeType.startsWith("video/")) {
      return new Promise((resolve, reject) => {
        const inputPath = path.join("/tmp", `input-${Date.now()}`);
        fs.writeFile(inputPath, buffer, (err) => {
          if (err) return reject(err);
          ffmpeg(inputPath)
            .format("mp4")
            .videoBitrate(1000)
            .on("end", (stdout, stderr) => {
              fs.readFile(outputPath, (err, compressed) => {
                fs.unlink(inputPath);
                fs.unlink(outputPath);
                if (err) reject(err);
                resolve(compressed);
              });
            })
            .on("error", reject)
            .save((outputPath = path.join("/tmp", `output-${Date.now()}.mp4`)));
        });
      });
    }
    return buffer;
  }

  // Upload générique avec retries
  async upload(localFilePath, remoteFileName, retry = 0) {
    try {
      if (this.env === "development") {
        const exists = await this.minioClient.bucketExists(this.bucket);
        if (!exists) await this.minioClient.makeBucket(this.bucket);
        await this.minioClient.fPutObject(
          this.bucket,
          remoteFileName,
          localFilePath
        );
      } else if (this.env === "production") {
        const sftp = new Client();
        await sftp.connect(this.sftpConfig);
        await sftp.put(
          localFilePath,
          path.posix.join(this.sftpConfig.remotePath, remoteFileName)
        );
        await sftp.end();
      }
      this.metrics.uploads++;
      return this.env === "development"
        ? `${this.bucket}/${remoteFileName}`
        : `${this.sftpConfig.remotePath}/${remoteFileName}`;
    } catch (err) {
      this.metrics.errors++;
      if (retry < this.maxRetries)
        return this.upload(localFilePath, remoteFileName, retry + 1);
      throw err;
    }
  }

  // Upload from buffer avec validation/chiffrement/compression
  async uploadFromBuffer(buffer, remoteFileName, mimeType) {
    await this.validateFile(buffer, mimeType);
    buffer = await this.compressBuffer(buffer, mimeType);
    if (this.encrypt) buffer = this.encryptBuffer(buffer);

    try {
      if (this.env === "development") {
        const exists = await this.minioClient.bucketExists(this.bucket);
        if (!exists) await this.minioClient.makeBucket(this.bucket);
        await this.minioClient.putObject(
          this.bucket,
          remoteFileName,
          buffer,
          buffer.length,
          { "Content-Type": mimeType }
        );
        return `${this.bucket}/${remoteFileName}`;
      } else if (this.env === "production") {
        const sftp = new Client();
        await sftp.connect(this.sftpConfig);
        await sftp.put(
          buffer,
          path.posix.join(this.sftpConfig.remotePath, remoteFileName)
        ); // Buffer direct !
        await sftp.end();
        return `${this.sftpConfig.remotePath}/${remoteFileName}`;
      }
    } catch (err) {
      throw err;
    }
  }

  // Download avec déchiffrement
  async download(localFileName, remoteFileName) {
    try {
      let stream;
      if (this.env === "development") {
        // ✅ EXTRAIRE LE NOM DU FICHIER SI LE CHEMIN COMPLET EST PASSÉ
        // Ex: "chat-files/1234_file.png" → "1234_file.png"
        const fileNameOnly = remoteFileName.includes("/")
          ? remoteFileName.split("/").pop()
          : remoteFileName;

        stream = await this.minioClient.getObject(this.bucket, fileNameOnly);
      } else if (this.env === "production") {
        const sftp = new Client();
        await sftp.connect(this.sftpConfig);
        stream = await sftp.createReadStream(
          path.posix.join(this.sftpConfig.remotePath, remoteFileName)
        );
        await sftp.end();
      }
      if (this.encrypt) stream = this.decryptStream(stream);
      this.metrics.downloads++;
      return stream;
    } catch (err) {
      this.metrics.errors++;
      throw err;
    }
  }

  // Delete avec retries
  async delete(remoteFileName, retry = 0) {
    try {
      if (this.env === "development") {
        await this.minioClient.removeObject(this.bucket, remoteFileName);
      } else if (this.env === "production") {
        const sftp = new Client();
        await sftp.connect(this.sftpConfig);
        await sftp.delete(
          path.posix.join(this.sftpConfig.remotePath, remoteFileName)
        );
        await sftp.end();
      }
      this.metrics.deletes++;
      return true;
    } catch (err) {
      if (retry < this.maxRetries)
        return this.delete(remoteFileName, retry + 1);
      throw err;
    }
  }

  // Get metrics pour monitoring
  getMetrics() {
    return this.metrics;
  }
}

module.exports = FileStorageService;
