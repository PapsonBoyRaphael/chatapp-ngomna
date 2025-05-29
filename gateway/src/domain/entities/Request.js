class Request {
  constructor({ service, method, payload, timestamp }) {
    this.service = service || "";
    this.method = method || "";
    this.payload = payload || {};
    this.timestamp = timestamp || new Date();
  }

  validate() {
    if (!this.service || this.service.length > 50) {
      throw new Error("Service name must not exceed 50 characters");
    }
    if (!["GET", "POST", "PUT", "DELETE"].includes(this.method)) {
      throw new Error("Invalid HTTP method");
    }
  }
}

module.exports = Request;
