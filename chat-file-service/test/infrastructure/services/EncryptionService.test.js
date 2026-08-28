const EncryptionService = require('../../../src/infrastructure/services/EncryptionService');

describe('EncryptionService', () => {
  let encryptionService;

  beforeEach(() => {
    encryptionService = new EncryptionService({ mode: 'none' });
  });

  it('should initialize in none mode by default', () => {
    console.log("🧪 Test: should initialize in none mode by default");
    expect(encryptionService.getMode()).toBe('none');
    expect(encryptionService.isE2EEEnabled()).toBe(false);
  });

  it('should switch mode dynamically', () => {
    console.log("🧪 Test: should switch mode dynamically");
    const result = encryptionService.switchMode('e2ee');
    expect(result.previousMode).toBe('none');
    expect(result.newMode).toBe('e2ee');
    expect(encryptionService.getMode()).toBe('e2ee');
    expect(encryptionService.isE2EEEnabled()).toBe(true);
  });

  it('should throw when switching to invalid mode', () => {
    console.log("🧪 Test: should throw when switching to invalid mode");
    expect(() => encryptionService.switchMode('invalid')).toThrow('Mode invalide');
  });

  describe('Mode: none', () => {
    it('should return plaintext unchanged during encryptText', async () => {
    console.log("🧪 Test: should return plaintext unchanged during encryptText");
      const result = await encryptionService.encryptText('Hello World');
      expect(result.encrypted).toBe(false);
      expect(result.content).toBe('Hello World');
    });

    it('should return decrypted content unchanged during decryptText', async () => {
    console.log("🧪 Test: should return decrypted content unchanged during decryptText");
      const plaintext = await encryptionService.decryptText({ encrypted: false, content: 'Hello World' });
      expect(plaintext).toBe('Hello World');
    });
  });

  describe('Mode: e2ee', () => {
    let keyPair;
    
    beforeAll(() => {
      // Générer une paire de clés pour les tests
      const tempService = new EncryptionService();
      // On génère une petite clé pour aller vite en test
      keyPair = tempService.generateKeyPair();
    });

    beforeEach(() => {
      encryptionService.switchMode('e2ee');
    });

    it('should encrypt and decrypt text successfully', async () => {
    console.log("🧪 Test: should encrypt and decrypt text successfully");
      const plaintext = 'Secret Message E2EE';
      const encrypted = await encryptionService.encryptText(plaintext, keyPair.publicKey);

      expect(encrypted.encrypted).toBe(true);
      expect(encrypted.mode).toBe('e2ee');
      expect(encrypted.encryptedContent).toBeDefined();
      expect(encrypted.encryptionIV).toBeDefined();
      expect(encrypted.encryptionTag).toBeDefined();
      expect(encrypted.encryptedKey).toBeDefined();

      const decrypted = await encryptionService.decryptText(encrypted, keyPair.privateKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt file buffer successfully', async () => {
    console.log("🧪 Test: should encrypt and decrypt file buffer successfully");
      const fileBuffer = Buffer.from('Binary file content');
      const encrypted = await encryptionService.encryptFile(fileBuffer, keyPair.publicKey);

      expect(encrypted.encrypted).toBe(true);
      expect(encrypted.buffer).not.toEqual(fileBuffer);

      const decrypted = await encryptionService.decryptFile(encrypted.buffer, encrypted, keyPair.privateKey);
      expect(decrypted.toString()).toBe('Binary file content');
    });
  });
});
