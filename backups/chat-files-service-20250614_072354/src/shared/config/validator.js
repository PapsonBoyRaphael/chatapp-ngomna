const config = require('./index');

function validateEnvironment() {
  const warnings = [];
  const errors = [];

  // Vérifications critiques
  if (!process.env.PORT) {
    warnings.push('PORT not set, using default 3001');
  }

  if (!process.env.MONGODB_URI) {
    warnings.push('MONGODB_URI not set, using default local MongoDB');
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-super-secret-jwt-key-change-in-production') {
    if (process.env.NODE_ENV === 'production') {
      errors.push('JWT_SECRET must be set to a secure value in production');
    } else {
      warnings.push('Using default JWT_SECRET - change this in production');
    }
  }

  // Vérifier les chemins de fichiers
  const fs = require('fs');
  const paths = [
    config.fileStorage.uploadPath,
    config.fileStorage.thumbnailPath,
    config.fileStorage.processingPath
  ];

  paths.forEach(path => {
    try {
      if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true });
      }
    } catch (error) {
      errors.push(`Cannot create directory: ${path}`);
    }
  });

  // Afficher les warnings
  if (warnings.length > 0) {
    console.warn('⚠️ Configuration Warnings:');
    warnings.forEach(warning => console.warn(`   - ${warning}`));
  }

  // Erreurs critiques
  if (errors.length > 0) {
    console.error('❌ Configuration Errors:');
    errors.forEach(error => console.error(`   - ${error}`));
    throw new Error('Configuration validation failed');
  }

  console.log('✅ Configuration validation passed');
}

module.exports = { validateEnvironment };
