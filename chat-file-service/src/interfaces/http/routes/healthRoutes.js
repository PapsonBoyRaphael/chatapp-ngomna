const express = require("express");
const { rateLimitMiddleware } = require("../middleware");

function createHealthRoutes(healthController) {
  const router = express.Router();

  // **VALIDATION CRITIQUE : S'ASSURER QUE LE CONTRÔLEUR EXISTE**
  if (!healthController) {
    console.error("❌ HealthController manquant dans createHealthRoutes");
    router.all("*", (req, res) => {
      res.status(503).json({
        success: false,
        message: "Service de santé temporairement indisponible",
        error: "HealthController non initialisé",
      });
    });
    return router;
  }

  // **VALIDATION DES MÉTHODES DU CONTRÔLEUR**
  const requiredMethods = [
    "getHealth",
    "checkMongoDB",
    "checkRedis",
    "checkKafka",
    "getDetailedHealth",
  ];
  const missingMethods = requiredMethods.filter(
    (method) => typeof healthController[method] !== "function"
  );

  if (missingMethods.length > 0) {
    console.error(
      `❌ Méthodes manquantes dans HealthController: ${missingMethods.join(
        ", "
      )}`
    );
    router.all("*", (req, res) => {
      res.status(503).json({
        success: false,
        message: "Service de santé incomplet",
        error: `Méthodes manquantes: ${missingMethods.join(", ")}`,
      });
    });
    return router;
  }

  /**
   * @api {get} /health Health check complet
   * @apiName HealthCheck
   * @apiGroup Health
   */
  router.get("/", rateLimitMiddleware.healthLimit, async (req, res) => {
    try {
      // ✅ CORRIGER: Utiliser getHealth au lieu de getHealthStatus
      await healthController.getHealth(req, res);
    } catch (error) {
      console.error("❌ Erreur route GET /health:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la vérification de santé",
        error: error.message,
      });
    }
  });

  /**
   * @api {get} /health/mongodb État MongoDB
   * @apiName MongoDBHealth
   * @apiGroup Health
   */
  router.get("/mongodb", rateLimitMiddleware.healthLimit, async (req, res) => {
    try {
      const mongoHealth = await healthController.checkMongoDB();
      res.json({
        service: "MongoDB",
        ...mongoHealth,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Erreur MongoDB health:", error);
      res.status(500).json({
        success: false,
        message: "Erreur vérification MongoDB",
        error: error.message,
      });
    }
  });

  /**
   * @api {get} /health/redis État Redis
   * @apiName RedisHealth
   * @apiGroup Health
   */
  router.get("/redis", rateLimitMiddleware.healthLimit, async (req, res) => {
    try {
      const redisHealth = await healthController.checkRedis();
      res.json({
        service: "Redis",
        ...redisHealth,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Erreur Redis health:", error);
      res.status(500).json({
        success: false,
        message: "Erreur vérification Redis",
        error: error.message,
      });
    }
  });

  /**
   * @api {get} /health/kafka État Kafka
   * @apiName KafkaHealth
   * @apiGroup Health
   */
  router.get("/kafka", rateLimitMiddleware.healthLimit, async (req, res) => {
    try {
      const kafkaHealth = await healthController.checkKafka();
      res.json({
        service: "Kafka",
        ...kafkaHealth,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Erreur Kafka health:", error);
      res.status(500).json({
        success: false,
        message: "Erreur vérification Kafka",
        error: error.message,
      });
    }
  });

  /**
   * @api {get} /health/user-service État Service Utilisateurs
   * @apiName UserServiceHealth
   * @apiGroup Health
   */
  router.get(
    "/user-service",
    rateLimitMiddleware.healthLimit,
    async (req, res) => {
      try {
        const userServiceHealth = await healthController.checkUserService();
        res.json({
          service: "User Service",
          ...userServiceHealth,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("❌ Erreur User Service health:", error);
        res.status(500).json({
          success: false,
          message: "Erreur vérification Service Utilisateurs",
          error: error.message,
        });
      }
    }
  );

  /**
   * @api {get} /health/detailed Health check détaillé avec métriques
   * @apiName DetailedHealthCheck
   * @apiGroup Health
   */
  router.get("/detailed", rateLimitMiddleware.healthLimit, async (req, res) => {
    try {
      await healthController.getDetailedHealth(req, res);
    } catch (error) {
      console.error("❌ Erreur detailed health:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la vérification détaillée",
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = createHealthRoutes;
