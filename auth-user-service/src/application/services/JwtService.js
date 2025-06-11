const jwt = require("jsonwebtoken");

class JwtService {
  constructor(secret) {
    this.secret = secret;
  }

  generateToken(payload) {
    return jwt.sign(payload, this.secret, { expiresIn: "24h" });
  }

  verifyToken(token) {
    return jwt.verify(token, this.secret);
  }
}

module.exports = JwtService;
