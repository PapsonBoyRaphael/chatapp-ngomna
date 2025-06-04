const jwt = require("jsonwebtoken");

class JwtService {
  constructor(secret) {
    this.secret = secret;
  }

  generateToken(payload) {
    return jwt.sign(payload, this.secret, { expiresIn: "24h" });
  }
}

module.exports = JwtService;
