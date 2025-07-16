const ServiceRegistryRepository = require('../../domain/repositories/ServiceRegistryRepository');

/**
 * In-Memory Service Registry Implementation
 * 
 * Why start with in-memory?
 * - Simple to implement and test
 * - No external dependencies
 * - Can be easily replaced with Redis or database later
 */
class InMemoryServiceRegistry extends ServiceRegistryRepository {
  constructor() {
    super();
    this.routes = new Map();
  }

  async registerRoute(route) {
    this.routes.set(route.path, route);
    return route;
  }

  async getRouteForRequest(path, method) {
    for (const [routePath, route] of this.routes.entries()) {
      if (route.matches(path, method)) {
        return route;
      }
    }
    return null;
  }

  async getAllRoutes() {
    return Array.from(this.routes.values());
  }

  async removeRoute(path) {
    return this.routes.delete(path);
  }
}

module.exports = InMemoryServiceRegistry;