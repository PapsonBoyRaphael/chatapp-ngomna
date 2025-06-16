class GetFile {
  constructor(fileRepository) {
    this.fileRepository = fileRepository;
  }

  async execute(fileId) {
    return await this.fileRepository.getFileById(fileId);
  }
}

module.exports = GetFile;
