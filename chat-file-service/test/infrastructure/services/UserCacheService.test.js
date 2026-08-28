const axios = require('axios');
const UserCacheService = require('../../../src/infrastructure/services/UserCacheService');

// Mock axios
jest.mock('axios');

// Mock de la classe UserCache de la lib partagée locale (../../../shared)
jest.mock('../../../shared', () => ({
  UserCache: {
    get: jest.fn(),
    set: jest.fn(),
    batchGet: jest.fn(),
    invalidate: jest.fn(),
    getStats: jest.fn(),
  }
}));

const { UserCache } = require('../../../shared');

describe('UserCacheService', () => {
  let userCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    userCacheService = new UserCacheService({
      authServiceUrl: 'http://auth-service-test',
      timeout: 1000,
    });
  });

  describe('fetchUserInfo', () => {
    it('should return default unknown user if no userId provided', async () => {
    console.log("🧪 Test: should return default unknown user if no userId provided");
      const result = await userCacheService.fetchUserInfo(null);
      expect(result.userId).toBeNull();
      expect(result.name).toBe('Utilisateur inconnu');
    });

    it('should hit Redis cache if info is cached', async () => {
    console.log("🧪 Test: should hit Redis cache if info is cached");
      UserCache.get.mockResolvedValue({
        id: 'user-1',
        nom: 'Dupont',
        prenom: 'Jean',
        fullName: 'Jean Dupont',
        avatar: '/avatar1.png',
        matricule: 'M123',
      });

      const result = await userCacheService.fetchUserInfo('user-1');

      expect(UserCache.get).toHaveBeenCalledWith('user-1');
      expect(axios.get).not.toHaveBeenCalled();
      expect(result.name).toBe('Jean Dupont');
      expect(result.avatar).toBe('/avatar1.png');
    });

    it('should call HTTP Auth Service on cache miss and warm cache', async () => {
    console.log("🧪 Test: should call HTTP Auth Service on cache miss and warm cache");
      UserCache.get.mockResolvedValue(null);
      axios.get.mockResolvedValue({
        data: {
          id: 'user-1',
          nom: 'Dupont',
          prenom: 'Jean',
          avatar: '/avatar1.png',
          matricule: 'M123',
        }
      });

      const result = await userCacheService.fetchUserInfo('user-1');

      expect(UserCache.get).toHaveBeenCalledWith('user-1');
      expect(axios.get).toHaveBeenCalledWith('http://auth-service-test/user-1', { timeout: 1000 });
      expect(UserCache.set).toHaveBeenCalled();
      expect(result.name).toBe('Jean Dupont');
    });

    it('should return fallback object if Auth Service fails', async () => {
    console.log("🧪 Test: should return fallback object if Auth Service fails");
      UserCache.get.mockResolvedValue(null);
      axios.get.mockRejectedValue(new Error('Network Error'));

      const result = await userCacheService.fetchUserInfo('user-1');

      expect(result.userId).toBe('user-1');
      expect(result.name).toBe('Utilisateur inconnu');
    });
  });
});
