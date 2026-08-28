module.exports = {
  // Indique à Jest de chercher les fichiers de test dans le dossier test/
  roots: ['<rootDir>/test'],
  
  // Définit l'environnement d'exécution des tests
  testEnvironment: 'node',

  // Fichiers d'initialisation exécutés avant chaque suite de tests
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.js'],

  // Couverture de code
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/config/**',
    '!src/**/interfaces/**' // Optionnel : exclure certaines interfaces si testées autrement
  ],
  coverageDirectory: 'coverage',

  // Pattern pour trouver les fichiers de test
  testMatch: ['**/*.test.js', '**/*.spec.js'],

  // Ignorer certains dossiers lors de la recherche des tests
  testPathIgnorePatterns: ['/node_modules/'],
  
  // Forcer Jest à quitter après les tests (pratique quand il y a des connexions BDD/Redis qui restent ouvertes)
  forceExit: true,
  
  // Détecter les handles non fermés
  detectOpenHandles: true
};
