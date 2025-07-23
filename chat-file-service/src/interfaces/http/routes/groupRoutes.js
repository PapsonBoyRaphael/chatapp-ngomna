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

  /**
   * @api {get} /groups/search Recherche globale messages/fichiers/conversations/groups/broadcast
   * @apiName SearchOccurrences
   * @apiGroup Groups
   */
  router.get("/search", async (req, res) => {
    try {
      // Ajoute la logique si GroupController possède searchOccurrences
      await groupController.searchOccurrences(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur lors de la recherche globale",
        error: error.message,
      });
    }
  });

  return router;
};
