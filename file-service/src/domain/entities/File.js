class File {
  constructor({ filename, url, size, uploadedBy }) {
    this.filename = filename || "";
    this.url = url || "";
    this.size = size || 0;
    this.uploadedBy = uploadedBy || "";
  }

  validate() {
    if (!this.filename || this.filename.length > 255) {
      throw new Error("Filename must not exceed 255 characters");
    }
    if (this.size < 0) {
      throw new Error("File size cannot be negative");
    }
  }
}

module.exports = File;
