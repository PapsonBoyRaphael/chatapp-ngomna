class File {
  constructor({
    id,
    originalName,
    fileName,
    mimeType,
    size,
    path,
    url,
    uploadedBy,
    messageId,
    conversationId,
    metadata = {},
    status = "UPLOADING",
    createdAt,
    updatedAt
  }) {
    this.id = id;
    this.originalName = originalName;
    this.fileName = fileName;
    this.mimeType = mimeType;
    this.size = size;
    this.path = path;
    this.url = url;
    this.uploadedBy = uploadedBy;
    this.messageId = messageId;
    this.conversationId = conversationId;
    this.metadata = metadata;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

module.exports = File;
