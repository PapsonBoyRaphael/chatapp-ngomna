/**
 * Index Use Cases Files
 * CENADI Chat-Files-Service
 */

const UploadFileUseCase = require('./UploadFileUseCase');
const DownloadFileUseCase = require('./DownloadFileUseCase');
const DeleteFileUseCase = require('./DeleteFileUseCase');
const GetFileInfoUseCase = require('./GetFileInfoUseCase');

module.exports = {
  UploadFileUseCase,
  DownloadFileUseCase,
  DeleteFileUseCase,
  GetFileInfoUseCase
};
