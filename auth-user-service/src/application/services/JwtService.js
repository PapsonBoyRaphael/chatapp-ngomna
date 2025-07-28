const jwt = require("jsonwebtoken");

class JwtService {
  constructor(secret) {
    this.secret = secret;
    console.log(
      "🔐 JWT Secret initialisé:",
      this.secret ? "✅ Défini" : "❌ Manquant"
    );
  }

  generateToken(payload) {
    // ✅ AJOUTER DES LOGS POUR DEBUG
    console.log("🔑 Génération token avec payload:", {
      id: payload.id,
      matricule: payload.matricule,
      secretUsed: this.secret ? "✅ Défini" : "❌ Manquant",
    });

    return jwt.sign(payload, this.secret, {
      expiresIn: "74h",
      algorithm: "HS256", // ✅ SPÉCIFIER L'ALGORITHME
    });
  }

  verifyToken(token) {
    return jwt.verify(token, this.secret, { algorithms: ["HS256"] });
  }
}

module.exports = JwtService;
