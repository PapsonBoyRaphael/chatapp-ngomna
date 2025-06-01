const express = require("express");

const createUserRoutes = (userController) => {
  const router = express.Router();

  router.get("/users", (req, res) => {
    userController.getAllUsers(req, res);
  });

  return router;
};

module.exports = createUserRoutes;
