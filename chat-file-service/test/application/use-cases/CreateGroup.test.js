const CreateGroup = require('../../../src/application/use-cases/CreateGroup');

// Mock fetch global pour les appels à l'API de visibilité
global.fetch = jest.fn();

describe('CreateGroup Use Case', () => {
  let conversationRepository;
  let resilientMessageService;
  let createGroup;

  beforeEach(() => {
    conversationRepository = {
      save: jest.fn().mockResolvedValue({ _id: 'group-1', name: 'Mon Groupe' }),
    };

    resilientMessageService = {
      addToStream: jest.fn().mockResolvedValue(true),
    };

    createGroup = new CreateGroup(conversationRepository, resilientMessageService);

    // Remplacer UserCacheService pour éviter les appels réseau
    createGroup.userCacheService = {
      fetchUsersInfo: jest.fn().mockResolvedValue([
        { userId: 'admin-1', nom: 'Admin', prenom: 'User', matricule: 'admin-1', avatar: null, ministere: null, sexe: null },
        { userId: 'member-1', nom: 'Member', prenom: 'One', matricule: 'member-1', avatar: null, ministere: null, sexe: null },
      ]),
    };
  });

  it('should throw an error if required fields are missing', async () => {
    console.log("🧪 Test: should throw an error if required fields are missing");
    await expect(createGroup.execute({ adminId: 'admin-1', members: [] }))
      .rejects.toThrow('name, adminId et members requis');
  });

  it('should create a group with autoCreated=true without permission check', async () => {
    console.log("🧪 Test: should create a group with autoCreated=true without permission check");
    const result = await createGroup.execute({
      name: 'Auto Group',
      adminId: 'admin-1',
      members: [],
      autoCreated: true,
      userInfo: { userId: 'admin-1', nom: 'Admin', prenom: 'User' },
    });

    // Pas d'appel à fetch (pas de vérification de permission)
    expect(global.fetch).not.toHaveBeenCalled();
    // Le repository doit être appelé pour sauvegarder
    expect(conversationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Auto Group', type: 'GROUP' })
    );
    expect(result.name).toBe('Mon Groupe');
  });

  it('should publish to redis stream after group creation', async () => {
    console.log("🧪 Test: should publish to redis stream after group creation");
    await createGroup.execute({
      name: 'Test Group',
      adminId: 'admin-1',
      members: [],
      autoCreated: true,
      userInfo: { userId: 'admin-1' },
    });

    expect(resilientMessageService.addToStream).toHaveBeenCalled();
  });

  it('should set groupId as _id when provided', async () => {
    console.log("🧪 Test: should set groupId as _id when provided");
    await createGroup.execute({
      groupId: 'custom-group-id',
      name: 'Groupe Custom',
      adminId: 'admin-1',
      members: [],
      autoCreated: true,
      userInfo: { userId: 'admin-1' },
    });

    expect(conversationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'custom-group-id' })
    );
  });
});
