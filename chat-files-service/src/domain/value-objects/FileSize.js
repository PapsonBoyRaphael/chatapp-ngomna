/**
 * Value Object : FileSize
 * CENADI Chat-Files-Service
 */

const ValueObject = require('./ValueObject');
const { ValidationException } = require('../../shared/exceptions/ValidationException');

class FileSize extends ValueObject {
  static UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
  static MAX_SIZE = 100 * 1024 * 1024; // 100MB

  constructor(sizeInBytes) {
    super(sizeInBytes);
  }

  validate() {
    if (typeof this.value !== 'number' || this.value < 0) {
      throw new ValidationException('Taille de fichier invalide');
    }

    if (this.value === 0) {
      throw new ValidationException('Fichier vide non autorisé');
    }

    if (this.value > FileSize.MAX_SIZE) {
      throw new ValidationException(`Fichier trop volumineux (${this.getReadableSize(FileSize.MAX_SIZE)} maximum)`);
    }
  }

  getBytes() {
    return this.value;
  }

  getKiloBytes() {
    return this.value / 1024;
  }

  getMegaBytes() {
    return this.value / (1024 * 1024);
  }

  getGigaBytes() {
    return this.value / (1024 * 1024 * 1024);
  }

  getReadableSize(size = this.value) {
    let currentSize = size;
    let unitIndex = 0;

    while (currentSize >= 1024 && unitIndex < FileSize.UNITS.length - 1) {
      currentSize /= 1024;
      unitIndex++;
    }

    const formattedSize = unitIndex === 0 ? 
      Math.round(currentSize) : 
      Math.round(currentSize * 100) / 100;

    return `${formattedSize} ${FileSize.UNITS[unitIndex]}`;
  }

  getSizeCategory() {
    if (this.value < 1024 * 1024) { // < 1MB
      return 'small';
    } else if (this.value < 10 * 1024 * 1024) { // < 10MB
      return 'medium';
    } else if (this.value < 100 * 1024 * 1024) { // < 100MB
      return 'large';
    } else {
      return 'very_large';
    }
  }

  isSmall() {
    return this.getSizeCategory() === 'small';
  }

  isMedium() {
    return this.getSizeCategory() === 'medium';
  }

  isLarge() {
    return this.getSizeCategory() === 'large';
  }

  isVeryLarge() {
    return this.getSizeCategory() === 'very_large';
  }

  compareWith(otherSize) {
    const otherSizeObj = otherSize instanceof FileSize ? otherSize : new FileSize(otherSize);
    return this.value - otherSizeObj.value;
  }

  isLargerThan(otherSize) {
    return this.compareWith(otherSize) > 0;
  }

  isSmallerThan(otherSize) {
    return this.compareWith(otherSize) < 0;
  }

  equals(otherSize) {
    return this.compareWith(otherSize) === 0;
  }

  toString() {
    return this.getReadableSize();
  }

  toJSON() {
    return {
      bytes: this.value,
      readable: this.getReadableSize(),
      category: this.getSizeCategory()
    };
  }
}

module.exports = FileSize;
