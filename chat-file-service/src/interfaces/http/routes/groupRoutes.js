const express = require("express");
const router = express.Router();

module.exports = function createGroupRoutes(createGroupUseCase) {
  router.post("/", async (req, res) => {
    try {
      const { groupId, name, adminId, members } = req.body;
      const group = await createGroupUseCase.execute({
        groupId,
        name,
        adminId,
        members,
      });
      res.status(201).json({ success: true, data: group });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  return router;
};
