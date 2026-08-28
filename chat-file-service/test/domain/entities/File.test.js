const File = require('../../../src/domain/entities/File');

describe('File Entity', () => {
  const validFileData = {
    _id: 'file-123',
    originalName: 'photo.jpg',
    fileName: '12345_photo.jpg',
    mimeType: 'image/jpeg',
    size: 1024 * 500, // 500KB
    uploadedBy: 'user-1',
  };

  it('should create a valid file with default values', () => {
    console.log("🧪 Test: should create a valid file with default values");
    const file = new File(validFileData);
    expect(file.originalName).toBe('photo.jpg');
    expect(file.mimeType).toBe('image/jpeg');
    expect(file.status).toBe('UPLOADING');
    expect(file.getFileType()).toBe('IMAGE');
    expect(file.getFileCategory()).toBe('photo');
    expect(file.validate()).toBe(true);
  });

  it('should create a file for upload via static method', () => {
    console.log("🧪 Test: should create a file for upload via static method");
    const file = File.createForUpload('document.pdf', 'application/pdf', 2048, 'user-2', 'conv-1');
    expect(file.originalName).toBe('document.pdf');
    expect(file.mimeType).toBe('application/pdf');
    expect(file.size).toBe(2048);
    expect(file.uploadedBy).toBe('user-2');
    expect(file.conversationId).toBe('conv-1');
    expect(file.status).toBe('UPLOADING');
    expect(file.getFileType()).toBe('PDF');
  });

  it('should fail validation if size is missing or invalid', () => {
    console.log("🧪 Test: should fail validation if size is missing or invalid");
    const file = new File({ ...validFileData, size: 0 });
    expect(() => file.validate()).toThrow('size doit être supérieur à 0');
    
    const tooLarge = new File({ ...validFileData, size: 101 * 1024 * 1024 });
    expect(() => tooLarge.validate()).toThrow('size ne peut pas dépasser 100MB');
  });

  it('should fail validation if originalName is missing', () => {
    console.log("🧪 Test: should fail validation if originalName is missing");
    const file = new File({ ...validFileData, originalName: '' });
    expect(() => file.validate()).toThrow('originalName est requis');
  });

  it('should extract correct metadata for video', () => {
    console.log("🧪 Test: should extract correct metadata for video");
    const videoFile = new File({
      ...validFileData,
      originalName: 'video.mp4',
      mimeType: 'video/mp4',
    });
    expect(videoFile.getFileType()).toBe('VIDEO');
    expect(videoFile.metadata.technical.fileType).toBe('VIDEO');
    expect(videoFile.metadata.technical.category).toBe('video');
    expect(videoFile.metadata.content).toHaveProperty('fps');
    expect(videoFile.metadata.content).toHaveProperty('aspectRatio');
  });

  it('should mark as completed', () => {
    console.log("🧪 Test: should mark as completed");
    const file = new File(validFileData);
    file.markAsCompleted();
    expect(file.status).toBe('COMPLETED');
    expect(file.metadata.processing.status).toBe('completed');
    expect(file.metadata.processing.processed).toBe(true);
  });

  it('should mark as failed', () => {
    console.log("🧪 Test: should mark as failed");
    const file = new File(validFileData);
    const error = new Error('Upload error');
    file.markAsFailed(error);
    expect(file.status).toBe('FAILED');
    expect(file.metadata.processing.status).toBe('failed');
    expect(file.metadata.processing.processingErrors[0].error).toBe('Upload error');
  });

  it('should increment download count', () => {
    console.log("🧪 Test: should increment download count");
    const file = new File(validFileData);
    expect(file.downloadCount).toBe(0);
    
    file.incrementDownloadCount('user-3');
    expect(file.downloadCount).toBe(1);
    expect(file.metadata.usage.firstDownload).toBeDefined();
    expect(file.metadata.usage.lastDownload).toBeDefined();
    expect(file.metadata.usage.downloadHistory[0].userId).toBe('user-3');
  });

  it('should set thumbnail', () => {
    console.log("🧪 Test: should set thumbnail");
    const file = new File(validFileData);
    file.setThumbnail('/path/to/thumb.jpg', 'http://url/thumb.jpg');
    expect(file.metadata.processing.thumbnailGenerated).toBe(true);
    expect(file.metadata.processing.thumbnailPath).toBe('/path/to/thumb.jpg');
    expect(file.metadata.processing.thumbnailUrl).toBe('http://url/thumb.jpg');
  });

  it('should handle permissions correctly for canBeDownloadedBy', () => {
    console.log("🧪 Test: should handle permissions correctly for canBeDownloadedBy");
    const file = new File(validFileData);
    
    // UPLOADING state
    expect(file.canBeDownloadedBy('user-1')).toBe(false);
    
    file.markAsCompleted();
    // Uploader can download
    expect(file.canBeDownloadedBy('user-1')).toBe(true);
    
    // By default, if no allowedUsers/restrictedUsers and no conversation, it returns true in this implementation
    expect(file.canBeDownloadedBy('user-2')).toBe(true);

    // Let's restrict it
    file.metadata.security.restrictedUsers = ['user-2'];
    expect(file.canBeDownloadedBy('user-2')).toBe(false);

    // Public file should bypass restrictions (but in the code, isPublic is checked first, so it should return true)
    file.isPublic = true;
    expect(file.canBeDownloadedBy('user-2')).toBe(true);
    file.isPublic = false;

    // Allowed users
    file.metadata.security.allowedUsers = ['user-3'];
    expect(file.canBeDownloadedBy('user-3')).toBe(true);
    // user-4 is not in allowedUsers so it should return false
    expect(file.canBeDownloadedBy('user-4')).toBe(false);
  });
});
