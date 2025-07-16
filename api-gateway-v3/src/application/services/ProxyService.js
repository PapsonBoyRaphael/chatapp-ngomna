const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Proxy Service
 * 
 * Why separate proxy logic?
 * - Encapsulates proxy configuration
 * - Handles proxy-specific concerns (timeouts, retries)
 * - Makes it easy to add proxy features like load balancing
 */
class ProxyService {
  constructor() {
    this.proxies = new Map();
  }

  getOrCreateProxy(targetUrl) {
    if (!this.proxies.has(targetUrl)) {
      const proxy = createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        timeout: 30000,
        onError: (err, req, res) => {
          console.error('Proxy error:', err);
          res.status(503).json({
            error: 'Service temporarily unavailable',
            message: 'The requested service is currently unavailable'
          });
        },
        onProxyReq: (proxyReq, req, res) => {
          // Log the proxied request
          console.log(`Proxying ${req.method} ${req.path} to ${targetUrl}`);
        }
      });
      
      this.proxies.set(targetUrl, proxy);
    }
    
    return this.proxies.get(targetUrl);
  }

  async proxyRequest(request, response, route) {
    const proxy = this.getOrCreateProxy(route.target);
    
    return new Promise((resolve, reject) => {
      proxy(request, response, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

module.exports = ProxyService;