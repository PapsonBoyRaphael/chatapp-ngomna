/**
 * Gateway Controller
 * 
 * Why controllers?
 * - Handles HTTP-specific concerns
 * - Translates HTTP requests to use case calls
 * - Formats responses appropriately
 */
class GatewayController {
  constructor(routeRequestUseCase) {
    this.routeRequestUseCase = routeRequestUseCase;
  }

  async handleRequest(req, res) {
    const result = await this.routeRequestUseCase.execute(req, res);
    
    if (!result.success) {
      return res.status(result.statusCode).json({
        error: result.message,
        details: result.error
      });
    }

    // If successful, the response has already been sent by the proxy
    // This is just for logging purposes
    console.log(`Successfully routed ${req.method} ${req.path} to ${result.target}`);
  }

  async getHealth(req, res) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'api-gateway'
    });
  }
}

module.exports = GatewayController;