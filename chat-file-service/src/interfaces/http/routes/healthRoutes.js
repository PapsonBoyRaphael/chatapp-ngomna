const express = require("express");
const rateLimitMiddleware = require("../middleware/rateLimitMiddleware");

function createHealthRoutes(healthController) {
  const router = express.Router();

  /**
   * @api {get} /api/health Health check complet
   * @apiName HealthCheck
   * @apiGroup Health
   */
  router.get(
    "/",
    rateLimitMiddleware.healthLimit,
    async (req, res) => {
      await healthController.getHealthStatus(req, res);
    }
  );

  /**
   * @api {get} /api/health/mongodb État MongoDB
   * @apiName MongoDBHealth
   * @apiGroup Health
   */
  router.get(
    "/mongodb",
    rateLimitMiddleware.healthLimit,
    async (req, res) => {
      await healthController.getMongoDBStatus(req, res);
    }
  );

  /**
   * @api {get} /api/health/redis État Redis
   * @apiName RedisHealth
   * @apiGroup Health
   */
  router.get(
    "/redis",
    rateLimitMiddleware.healthLimit,
    async (req, res) => {
      await healthController.getRedisStatus(req, res);
    }
  );

  /**
   * @api {get} /api/health/kafka État Kafka
   * @apiName KafkaHealth
   * @apiGroup Health
   */
  router.get(
    "/kafka",
    rateLimitMiddleware.healthLimit,
    async (req, res) => {
      await healthController.getKafkaStatus(req, res);
    }
  );

  return router;
}

module.exports = createHealthRoutes;
