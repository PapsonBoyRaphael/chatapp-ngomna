/**
 * Value Object : MessageContent
 * CENADI Chat-Files-Service
 */

const ValueObject = require('./ValueObject');
const { ValidationException } = require('../../shared/exceptions/ValidationException');

class MessageContent extends ValueObject {
  static MAX_LENGTH = 10000;
  static MIN_LENGTH = 1;

  constructor(content) {
    super(content);
  }

  validate() {
    if (this.value === null || this.value === undefined) {
      throw new ValidationException('Contenu du message requis');
    }

    if (typeof this.value !== 'string') {
      throw new ValidationException('Le contenu doit être une chaîne de caractères');
    }

    const trimmedContent = this.value.trim();
    
    if (trimmedContent.length === 0) {
      throw new ValidationException('Le contenu ne peut pas être vide');
    }

    if (trimmedContent.length < MessageContent.MIN_LENGTH) {
      throw new ValidationException(`Contenu trop court (${MessageContent.MIN_LENGTH} caractère minimum)`);
    }

    if (trimmedContent.length > MessageContent.MAX_LENGTH) {
      throw new ValidationException(`Contenu trop long (${MessageContent.MAX_LENGTH} caractères maximum)`);
    }

    // Nettoyer le contenu
    this.value = this.sanitizeContent(trimmedContent);
  }

  sanitizeContent(content) {
    // Supprimer les caractères de contrôle dangereux
    let sanitized = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Normaliser les espaces
    sanitized = sanitized.replace(/\s+/g, ' ');
    
    // Limiter les sauts de ligne consécutifs
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
    
    return sanitized.trim();
  }

  isEmpty() {
    return this.value.trim().length === 0;
  }

  getLength() {
    return this.value.length;
  }

  getWordCount() {
    return this.value.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  getLineCount() {
    return this.value.split('\n').length;
  }

  containsUrl() {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return urlRegex.test(this.value);
  }

  getUrls() {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return this.value.match(urlRegex) || [];
  }

  containsMention() {
    const mentionRegex = /@[\w\-\.]+/g;
    return mentionRegex.test(this.value);
  }

  getMentions() {
    const mentionRegex = /@([\w\-\.]+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(this.value)) !== null) {
      mentions.push(match[1]);
    }
    
    return mentions;
  }

  containsHashtag() {
    const hashtagRegex = /#[\w\-]+/g;
    return hashtagRegex.test(this.value);
  }

  getHashtags() {
    const hashtagRegex = /#([\w\-]+)/g;
    const hashtags = [];
    let match;
    
    while ((match = hashtagRegex.exec(this.value)) !== null) {
      hashtags.push(match[1]);
    }
    
    return hashtags;
  }

  containsEmail() {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return emailRegex.test(this.value);
  }

  getEmails() {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return this.value.match(emailRegex) || [];
  }

  isOnlyEmoji() {
    const emojiRegex = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]*$/u;
    return emojiRegex.test(this.value);
  }

  getPreview(length = 100) {
    if (this.value.length <= length) {
      return this.value;
    }
    
    return this.value.substring(0, length).trim() + '...';
  }

  highlightSearchTerms(searchTerms) {
    if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
      return this.value;
    }

    let highlighted = this.value;
    
    for (const term of searchTerms) {
      const regex = new RegExp(`(${term})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark>$1</mark>');
    }
    
    return highlighted;
  }

  toPlainText() {
    // Supprimer le markdown et autres formatages
    return this.value
      .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
      .replace(/\*(.*?)\*/g, '$1')     // Italic
      .replace(/`(.*?)`/g, '$1')       // Code
      .replace(/~~(.*?)~~/g, '$1')     // Strikethrough
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .trim();
  }

  toString() {
    return this.value;
  }

  toJSON() {
    return {
      content: this.value,
      length: this.getLength(),
      wordCount: this.getWordCount(),
      lineCount: this.getLineCount(),
      containsUrl: this.containsUrl(),
      containsMention: this.containsMention(),
      containsHashtag: this.containsHashtag(),
      containsEmail: this.containsEmail(),
      isOnlyEmoji: this.isOnlyEmoji(),
      preview: this.getPreview()
    };
  }
}

module.exports = MessageContent;
