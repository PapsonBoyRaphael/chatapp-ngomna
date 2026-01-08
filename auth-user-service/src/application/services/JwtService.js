const jwt = require("jsonwebtoken");

class JwtService {
  constructor(secret) {
    this.secret = secret;
    console.log(
      "🔐 JWT Secret initialisé:",
      this.secret ? "✅ Défini" : "❌ Manquant"
    );
  }

  generateToken(payload, expiresIn = "15m") {
    // ✅ AJOUTER DES LOGS POUR DEBUG
    console.log("🔑 Génération access token:", {
      matricule: payload.matricule,
      expiresIn,
      secretUsed: this.secret ? "✅ Défini" : "❌ Manquant",
    });

    return jwt.sign(payload, this.secret, {
      expiresIn,
      algorithm: "HS256", // ✅ SPÉCIFIER L'ALGORITHME
    });
  }

  generateRefreshToken(payload, expiresIn = "7d") {
    console.log("🔑 Génération refresh token:", {
      matricule: payload.matricule,
      expiresIn,
      secretUsed: this.secret ? "✅ Défini" : "❌ Manquant",
    });

    return jwt.sign(payload, this.secret, {
      expiresIn,
      algorithm: "HS256",
    });
  }

  verifyToken(token) {
    return jwt.verify(token, this.secret, { algorithms: ["HS256"] });
  }
}

module.exports = JwtService;
