const Route = require('../../domain/entities/Route');

/**
 * Service Configuration
 * 
 * Why centralize configuration?
 * - Single source of truth for service mappings
 * - Easy to modify routes without changing code
 * - Environment-specific configurations
 */
const createServiceRoutes = () => {
  const routes = [
    // Authentication Service Routes
    new Route('/api/auth/verify', process.env.AUTH_SERVICE_URL, ['POST']),
    new Route('/api/auth/info/:matricule', process.env.AUTH_SERVICE_URL, ['GET']),
    
    // Visibility Service Routes
    new Route('/api/visibility/units/search', process.env.VISIBILITY_SERVICE_URL, ['GET']),
    new Route('/api/visibility/agents/attach', process.env.VISIBILITY_SERVICE_URL, ['POST']),
    new Route('/api/visibility/agents/collaborators', process.env.VISIBILITY_SERVICE_URL, ['GET']),
    new Route('/api/visibility/agents/search', process.env.VISIBILITY_SERVICE_URL, ['GET']),
    
    // Health checks
    new Route('/api/auth/health', process.env.AUTH_SERVICE_URL, ['GET']),
    new Route('/api/visibility/health', process.env.VISIBILITY_SERVICE_URL, ['GET']),
  ];

  return routes;
};

module.exports = {
  createServiceRoutes
};
