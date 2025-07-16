class ServiceRegistryRepository {
  async registerRoute(route) {
    throw new Error('Method not implemented');
  }

  async getRouteForRequest(path, method) {
    throw new Error('Method not implemented');
  }

  async getAllRoutes() {
    throw new Error('Method not implemented');
  }

  async removeRoute(path) {
    throw new Error('Method not implemented');
  }
}

module.exports = ServiceRegistryRepository;