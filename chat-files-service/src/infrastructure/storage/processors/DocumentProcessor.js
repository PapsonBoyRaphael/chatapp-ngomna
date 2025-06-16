/**
 * Document Processor - Infrastructure
 * CENADI Chat-Files-Service
 */

const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('DocumentProcessor');

class DocumentProcessor {
  constructor(options = {}) {
    this.options = {
      enableTextExtraction: true,
      enableThumbnails: true,
      enablePreview: true,
      enableMetadataExtraction: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB max
      maxPages: 1000, // Pages max pour PDF
      thumbnailSize: { width: 300, height: 400 },
      previewPages: 5, // Nombre de pages pour preview
      textExtractionLimit: 1000000, // 1MB de texte max
      supportOCR: false, // OCR désactivé par défaut
      ...options
    };

    this.supportedFormats = {
      pdf: ['application/pdf'],
      word: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/msword' // .doc
      ],
      excel: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv'
      ],
      powerpoint: [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
        'application/vnd.ms-powerpoint' // .ppt
      ],
      text: [
        'text/plain',
        'text/html',
        'text/markdown',
        'application/json',
        'application/xml'
      ]
    };

    this.metrics = this.initializeMetrics();
    this.tempDir = path.join(__dirname, '../../../../temp/documents');

    // S'assurer que le dossier temp existe
    this.ensureTempDir();

    logger.info('📄 DocumentProcessor créé', {
      supportedTypes: Object.keys(this.supportedFormats).length,
      enableTextExtraction: this.options.enableTextExtraction,
      enableThumbnails: this.options.enableThumbnails
    });
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.warn('⚠️ Impossible de créer le dossier temp documents:', { error: error.message });
    }
  }

  // Vérifier si le fichier est un document
  isDocumentFile(mimeType, fileName) {
    if (!mimeType) {
      const extension = fileName.split('.').pop().toLowerCase();
      // Vérifier par extension
      return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(extension);
    }

    // Vérifier par MIME type
    return Object.values(this.supportedFormats).some(mimeTypes => 
      mimeTypes.includes(mimeType)
    );
  }

  // Détecter le type de document
  detectDocumentType(mimeType, fileName) {
    for (const [type, mimeTypes] of Object.entries(this.supportedFormats)) {
      if (mimeTypes.includes(mimeType)) {
        return type;
      }
    }

    // Fallback sur l'extension
    const extension = fileName.split('.').pop().toLowerCase();
    if (['pdf'].includes(extension)) return 'pdf';
    if (['doc', 'docx'].includes(extension)) return 'word';
    if (['xls', 'xlsx', 'csv'].includes(extension)) return 'excel';
    if (['ppt', 'pptx'].includes(extension)) return 'powerpoint';
    if (['txt', 'html', 'md', 'json', 'xml'].includes(extension)) return 'text';

    return 'unknown';
  }

  // Traitement principal d'un document
  async processDocument(documentBuffer, options = {}) {
    const startTime = Date.now();
    const documentType = this.detectDocumentType(options.mimeType, options.fileName || '');

    try {
      logger.info('🔄 Traitement document démarré:', {
        type: documentType,
        size: documentBuffer.length,
        fileName: options.fileName
      });

      // Validation
      this.validateDocument(documentBuffer, documentType, options);

      // Traitement selon le type
      const result = await this.processDocumentByType(documentBuffer, documentType, options);

      const duration = Date.now() - startTime;
      this.updateMetrics(documentType, 'processed', duration, documentBuffer.length, true);

      logger.info('✅ Document traité avec succès:', {
        type: documentType,
        originalSize: documentBuffer.length,
        hasText: !!result.text,
        hasMetadata: !!result.metadata,
        versionsCount: result.versions?.length || 0,
        duration: `${Math.round(duration / 1000)}s`
      });

      return {
        type: documentType,
        ...result,
        processingTime: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(documentType, 'processed', duration, documentBuffer.length, false);

      logger.error('❌ Erreur traitement document:', {
        type: documentType,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  // Validation du document
  validateDocument(documentBuffer, documentType, options) {
    const validationErrors = [];

    // Taille de fichier
    if (documentBuffer.length > this.options.maxFileSize) {
      validationErrors.push(`Fichier trop volumineux: ${Math.round(documentBuffer.length / 1024 / 1024)}MB > ${Math.round(this.options.maxFileSize / 1024 / 1024)}MB`);
    }

    // Vérifier si le buffer n'est pas vide
    if (documentBuffer.length === 0) {
      validationErrors.push('Fichier vide');
    }

    // Type de document supporté
    if (documentType === 'unknown') {
      validationErrors.push('Type de document non supporté');
    }

    if (validationErrors.length > 0) {
      throw new Error(`Validation document échouée: ${validationErrors.join(', ')}`);
    }
  }

  // Traitement selon le type de document
  async processDocumentByType(documentBuffer, documentType, options) {
    switch (documentType) {
      case 'pdf':
        return await this.processPDF(documentBuffer, options);
      case 'word':
        return await this.processWord(documentBuffer, options);
      case 'excel':
        return await this.processExcel(documentBuffer, options);
      case 'powerpoint':
        return await this.processPowerPoint(documentBuffer, options);
      case 'text':
        return await this.processText(documentBuffer, options);
      default:
        throw new Error(`Type de document non supporté: ${documentType}`);
    }
  }

  // Traitement PDF
  async processPDF(pdfBuffer, options = {}) {
    try {
      logger.debug('📄 Traitement PDF...');

      const result = {
        metadata: {},
        text: '',
        versions: []
      };

      // Extraction du texte et métadonnées
      if (this.options.enableTextExtraction || this.options.enableMetadataExtraction) {
        const pdfData = await pdf(pdfBuffer);
        
        if (this.options.enableTextExtraction) {
          result.text = this.truncateText(pdfData.text);
        }

        if (this.options.enableMetadataExtraction) {
          result.metadata = {
            pages: pdfData.numpages,
            info: pdfData.info || {},
            version: pdfData.version,
            text_length: pdfData.text?.length || 0
          };

          // Validation du nombre de pages
          if (result.metadata.pages > this.options.maxPages) {
            throw new Error(`PDF trop volumineux: ${result.metadata.pages} pages > ${this.options.maxPages} pages`);
          }
        }
      }

      // Génération de thumbnails (simulation - nécessiterait pdf2pic ou similaire)
      if (this.options.enableThumbnails) {
        const thumbnail = await this.generatePDFThumbnail(pdfBuffer);
        result.versions.push(thumbnail);
      }

      // Génération de preview des premières pages
      if (this.options.enablePreview) {
        const preview = await this.generatePDFPreview(pdfBuffer, result.metadata);
        result.versions.push(preview);
      }

      this.updateMetrics('pdf', 'extracted', 0, result.text?.length || 0, true);
      return result;

    } catch (error) {
      logger.error('❌ Erreur traitement PDF:', { error: error.message });
      throw error;
    }
  }

  // Génération thumbnail PDF (simulation)
  async generatePDFThumbnail(pdfBuffer) {
    try {
      // Dans un vrai projet, on utiliserait pdf2pic ou pdf-poppler
      // Ici on simule avec une image placeholder
      const thumbnailBuffer = await this.generatePlaceholderImage(
        this.options.thumbnailSize.width,
        this.options.thumbnailSize.height,
        'PDF'
      );

      return {
        type: 'thumbnail',
        buffer: thumbnailBuffer,
        width: this.options.thumbnailSize.width,
        height: this.options.thumbnailSize.height,
        format: 'png',
        size: thumbnailBuffer.length
      };

    } catch (error) {
      logger.error('❌ Erreur génération thumbnail PDF:', { error: error.message });
      throw error;
    }
  }

  // Génération preview PDF
  async generatePDFPreview(pdfBuffer, metadata) {
    try {
      const previewPages = Math.min(this.options.previewPages, metadata.pages || 1);
      
      // Simulation - génération d'un preview multi-pages
      const previewBuffer = await this.generatePlaceholderImage(800, 600, `PDF Preview\n${previewPages} pages`);

      return {
        type: 'preview',
        buffer: previewBuffer,
        pages: previewPages,
        width: 800,
        height: 600,
        format: 'png',
        size: previewBuffer.length
      };

    } catch (error) {
      logger.error('❌ Erreur génération preview PDF:', { error: error.message });
      throw error;
    }
  }

  // Traitement Word
  async processWord(wordBuffer, options = {}) {
    try {
      logger.debug('📝 Traitement Word...');

      const result = {
        metadata: {},
        text: '',
        versions: []
      };

      // Extraction du texte avec mammoth
      if (this.options.enableTextExtraction) {
        const extractResult = await mammoth.extractRawText({ buffer: wordBuffer });
        result.text = this.truncateText(extractResult.value);
        
        // Messages d'avertissement de mammoth
        if (extractResult.messages.length > 0) {
          logger.warn('⚠️ Avertissements extraction Word:', { 
            messages: extractResult.messages.map(m => m.message) 
          });
        }
      }

      // Métadonnées basiques
      if (this.options.enableMetadataExtraction) {
        result.metadata = {
          size: wordBuffer.length,
          text_length: result.text?.length || 0,
          word_count: this.countWords(result.text),
          estimated_pages: Math.ceil((result.text?.length || 0) / 3000) // ~3000 chars par page
        };
      }

      // Thumbnail
      if (this.options.enableThumbnails) {
        const thumbnail = await this.generatePlaceholderImage(
          this.options.thumbnailSize.width,
          this.options.thumbnailSize.height,
          'WORD'
        );

        result.versions.push({
          type: 'thumbnail',
          buffer: thumbnail,
          width: this.options.thumbnailSize.width,
          height: this.options.thumbnailSize.height,
          format: 'png',
          size: thumbnail.length
        });
      }

      this.updateMetrics('word', 'extracted', 0, result.text?.length || 0, true);
      return result;

    } catch (error) {
      logger.error('❌ Erreur traitement Word:', { error: error.message });
      throw error;
    }
  }

  // Traitement Excel
  async processExcel(excelBuffer, options = {}) {
    try {
      logger.debug('📊 Traitement Excel...');

      const result = {
        metadata: {},
        text: '',
        data: {},
        versions: []
      };

      // Lecture du fichier Excel
      const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
      
      // Métadonnées
      if (this.options.enableMetadataExtraction) {
        result.metadata = {
          sheets: workbook.SheetNames.length,
          sheet_names: workbook.SheetNames,
          size: excelBuffer.length
        };
      }

      // Extraction des données et texte
      if (this.options.enableTextExtraction) {
        const textParts = [];
        const sheetData = {};

        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          
          // Convertir en JSON pour extraction
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          sheetData[sheetName] = jsonData;

          // Extraire le texte
          const sheetText = jsonData
            .flat()
            .filter(cell => cell !== null && cell !== undefined && cell !== '')
            .map(cell => String(cell))
            .join(' ');
          
          if (sheetText) {
            textParts.push(`Sheet: ${sheetName}\n${sheetText}`);
          }
        }

        result.text = this.truncateText(textParts.join('\n\n'));
        result.data = sheetData;

        // Statistiques supplémentaires
        result.metadata.total_rows = Object.values(sheetData).reduce((sum, sheet) => sum + sheet.length, 0);
        result.metadata.text_length = result.text.length;
      }

      // Thumbnail
      if (this.options.enableThumbnails) {
        const thumbnail = await this.generatePlaceholderImage(
          this.options.thumbnailSize.width,
          this.options.thumbnailSize.height,
          'EXCEL'
        );

        result.versions.push({
          type: 'thumbnail',
          buffer: thumbnail,
          width: this.options.thumbnailSize.width,
          height: this.options.thumbnailSize.height,
          format: 'png',
          size: thumbnail.length
        });
      }

      this.updateMetrics('excel', 'extracted', 0, result.text?.length || 0, true);
      return result;

    } catch (error) {
      logger.error('❌ Erreur traitement Excel:', { error: error.message });
      throw error;
    }
  }

  // Traitement PowerPoint
  async processPowerPoint(pptBuffer, options = {}) {
    try {
      logger.debug('📽️ Traitement PowerPoint...');

      const result = {
        metadata: {
          size: pptBuffer.length,
          format: 'powerpoint'
        },
        text: '',
        versions: []
      };

      // Note: Pour un vrai projet, on utiliserait une librairie comme node-pptx
      // Ici on simule l'extraction basique

      if (this.options.enableTextExtraction) {
        // Simulation d'extraction de texte
        result.text = 'Extraction de texte PowerPoint non implémentée dans cette simulation';
        result.metadata.text_length = result.text.length;
      }

      // Thumbnail
      if (this.options.enableThumbnails) {
        const thumbnail = await this.generatePlaceholderImage(
          this.options.thumbnailSize.width,
          this.options.thumbnailSize.height,
          'PPT'
        );

        result.versions.push({
          type: 'thumbnail',
          buffer: thumbnail,
          width: this.options.thumbnailSize.width,
          height: this.options.thumbnailSize.height,
          format: 'png',
          size: thumbnail.length
        });
      }

      this.updateMetrics('powerpoint', 'extracted', 0, result.text?.length || 0, true);
      return result;

    } catch (error) {
      logger.error('❌ Erreur traitement PowerPoint:', { error: error.message });
      throw error;
    }
  }

  // Traitement fichiers texte
  async processText(textBuffer, options = {}) {
    try {
      logger.debug('📄 Traitement fichier texte...');

      const result = {
        metadata: {},
        text: '',
        versions: []
      };

      // Décodage du texte
      const encoding = options.encoding || 'utf8';
      const fullText = textBuffer.toString(encoding);

      if (this.options.enableTextExtraction) {
        result.text = this.truncateText(fullText);
      }

      if (this.options.enableMetadataExtraction) {
        result.metadata = {
          size: textBuffer.length,
          encoding: encoding,
          text_length: fullText.length,
          line_count: fullText.split('\n').length,
          word_count: this.countWords(fullText),
          char_count: fullText.length
        };
      }

      // Thumbnail
      if (this.options.enableThumbnails) {
        const thumbnail = await this.generatePlaceholderImage(
          this.options.thumbnailSize.width,
          this.options.thumbnailSize.height,
          'TEXT'
        );

        result.versions.push({
          type: 'thumbnail',
          buffer: thumbnail,
          width: this.options.thumbnailSize.width,
          height: this.options.thumbnailSize.height,
          format: 'png',
          size: thumbnail.length
        });
      }

      this.updateMetrics('text', 'extracted', 0, result.text?.length || 0, true);
      return result;

    } catch (error) {
      logger.error('❌ Erreur traitement fichier texte:', { error: error.message });
      throw error;
    }
  }

  // Génération d'image placeholder
  async generatePlaceholderImage(width, height, text) {
    try {
      // Utiliser Sharp pour créer une image placeholder
      const svg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${width}" height="${height}" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" 
                font-family="Arial, sans-serif" font-size="24" fill="#6c757d">
            ${text}
          </text>
        </svg>
      `;

      const buffer = Buffer.from(svg);
      
      return await sharp(buffer)
        .png()
        .toBuffer();

    } catch (error) {
      logger.error('❌ Erreur génération image placeholder:', { error: error.message });
      
      // Fallback: créer un buffer minimal
      return Buffer.alloc(1024, 0);
    }
  }

  // Utilitaires
  truncateText(text) {
    if (!text) return '';
    
    if (text.length <= this.options.textExtractionLimit) {
      return text;
    }

    const truncated = text.substring(0, this.options.textExtractionLimit);
    logger.warn('⚠️ Texte tronqué:', { 
      originalLength: text.length, 
      truncatedLength: truncated.length 
    });
    
    return truncated + '\n\n[... texte tronqué ...]';
  }

  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  // Métriques
  initializeMetrics() {
    return {
      processed: new Map(),
      extracted: new Map(),
      totalDocuments: 0,
      totalTextExtracted: 0,
      totalProcessingTime: 0
    };
  }

  updateMetrics(docType, operation, duration = 0, size = 0, success = true) {
    const metricKey = `${docType}_${operation}`;
    const current = this.metrics[operation].get(metricKey) || { 
      count: 0, 
      totalDuration: 0, 
      totalSize: 0, 
      success: 0, 
      failed: 0 
    };

    current.count++;
    current.totalDuration += duration;
    current.totalSize += size;

    if (success) {
      current.success++;
    } else {
      current.failed++;
    }

    this.metrics[operation].set(metricKey, current);

    if (operation === 'processed') {
      this.metrics.totalDocuments++;
      this.metrics.totalProcessingTime += duration;
    }

    if (operation === 'extracted') {
      this.metrics.totalTextExtracted += size;
    }
  }

  getMetrics() {
    const summary = {
      overview: {
        totalDocuments: this.metrics.totalDocuments,
        totalTextExtracted: this.metrics.totalTextExtracted,
        averageProcessingTime: this.metrics.totalDocuments > 0 
          ? Math.round(this.metrics.totalProcessingTime / this.metrics.totalDocuments) 
          : 0
      },
      byDocumentType: {},
      byOperation: {}
    };

    // Métriques par type de document
    ['pdf', 'word', 'excel', 'powerpoint', 'text'].forEach(docType => {
      const processed = this.metrics.processed.get(`${docType}_processed`) || { count: 0, success: 0, failed: 0, totalDuration: 0 };
      const extracted = this.metrics.extracted.get(`${docType}_extracted`) || { count: 0, totalSize: 0 };

      summary.byDocumentType[docType] = {
        processed: processed.count,
        success: processed.success,
        failed: processed.failed,
        successRate: processed.count > 0 ? Math.round((processed.success / processed.count) * 100) : 0,
        averageProcessingTime: processed.success > 0 ? Math.round(processed.totalDuration / processed.success) : 0,
        textExtracted: extracted.totalSize
      };
    });

    return summary;
  }

  // Nettoyage
  async cleanup() {
    logger.info('🧹 Nettoyage DocumentProcessor...');
    
    try {
      // Nettoyer le dossier temporaire
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        try {
          await fs.unlink(path.join(this.tempDir, file));
        } catch (error) {
          logger.warn('⚠️ Impossible de supprimer fichier temp document:', { 
            file, 
            error: error.message 
          });
        }
      }
    } catch (error) {
      logger.warn('⚠️ Erreur nettoyage dossier temp documents:', { error: error.message });
    }

    logger.info('✅ DocumentProcessor nettoyé');
  }
}

module.exports = DocumentProcessor;
