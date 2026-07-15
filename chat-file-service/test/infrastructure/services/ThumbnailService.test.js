const ThumbnailService = require('../../../src/infrastructure/services/ThumbnailService');

// Mock de fs-extra et sharp
jest.mock('fs-extra', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('fake-image-data')),
  ensureDir: jest.fn().mockResolvedValue(true),
  writeFile: jest.fn().mockResolvedValue(true),
}));

jest.mock('sharp', () => {
  return jest.fn().mockReturnValue({
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized-image-data')),
  });
});

describe('ThumbnailService', () => {
  let fileStorageService;
  let thumbnailService;

  beforeEach(() => {
    fileStorageService = {
      uploadFromBuffer: jest.fn().mockResolvedValue('/thumbnails/test.webp'),
      download: jest.fn().mockResolvedValue({
        on: jest.fn((event, cb) => {
          if (event === 'data') cb(Buffer.from('data'));
          if (event === 'end') cb();
        })
      })
    };

    thumbnailService = new ThumbnailService(fileStorageService);
  });

  it('should detect if file is processable (images only, no SVG)', () => {
    console.log("🧪 Test: should detect if file is processable (images only, no SVG)");
    expect(thumbnailService.isProcessable('image/jpeg')).toBe(true);
    expect(thumbnailService.isProcessable('image/png')).toBe(true);
    expect(thumbnailService.isProcessable('image/svg+xml')).toBe(false);
    expect(thumbnailService.isProcessable('application/pdf')).toBe(false);
  });

  it('should generate 3 thumbnails (small, medium, large) for processable images', async () => {
    console.log("🧪 Test: should generate 3 thumbnails (small, medium, large) for processable images");
    const thumbnails = await thumbnailService.generateThumbnails('/path/to/img.jpg', 'img.jpg', 'file123');

    expect(thumbnails.length).toBe(3);
    expect(fileStorageService.uploadFromBuffer).toHaveBeenCalledTimes(3);
    expect(thumbnails[0].size).toBe('small');
    expect(thumbnails[1].size).toBe('medium');
    expect(thumbnails[2].size).toBe('large');
  });

  it('should output metrics of generation', () => {
    console.log("🧪 Test: should output metrics of generation");
    expect(thumbnailService.getMetrics()).toEqual({ generated: 0, errors: 0 });
  });
});
