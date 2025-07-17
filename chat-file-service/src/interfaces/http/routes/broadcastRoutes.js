const express = require("express");
const router = express.Router();

module.exports = function createBroadcastRoutes(createBroadcastUseCase) {
  router.post("/", async (req, res) => {
    try {
      const { broadcastId, name, adminIds, recipientIds } = req.body;
      const broadcast = await createBroadcastUseCase.execute({
        broadcastId,
        name,
        adminIds,
        recipientIds,
      });
      res.status(201).json({ success: true, data: broadcast });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  return router;
};
