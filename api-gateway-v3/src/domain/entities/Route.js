class Route {
  constructor(path, target, methods = ['GET', 'POST', 'PUT', 'DELETE']) {
    this.validatePath(path);
    this.validateTarget(target);
    this.validateMethods(methods);
    
    this.path = path;
    this.target = target;
    this.methods = methods;
    this.createdAt = new Date();
  }

  validatePath(path) {
    if (!path || typeof path !== 'string') {
      throw new Error('Path must be a non-empty string');
    }
    if (!path.startsWith('/')) {
      throw new Error('Path must start with /');
    }
  }

  validateTarget(target) {
    if (!target || typeof target !== 'string') {
      throw new Error('Target must be a non-empty string');
    }
    try {
      new URL(target);
    } catch (error) {
      throw new Error('Target must be a valid URL');
    }
  }

  validateMethods(methods) {
    if (!Array.isArray(methods) || methods.length === 0) {
      throw new Error('Methods must be a non-empty array');
    }
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
    const invalidMethods = methods.filter(method => !validMethods.includes(method));
    if (invalidMethods.length > 0) {
      throw new Error(`Invalid HTTP methods: ${invalidMethods.join(', ')}`);
    }
  }

  matches(requestPath, requestMethod) {
    const pathPattern = this.path.replace(/:\w+/g, '[^/]+');
    const regex = new RegExp(`^${pathPattern}$`);
    return regex.test(requestPath) && this.methods.includes(requestMethod);
  }
}

module.exports = Route;