/**
 * Route Request Use Case
 * 
 * Why use cases?
 * - Encapsulates application-specific business logic
 * - Orchestrates between domain and infrastructure
 * - Makes the application behavior explicit
 */
class RouteRequestUseCase {
  constructor(serviceRegistryRepository, proxyService) {
    this.serviceRegistryRepository = serviceRegistryRepository;
    this.proxyService = proxyService;
  }

  async execute(request, response) {
    try {
      const route = await this.serviceRegistryRepository.getRouteForRequest(
        request.path,
        request.method
      );

      if (!route) {
        return {
          success: false,
          statusCode: 404,
          message: 'Route not found'
        };
      }

      // Proxy the request to the target service
      await this.proxyService.proxyRequest(request, response, route);

      return {
        success: true,
        statusCode: 200,
        route: route.path,
        target: route.target
      };
    } catch (error) {
      return {
        success: false,
        statusCode: 500,
        message: 'Internal server error',
        error: error.message
      };
    }
  }
}

module.exports = RouteRequestUseCase;